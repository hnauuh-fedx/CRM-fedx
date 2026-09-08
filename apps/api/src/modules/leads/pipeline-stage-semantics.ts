import { Prisma } from "../../generated/prisma/client";

export const APPLICATION_PIPELINE_STAGE_MARKER = "(L3)";
export const APPLICATION_PIPELINE_STAGE_LIKE = `%${APPLICATION_PIPELINE_STAGE_MARKER}%`;

export function applicationStageLeadWhere(): Prisma.leadsWhereInput {
  return {
    pipeline_stages: {
      is: {
        name: {
          contains: APPLICATION_PIPELINE_STAGE_MARKER,
          mode: "insensitive",
        },
      },
    },
  };
}
