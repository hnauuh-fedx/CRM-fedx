import { prisma } from "../../database/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type AutomationRuleVersionSnapshotInput = {
  ruleId: string;
  version: number;
  triggerType: string;
  graphData: object;
  institutionProgramId: string | null;
  createdBy: string | null;
};

export function ensureAutomationRuleVersionSnapshot(
  input: AutomationRuleVersionSnapshotInput,
  client: TransactionClient | typeof prisma = prisma,
) {
  return client.automation_rule_versions.upsert({
    where: {
      rule_id_version: { rule_id: input.ruleId, version: input.version },
    },
    create: {
      rule_id: input.ruleId,
      version: input.version,
      trigger_type: input.triggerType,
      graph_data: input.graphData,
      institution_program_id: input.institutionProgramId,
      created_by: input.createdBy,
    },
    update: {},
    select: { id: true, version: true },
  });
}
