import type { AutomationAssignmentResult } from "@admission-crm/shared/automation-assignment";
import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";

export async function visibleAssignmentResults(values: Array<Prisma.JsonValue | null>, scope: Prisma.automation_rulesWhereInput, canOpenRule = false) {
  const results = values.map((value) => value && typeof value === "object" && !Array.isArray(value)
    ? value as unknown as AutomationAssignmentResult : null);
  const ids = [...new Set(results.flatMap((result) => result?.source ? [result.source.executionId] : []))];
  const visible = ids.length ? await prisma.automation_execution_logs.findMany({
    where: { id: { in: ids }, automation_rules: scope, OR: [
      { rule_version_id: null },
      { automation_rule_versions: { is: scope as Prisma.automation_rule_versionsWhereInput } },
    ] }, select: { id: true },
  }) : [];
  const allowed = new Set(visible.map((log) => log.id));
  return results.map((result) => result?.source && !allowed.has(result.source.executionId)
    ? { ...result, source: null, sourceRestricted: true }
    : result?.source ? { ...result, source: { ...result.source, canOpenRule } } : result);
}
