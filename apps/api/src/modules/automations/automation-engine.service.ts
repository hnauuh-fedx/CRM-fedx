import { Queue, Worker, type Job } from "bullmq";

import { redisConnection } from "../../config/redis";
import { prisma } from "../../database/prisma";
import type { AutomationGraphData, AutomationNode, AutomationEdge } from "./automation.types";

export type AutomationContext = {
  ruleId: string;
  leadId?: string;
  studentId?: string;
  institutionProgramId?: string;
  payload?: any;
};

export type ExecutionJobData = {
  context: AutomationContext;
  nodeId: string;
  graph: AutomationGraphData;
  logId?: string;
};

export const AUTOMATION_QUEUE_NAME = "automation_engine_queue";
const isAutomationDisabled =
  process.env.DISABLE_AUTOMATION_WORKER === "true" || process.env.NODE_ENV === "test";

export const automationQueue = isAutomationDisabled
  ? null
  : new Queue<ExecutionJobData>(AUTOMATION_QUEUE_NAME, {
      connection: redisConnection as any,
    });

async function enqueueAutomationJob(data: ExecutionJobData, delay = 0) {
  if (!automationQueue) return;
  await automationQueue.add("execute_node", data, {
    delay,
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function triggerAutomation(
  triggerType: string,
  context: Omit<AutomationContext, "ruleId">,
) {
  if (isAutomationDisabled) return;
  // Find all active rules matching this trigger
  const rules = await prisma.automation_rules.findMany({
    where: {
      is_active: true,
      trigger_type: triggerType,
      OR: [
        { institution_program_id: null },
        { institution_program_id: context.institutionProgramId },
      ],
    },
    select: { id: true, graph_data: true },
  });

  for (const rule of rules) {
    const graph = rule.graph_data as unknown as AutomationGraphData;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) continue;

    // Find trigger node
    const triggerNode = graph.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) continue;

  const nextNodes = getNextNodes(triggerNode.id, graph, null);
    
    // Create execution log
    const log = await prisma.automation_execution_logs.create({
      data: {
        rule_id: rule.id,
        status: "processing",
        context_data: JSON.parse(JSON.stringify(context)),
      },
    });

    for (const { nextNodeId } of nextNodes) {
      await enqueueAutomationJob({ context: { ...context, ruleId: rule.id }, nodeId: nextNodeId, graph, logId: log.id });
    }
  }
}

// ------------------------------------------------------------------
// Worker Logic
// ------------------------------------------------------------------

export const automationWorker = isAutomationDisabled
  ? null
  : new Worker<ExecutionJobData>(
      AUTOMATION_QUEUE_NAME,
      async (job: Job<ExecutionJobData>) => {
    const { context, nodeId, graph, logId } = job.data;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    let success = true;
    let nextSourceHandle: string | null = "default";
    let delayMinutes = 0;

    try {
      // Execute based on node type
      switch (node.type) {
        case "condition":
          nextSourceHandle = await evaluateCondition(node, context) ? "default" : "false";
          break;
        case "action_notification":
          await executeNotificationAction(node, context);
          break;
        case "action_assign":
          await executeAssignAction(node, context);
          break;
        case "action_update_stage":
          await executeUpdateStageAction(node, context);
          break;
        case "action_activity":
          await executeActivityAction(node, context);
          break;
        case "delay":
          delayMinutes = node.data.delayMinutes ? Number(node.data.delayMinutes) : 0;
          break;
      }
    } catch (error) {
      success = false;
      if (logId) {
        await prisma.automation_execution_logs.update({
          where: { id: logId },
          data: {
            status: "failed",
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: new Date(),
          },
        });
      }
      throw error; // Let BullMQ handle failure/retry
    }

    if (success) {
      // Find and queue next nodes
      const nextNodes = getNextNodes(node.id, graph, nextSourceHandle);
      
      if (nextNodes.length === 0 && logId && delayMinutes === 0) {
        // Workflow ended here
        await prisma.automation_execution_logs.update({
          where: { id: logId },
          data: { status: "completed", completed_at: new Date() },
        });
      }

      for (const { nextNodeId } of nextNodes) {
        await enqueueAutomationJob(
          { context, nodeId: nextNodeId, graph, logId },
          delayMinutes > 0 ? delayMinutes * 60 * 1000 : 0,
        );
      }
    }
  },
  { connection: redisConnection as any, concurrency: 5 },
);

automationWorker?.on("failed", (job, err) => {
  console.error(`Automation Job failed: ${job?.id}`, err);
});

// ------------------------------------------------------------------
// Helpers & Handlers
// ------------------------------------------------------------------

function getNextNodes(nodeId: string, graph: AutomationGraphData, sourceHandle: string | null) {
  const outgoingEdges = graph.edges.filter((e: AutomationEdge) => e.source === nodeId);
  
  if (sourceHandle === null) {
    // If no specific handle (e.g. from a trigger), get all outgoing
    return outgoingEdges.map((e: AutomationEdge) => ({ nextNodeId: e.target, handle: e.sourceHandle }));
  }

  // Exact handle match (or default)
  return outgoingEdges
    .filter((e: AutomationEdge) => e.sourceHandle === sourceHandle || (!e.sourceHandle && sourceHandle === "default"))
    .map((e: AutomationEdge) => ({ nextNodeId: e.target, handle: e.sourceHandle }));
}

async function evaluateCondition(node: AutomationNode, context: AutomationContext): Promise<boolean> {
  const { field, operator, value } = node.data;
  if (!field || !operator || !context.leadId) return false;
  
  const lead = await prisma.leads.findUnique({ where: { id: context.leadId } });
  if (!lead) return false;

  const actualValue = (lead as any)[field];
  const compareValue = String(value);
  const actualStr = String(actualValue ?? "");

  switch (operator) {
    case "equals": return actualStr === compareValue;
    case "not_equals": return actualStr !== compareValue;
    case "contains": return actualStr.includes(compareValue);
    case "exists": return actualValue !== null && actualValue !== undefined && actualStr !== "";
    default: return false;
  }
}

async function executeNotificationAction(node: AutomationNode, context: AutomationContext) {
  const { title, content, targetRole } = node.data;
  if (!title || !content || !targetRole) return;

  const users = await prisma.users.findMany({
    where: {
      user_roles: { some: { roles: { code: targetRole } } }
    },
    select: { id: true }
  });

  if (users.length > 0) {
    await prisma.notifications.createMany({
      data: users.map((u) => ({
        user_id: u.id,
        title,
        content,
        type: "system",
      })),
    });
  }
}

async function executeAssignAction(node: AutomationNode, context: AutomationContext) {
  const { assignToUserId } = node.data;
  if (!assignToUserId || !context.leadId) return;

  await prisma.leads.update({
    where: { id: context.leadId },
    data: { assigned_to: assignToUserId, updated_at: new Date() },
  });
}

async function executeUpdateStageAction(node: AutomationNode, context: AutomationContext) {
  const { stageId } = node.data;
  if (!stageId || !context.leadId) return;

  await prisma.leads.update({
    where: { id: context.leadId },
    data: { pipeline_stage_id: stageId, updated_at: new Date() },
  });
}

async function executeActivityAction(node: AutomationNode, context: AutomationContext) {
  const { activityType, activityContent } = node.data;
  if (!activityType || !activityContent || !context.leadId) return;

  const lead = await prisma.leads.findUnique({ where: { id: context.leadId }, select: { assigned_to: true } });
  if (!lead?.assigned_to) return; // Only log if there's an assignee

  await prisma.lead_activities.create({
    data: {
      lead_id: context.leadId,
      user_id: lead.assigned_to,
      type: activityType,
      content: activityContent,
    },
  });
}
