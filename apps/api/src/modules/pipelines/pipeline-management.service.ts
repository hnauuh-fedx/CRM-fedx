import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type PipelineListQuery = {
  page: number;
  limit: number;
  search?: string;
  module?: string;
  sortBy: "createdAt" | "name" | "module";
  sortOrder: "asc" | "desc";
};

export type PipelineInput = {
  name: string;
  module?: string;
};

export type PipelineStageInput = {
  name: string;
  position: number;
  color?: string;
  isFinal: boolean;
};

const pipelineSortFields = {
  createdAt: "created_at",
  name: "name",
  module: "module",
} as const;

type PipelineStageRow = {
  id: string;
  name: string;
  position: number | null;
  color: string | null;
  is_final: boolean | null;
  created_at: Date | null;
};

type PipelineRow = {
  id: string;
  name: string;
  module: string | null;
  created_at: Date | null;
  pipeline_stages: PipelineStageRow[];
};

type EnrichedPipelineRow = Omit<PipelineRow, "pipeline_stages"> & {
  pipeline_stages: Array<PipelineStageRow & { leadCount: number; historyCount: number }>;
};

function normalizeColor(color?: string) {
  const value = color?.trim();
  return value || null;
}

function serializeStage(stage: {
  id: string;
  name: string;
  position: number | null;
  color: string | null;
  is_final: boolean | null;
  created_at: Date | null;
  leadCount: number;
  historyCount: number;
}) {
  return {
    id: stage.id,
    name: stage.name,
    position: stage.position ?? 0,
    color: stage.color,
    isFinal: stage.is_final ?? false,
    leadCount: stage.leadCount,
    historyCount: stage.historyCount,
    createdAt: stage.created_at?.toISOString() ?? null,
  };
}

function serializePipeline(pipeline: EnrichedPipelineRow) {
  const stages = pipeline.pipeline_stages.map(serializeStage);
  return {
    id: pipeline.id,
    name: pipeline.name,
    module: pipeline.module,
    stages,
    stageCount: stages.length,
    finalStageCount: stages.filter((stage) => stage.isFinal).length,
    leadCount: stages.reduce((total, stage) => total + stage.leadCount, 0),
    historyCount: stages.reduce((total, stage) => total + stage.historyCount, 0),
    createdAt: pipeline.created_at?.toISOString() ?? null,
  };
}

const pipelineSelect = {
  id: true,
  name: true,
  module: true,
  created_at: true,
  pipeline_stages: {
    select: {
      id: true,
      name: true,
      position: true,
      color: true,
      is_final: true,
      created_at: true,
    },
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
  },
};

async function getStageUsageMaps(stageIds: string[]) {
  if (stageIds.length === 0) {
    return { leadCounts: new Map<string, number>(), historyCounts: new Map<string, number>() };
  }

  const [leadGroups, fromHistoryGroups, toHistoryGroups] = await prisma.$transaction([
    prisma.leads.groupBy({
      by: ["pipeline_stage_id"],
      where: { pipeline_stage_id: { in: stageIds } },
      _count: { _all: true },
    }),
    prisma.lead_status_histories.groupBy({
      by: ["from_stage_id"],
      where: { from_stage_id: { in: stageIds } },
      _count: { _all: true },
    }),
    prisma.lead_status_histories.groupBy({
      by: ["to_stage_id"],
      where: { to_stage_id: { in: stageIds } },
      _count: { _all: true },
    }),
  ]);

  const leadCounts = new Map(
    leadGroups.flatMap((item) => (item.pipeline_stage_id ? [[item.pipeline_stage_id, item._count._all] as const] : [])),
  );
  const historyCounts = new Map<string, number>();
  for (const item of fromHistoryGroups) {
    if (item.from_stage_id) historyCounts.set(item.from_stage_id, (historyCounts.get(item.from_stage_id) ?? 0) + item._count._all);
  }
  for (const item of toHistoryGroups) {
    if (item.to_stage_id) historyCounts.set(item.to_stage_id, (historyCounts.get(item.to_stage_id) ?? 0) + item._count._all);
  }

  return { leadCounts, historyCounts };
}

async function enrichPipelinesWithUsage(pipelines: PipelineRow[]): Promise<EnrichedPipelineRow[]> {
  const stageIds = pipelines.flatMap((pipeline) => pipeline.pipeline_stages.map((stage) => stage.id));
  const { leadCounts, historyCounts } = await getStageUsageMaps(stageIds);
  return pipelines.map((pipeline) => ({
    ...pipeline,
    pipeline_stages: pipeline.pipeline_stages.map((stage) => ({
      ...stage,
      leadCount: leadCounts.get(stage.id) ?? 0,
      historyCount: historyCounts.get(stage.id) ?? 0,
    })),
  }));
}

