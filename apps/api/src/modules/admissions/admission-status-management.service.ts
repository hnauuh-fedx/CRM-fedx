import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";

const flowSettingKey = "admission_status_flow";

export type AdmissionStatusInput = {
  name: string;
  code: string;
  color?: string;
};

export type AdmissionStatusFlowInput = {
  fromStatusId: string;
  toStatusIds: string[];
};

type AdmissionStatusFlow = Record<string, string[]>;

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

function parseFlow(value?: string | null): AdmissionStatusFlow {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, ids]) => [
        key,
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
      ]),
    );
  } catch {
    return {};
  }
}

async function readFlow() {
  const setting = await prisma.system_settings.findUnique({
    where: { key: flowSettingKey },
    select: { value: true },
  });
  return parseFlow(setting?.value);
}

async function writeFlow(
  user: AuthUser,
  flow: AdmissionStatusFlow,
  oldFlow: AdmissionStatusFlow,
  ipAddress?: string,
) {
  await prisma.$transaction([
    prisma.system_settings.upsert({
      where: { key: flowSettingKey },
      update: { value: JSON.stringify(flow), type: "json" },
      create: { key: flowSettingKey, value: JSON.stringify(flow), type: "json" },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_status_flow",
        action: "update",
        old_data: oldFlow,
        new_data: flow,
        ip_address: ipAddress,
      },
    }),
  ]);
}

export async function getAdmissionStatusFlow() {
  const [statuses, flow] = await Promise.all([
    prisma.admission_statuses.findMany({
      select: { id: true, name: true, code: true, color: true },
      orderBy: { name: "asc" },
    }),
    readFlow(),
  ]);

  const validIds = new Set(statuses.map((status) => status.id));
  return {
    statuses,
    flow: Object.fromEntries(
      Object.entries(flow)
        .filter(([fromStatusId]) => validIds.has(fromStatusId))
        .map(([fromStatusId, toStatusIds]) => [
          fromStatusId,
          toStatusIds.filter((statusId) => validIds.has(statusId) && statusId !== fromStatusId),
        ]),
    ),
  };
}

export async function createAdmissionStatus(
  user: AuthUser,
  input: AdmissionStatusInput,
  ipAddress?: string,
) {
  const code = normalizeCode(input.code);
  const duplicate = await prisma.admission_statuses.findUnique({ where: { code }, select: { id: true } });
  if (duplicate) {
    return { ok: false as const, reason: "status_code_exists" as const };
  }

  const status = await prisma.$transaction(async (tx) => {
    const created = await tx.admission_statuses.create({
      data: { name: input.name.trim(), code, color: input.color?.trim() || null },
      select: { id: true },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_status",
        entity_id: created.id,
        action: "create",
        new_data: { name: input.name.trim(), code, color: input.color?.trim() || null },
        ip_address: ipAddress,
      },
    });
    return created;
  });
  return { ok: true as const, data: status };
}

export async function updateAdmissionStatus(
  user: AuthUser,
  statusId: string,
  input: AdmissionStatusInput,
  ipAddress?: string,
) {
  const existing = await prisma.admission_statuses.findUnique({
    where: { id: statusId },
    select: { id: true, name: true, code: true, color: true },
  });
  if (!existing) {
    return { ok: false as const, reason: "status_not_found" as const };
  }
  const code = normalizeCode(input.code);
  const duplicate = await prisma.admission_statuses.findFirst({
    where: { code, id: { not: statusId } },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false as const, reason: "status_code_exists" as const };
  }

  await prisma.$transaction([
    prisma.admission_statuses.update({
      where: { id: statusId },
      data: { name: input.name.trim(), code, color: input.color?.trim() || null },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_status",
        entity_id: statusId,
        action: "update",
        old_data: existing,
        new_data: { name: input.name.trim(), code, color: input.color?.trim() || null },
        ip_address: ipAddress,
      },
    }),
  ]);
  return { ok: true as const, data: { id: statusId } };
}

export async function deleteAdmissionStatus(user: AuthUser, statusId: string, ipAddress?: string) {
  const existing = await prisma.admission_statuses.findUnique({
    where: { id: statusId },
    select: { id: true, name: true, code: true, color: true, _count: { select: { admission_profiles: true } } },
  });
  if (!existing) {
    return { ok: false as const, reason: "status_not_found" as const };
  }
  if (existing._count.admission_profiles > 0) {
    return { ok: false as const, reason: "status_in_use" as const };
  }

  const oldFlow = await readFlow();
  const nextFlow = Object.fromEntries(
    Object.entries(oldFlow)
      .filter(([fromStatusId]) => fromStatusId !== statusId)
      .map(([fromStatusId, toStatusIds]) => [fromStatusId, toStatusIds.filter((id) => id !== statusId)]),
  );

  await prisma.$transaction([
    prisma.admission_statuses.delete({ where: { id: statusId } }),
    prisma.system_settings.upsert({
      where: { key: flowSettingKey },
      update: { value: JSON.stringify(nextFlow), type: "json" },
      create: { key: flowSettingKey, value: JSON.stringify(nextFlow), type: "json" },
    }),
    prisma.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_status",
        entity_id: statusId,
        action: "delete",
        old_data: existing,
        new_data: { removedFromFlow: true },
        ip_address: ipAddress,
      },
    }),
  ]);
  return { ok: true as const, data: { id: statusId } };
}

export async function updateAdmissionStatusFlow(
  user: AuthUser,
  input: AdmissionStatusFlowInput,
  ipAddress?: string,
) {
  const statuses = await prisma.admission_statuses.findMany({ select: { id: true } });
  const validIds = new Set(statuses.map((status) => status.id));
  if (!validIds.has(input.fromStatusId) || input.toStatusIds.some((id) => !validIds.has(id))) {
    return { ok: false as const, reason: "status_not_found" as const };
  }

  const oldFlow = await readFlow();
  const nextFlow = {
    ...oldFlow,
    [input.fromStatusId]: Array.from(new Set(input.toStatusIds.filter((id) => id !== input.fromStatusId))),
  };
  await writeFlow(user, nextFlow, oldFlow, ipAddress);
  return { ok: true as const, data: { fromStatusId: input.fromStatusId, toStatusIds: nextFlow[input.fromStatusId] } };
}
