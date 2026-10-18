import { Prisma } from "../../generated/prisma/client";
import type { AutomationAssigneeWeight, AutomationAssignmentStrategy } from "@admission-crm/shared/automation-assignment";

import { selectLeastLoadedAssignee, selectRoundRobinAssignee, selectWeightedAssignee } from "./automation-assignment-strategy";

export type { AutomationAssigneeWeight, AutomationAssignmentStrategy } from "@admission-crm/shared/automation-assignment";

export type AutomationAssigneePoolInput = {
  candidateIds: string[];
  departmentId?: string;
  institutionProgramId?: string;
  excludedCandidateIds?: string[];
  allowedDepartmentIds?: string[];
  allowAllCandidates?: boolean;
};

export async function listEligibleAutomationAssigneeIds(
  tx: Prisma.TransactionClient,
  input: AutomationAssigneePoolInput,
) {
  const candidateIds = [...new Set(input.candidateIds)];
  if (candidateIds.length === 0 && !input.departmentId) throw new Error("Danh sách nhân viên phân công đang trống.");
  const excludedIds = new Set(input.excludedCandidateIds ?? []);
  const activeUsers = await tx.users.findMany({
    where: {
      ...(candidateIds.length > 0 ? { id: { in: candidateIds } } : {}),
      status: "active",
      deleted_at: null,
      AND: [
        ...(input.departmentId
          ? [{ user_departments: { some: { department_id: input.departmentId } } }]
          : []),
        ...(!input.allowAllCandidates && input.allowedDepartmentIds?.length
          ? [{ user_departments: { some: { department_id: { in: input.allowedDepartmentIds } } } }]
          : []),
      ],
      user_program_roles: {
        some: { ...(input.institutionProgramId ? { institution_program_id: input.institutionProgramId } : {}),
          roles: {
          role_permissions: { some: { permissions: { code: "lead.view_assigned" } } },
        } },
        none: {
          ...(input.institutionProgramId ? { institution_program_id: input.institutionProgramId } : {}),
          roles: {
            role_permissions: {
              some: { permissions: { code: { in: ["lead.view_department", "lead.view_all"] } } },
            },
          },
        },
      },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const activeIds = new Set(activeUsers.map((user) => user.id));
  return (candidateIds.length > 0 ? candidateIds.filter((id) => activeIds.has(id)) : [...activeIds])
    .filter((id) => !excludedIds.has(id));
}

export async function resolveAutomationAssignee(
  tx: Prisma.TransactionClient,
  input: AutomationAssigneePoolInput & {
    ruleId: string;
    nodeId: string;
    strategy: AutomationAssignmentStrategy;
    assigneeWeights?: AutomationAssigneeWeight[];
  },
) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.ruleId}:${input.nodeId}`}))`);
    const eligibleIds = await listEligibleAutomationAssigneeIds(tx, input);
    if (eligibleIds.length === 0) throw new Error("Không còn nhân viên đủ điều kiện trong danh sách phân công.");

    let selectedId: string;
    if (input.strategy === "least_loaded" || input.strategy === "weighted") {
      const loads = await tx.leads.groupBy({
        by: ["assigned_to"],
        where: {
          deleted_at: null,
          assigned_to: { in: eligibleIds },
          ...(input.institutionProgramId ? { institution_program_id: input.institutionProgramId } : {}),
        },
        _count: { _all: true },
      });
      const loadByUser = new Map(loads.map((load) => [load.assigned_to, load._count._all]));
      if (input.strategy === "weighted") {
        const weightByUser = new Map((input.assigneeWeights ?? []).map((item) => [item.assigneeId, item.weight]));
        selectedId = selectWeightedAssignee(eligibleIds.map((id) => ({
          id,
          activeLeadCount: loadByUser.get(id) ?? 0,
          weight: weightByUser.get(id) ?? 1,
        })));
      } else {
        selectedId = selectLeastLoadedAssignee(eligibleIds.map((id) => ({ id, activeLeadCount: loadByUser.get(id) ?? 0 })));
      }
    } else if (input.strategy === "round_robin") {
      const cursor = await tx.automation_assignment_cursors.findUnique({
        where: { rule_id_node_id: { rule_id: input.ruleId, node_id: input.nodeId } },
        select: { last_assignee_id: true },
      });
      selectedId = selectRoundRobinAssignee(eligibleIds, cursor?.last_assignee_id ?? null);
    } else {
      throw new Error("Chiến lược phân công không được hỗ trợ.");
    }

    await tx.automation_assignment_cursors.upsert({
      where: { rule_id_node_id: { rule_id: input.ruleId, node_id: input.nodeId } },
      create: { rule_id: input.ruleId, node_id: input.nodeId, last_assignee_id: selectedId },
      update: { last_assignee_id: selectedId, updated_at: new Date() },
    });
    return selectedId;
}