export async function listManagedPipelines(query: PipelineListQuery) {
  const where = {
    ...(query.module ? { module: query.module } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { module: { contains: query.search, mode: "insensitive" as const } },
            { pipeline_stages: { some: { name: { contains: query.search, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.pipelines.findMany({
      where,
      select: pipelineSelect,
      orderBy: [{ [pipelineSortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.pipelines.count({ where }),
  ]);

  const enrichedItems = await enrichPipelinesWithUsage(items);

  return {
    data: enrichedItems.map(serializePipeline),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: { search: query.search ?? "", module: query.module ?? "" },
  };
}

export async function getPipelineManagementOptions() {
  const modules = await prisma.pipelines.findMany({
    where: { module: { not: null } },
    select: { module: true },
    distinct: ["module"],
    orderBy: { module: "asc" },
    take: 100,
  });
  return { modules: modules.flatMap((item) => (item.module ? [item.module] : [])) };
}

export async function createManagedPipeline(actor: AuthUser, input: PipelineInput, ipAddress?: string) {
  return prisma.$transaction(async (tx) => {
    const pipeline = await tx.pipelines.create({
      data: { name: input.name.trim(), module: input.module?.trim() || null },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "pipeline",
        entity_id: pipeline.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { name: input.name.trim(), module: input.module?.trim() || null },
      },
    });
    return { ok: true as const, data: pipeline };
  });
}

export async function updateManagedPipeline(actor: AuthUser, id: string, input: PipelineInput, ipAddress?: string) {
  const existing = await prisma.pipelines.findUnique({
    where: { id },
    select: { id: true, name: true, module: true },
  });
  if (!existing) return { ok: false as const, reason: "pipeline_not_found" as const };

  await prisma.$transaction([
    prisma.pipelines.update({
      where: { id },
      data: { name: input.name.trim(), module: input.module?.trim() || null },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "pipeline",
        entity_id: id,
        action: "update",
        ip_address: ipAddress,
        old_data: existing,
        new_data: { name: input.name.trim(), module: input.module?.trim() || null },
      },
    }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function deleteManagedPipeline(actor: AuthUser, id: string, ipAddress?: string) {
  const pipeline = await prisma.pipelines.findUnique({
    where: { id },
    select: pipelineSelect,
  });
  if (!pipeline) return { ok: false as const, reason: "pipeline_not_found" as const };
  const [enrichedPipeline] = await enrichPipelinesWithUsage([pipeline]);
  const serialized = serializePipeline(enrichedPipeline);
  if (serialized.leadCount > 0 || serialized.historyCount > 0) {
    return { ok: false as const, reason: "pipeline_in_use" as const };
  }

  await prisma.$transaction([
    prisma.pipelines.delete({ where: { id } }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "pipeline",
        entity_id: id,
        action: "delete",
        ip_address: ipAddress,
        old_data: serialized,
      },
    }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function createManagedPipelineStage(
  actor: AuthUser,
  pipelineId: string,
  input: PipelineStageInput,
  ipAddress?: string,
) {
  const pipeline = await prisma.pipelines.findUnique({ where: { id: pipelineId }, select: { id: true } });
  if (!pipeline) return { ok: false as const, reason: "pipeline_not_found" as const };

  return prisma.$transaction(async (tx) => {
    const stage = await tx.pipeline_stages.create({
      data: {
        pipeline_id: pipelineId,
        name: input.name.trim(),
        position: input.position,
        color: normalizeColor(input.color),
        is_final: input.isFinal,
      },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "pipeline_stage",
        entity_id: stage.id,
        action: "create",
        ip_address: ipAddress,
        new_data: { pipelineId, name: input.name.trim(), position: input.position, color: normalizeColor(input.color), isFinal: input.isFinal },
      },
    });
    return { ok: true as const, data: stage };
  });
}

export async function updateManagedPipelineStage(
  actor: AuthUser,
  pipelineId: string,
  stageId: string,
  input: PipelineStageInput,
  ipAddress?: string,
) {
  const existing = await prisma.pipeline_stages.findFirst({
    where: { id: stageId, pipeline_id: pipelineId },
    select: { id: true, pipeline_id: true, name: true, position: true, color: true, is_final: true },
  });
  if (!existing) return { ok: false as const, reason: "stage_not_found" as const };

  await prisma.$transaction([
    prisma.pipeline_stages.update({
      where: { id: stageId },
      data: {
        name: input.name.trim(),
        position: input.position,
        color: normalizeColor(input.color),
        is_final: input.isFinal,
      },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "pipeline_stage",
        entity_id: stageId,
        action: "update",
        ip_address: ipAddress,
        old_data: {
          pipelineId: existing.pipeline_id,
          name: existing.name,
          position: existing.position,
          color: existing.color,
          isFinal: existing.is_final,
        },
        new_data: { pipelineId, name: input.name.trim(), position: input.position, color: normalizeColor(input.color), isFinal: input.isFinal },
      },
    }),
  ]);
  return { ok: true as const, data: { id: stageId } };
}

export async function deleteManagedPipelineStage(actor: AuthUser, pipelineId: string, stageId: string, ipAddress?: string) {
  const stage = await prisma.pipeline_stages.findFirst({
    where: { id: stageId, pipeline_id: pipelineId },
    select: {
      id: true,
      pipeline_id: true,
      name: true,
      position: true,
      color: true,
      is_final: true,
    },
  });
  if (!stage) return { ok: false as const, reason: "stage_not_found" as const };
  const { leadCounts, historyCounts } = await getStageUsageMaps([stageId]);
  const leadCount = leadCounts.get(stageId) ?? 0;
  const historyCount = historyCounts.get(stageId) ?? 0;
  if (leadCount > 0 || historyCount > 0) {
    return { ok: false as const, reason: "stage_in_use" as const };
  }

  await prisma.$transaction([
    prisma.pipeline_stages.delete({ where: { id: stageId } }),
    prisma.audit_logs.create({
      data: {
        user_id: actor.id,
        entity_type: "pipeline_stage",
        entity_id: stageId,
        action: "delete",
        ip_address: ipAddress,
        old_data: {
          pipelineId: stage.pipeline_id,
          name: stage.name,
          position: stage.position,
          color: stage.color,
          isFinal: stage.is_final,
        },
      },
    }),
  ]);
  return { ok: true as const, data: { id: stageId } };
}
