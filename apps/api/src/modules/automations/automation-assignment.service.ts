import { Prisma } from "../../generated/prisma/client";

import { selectLeastLoadedAssignee, selectRoundRobinAssignee } from "./automation-assignment-strategy";

export type AutomationAssignmentStrategy = "least_loaded" | "round_robin";

export async function resolveAutomationAssignee(
  tx: Prisma.TransactionClient,
  input: {
  ruleId: string;
  nodeId: string;
  candidateIds: string[];
  departmentId?: string;
  strategy: AutomationAssignmentStrategy;
  },
) {
  const candidateIds = [...new Set(input.candidateIds)];
  if (candidateIds.length === 0 && !input.departmentId) throw new Error("Danh sách nhân viên phân công đang trống.");

  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.ruleId}:${input.nodeId}`}))`);
    const activeUsers = await tx.users.findMany({
      where: {
        ...(candidateIds.length > 0 ? { id: { in: candidateIds } } : {}),
        ...(input.departmentId ? { user_departments: { some: { department_id: input.departmentId } } } : {}),
        status: "active",
        deleted_at: null,
        user_roles: {
          some: {
            roles: {
              role_permissions: {
                some: { permissions: { code: "lead.view_assigned" } },
                none: { permissions: { code: { in: ["lead.view_department", "lead.view_all"] } } },
              },
            },
          },
        },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const activeIds = new Set(activeUsers.map((user) => user.id));
    const eligibleIds = candidateIds.length > 0 ? candidateIds.filter((id) => activeIds.has(id)) : [...activeIds];
    if (eligibleIds.length === 0) throw new Error("Không còn nhân viên đủ điều kiện trong danh sách phân công.");

    let selectedId: string;
    if (input.strategy === "least_loaded") {
      const loads = await tx.leads.groupBy({
        by: ["assigned_to"],
        where: { deleted_at: null, assigned_to: { in: eligibleIds } },
        _count: { _all: true },
      });
      const loadByUser = new Map(loads.map((load) => [load.assigned_to, load._count._all]));
      selectedId = selectLeastLoadedAssignee(eligibleIds.map((id) => ({ id, activeLeadCount: loadByUser.get(id) ?? 0 })));
    } else {
      const cursor = await tx.automation_assignment_cursors.findUnique({
        where: { rule_id_node_id: { rule_id: input.ruleId, node_id: input.nodeId } },
        select: { last_assignee_id: true },
      });
      selectedId = selectRoundRobinAssignee(eligibleIds, cursor?.last_assignee_id ?? null);
    }

    await tx.automation_assignment_cursors.upsert({
      where: { rule_id_node_id: { rule_id: input.ruleId, node_id: input.nodeId } },
      create: { rule_id: input.ruleId, node_id: input.nodeId, last_assignee_id: selectedId },
      update: { last_assignee_id: selectedId, updated_at: new Date() },
    });
    return selectedId;
}
