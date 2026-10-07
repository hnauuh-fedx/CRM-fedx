import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type InstitutionProgramListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  institutionName?: string;
  sortBy: "createdAt" | "name" | "code" | "status";
  sortOrder: "asc" | "desc";
};

export type InstitutionProgramInput = {
  institutionName: string;
  name: string;
  code: string;
  status: "active" | "inactive" | "archived";
};

const sortFields = {
  createdAt: "created_at",
  name: "name",
  code: "code",
  status: "status",
} as const;

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
}

function serializeProgram(program: {
  id: string;
  name: string;
  code: string;
  status: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  institution_name: string;
  _count: {
    leads: number;
    admission_profiles: number;
    students: number;
    campaigns: number;
    majors: number;
    lead_sources: number;
    kpi_targets: number;
    report_configs: number;
  };
}) {
  const usageCount =
    program._count.leads +
    program._count.admission_profiles +
    program._count.students +
    program._count.campaigns +
    program._count.majors +
    program._count.lead_sources +
    program._count.kpi_targets +
    program._count.report_configs;
  return {
    id: program.id,
    name: program.name,
    code: program.code,
    status: program.status ?? "active",
    institutionName: program.institution_name,
    counts: {
      leads: program._count.leads,
      admissions: program._count.admission_profiles,
      students: program._count.students,
      campaigns: program._count.campaigns,
      majors: program._count.majors,
      leadSources: program._count.lead_sources,
      kpiTargets: program._count.kpi_targets,
      reportConfigs: program._count.report_configs,
      total: usageCount,
    },
    createdAt: program.created_at?.toISOString() ?? null,
    updatedAt: program.updated_at?.toISOString() ?? null,
  };
}

export async function listManagedInstitutionPrograms(query: InstitutionProgramListQuery) {
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.institutionName
      ? { institution_name: { contains: query.institutionName, mode: "insensitive" as const } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
            { institution_name: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.institution_programs.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        created_at: true,
        updated_at: true,
        institution_name: true,
        _count: {
          select: {
            leads: true,
            admission_profiles: true,
            students: true,
            campaigns: true,
            majors: true,
            lead_sources: true,
            kpi_targets: true,
            report_configs: true,
          },
        },
      },
      orderBy: [{ [sortFields[query.sortBy]]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.institution_programs.count({ where }),
  ]);

  return {
    data: items.map(serializeProgram),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    sort: { sortBy: query.sortBy, sortOrder: query.sortOrder },
    filters: {
      search: query.search ?? "",
      status: query.status ?? "",
      institutionName: query.institutionName ?? "",
    },
  };
}

export async function createInstitutionProgram(actor: AuthUser, input: InstitutionProgramInput, ipAddress?: string) {
  const code = normalizeCode(input.code);
  if (await prisma.institution_programs.findUnique({ where: { code }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }
  if (await prisma.institution_programs.findFirst({ where: { institution_name: input.institutionName.trim(), name: input.name.trim() }, select: { id: true } })) {
    return { ok: false as const, reason: "name_exists" as const };
  }

  return prisma.$transaction(async (tx) => {
    const program = await tx.institution_programs.create({
      data: { institution_name: input.institutionName.trim(), name: input.name.trim(), code, status: input.status, updated_at: new Date() },
      select: { id: true },
    });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "institution_program", entity_id: program.id, action: "create", ip_address: ipAddress, new_data: { ...input, code } } });
    return { ok: true as const, data: program };
  });
}

export async function updateInstitutionProgram(actor: AuthUser, id: string, input: InstitutionProgramInput, ipAddress?: string) {
  const existing = await prisma.institution_programs.findUnique({ where: { id }, select: { id: true, institution_name: true, name: true, code: true, status: true } });
  if (!existing) return { ok: false as const, reason: "program_not_found" as const };
  const code = normalizeCode(input.code);
  if (await prisma.institution_programs.findFirst({ where: { code, id: { not: id } }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }
  if (await prisma.institution_programs.findFirst({ where: { institution_name: input.institutionName.trim(), name: input.name.trim(), id: { not: id } }, select: { id: true } })) {
    return { ok: false as const, reason: "name_exists" as const };
  }

  await prisma.$transaction([
    prisma.institution_programs.update({ where: { id }, data: { institution_name: input.institutionName.trim(), name: input.name.trim(), code, status: input.status, updated_at: new Date() } }),
    prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "institution_program", entity_id: id, action: "update", ip_address: ipAddress, old_data: existing, new_data: { ...input, code } } }),
  ]);
  return { ok: true as const, data: { id } };
}

export async function deleteInstitutionProgram(actor: AuthUser, id: string, ipAddress?: string) {
  const program = await prisma.institution_programs.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      institution_name: true,
      _count: { select: { leads: true, admission_profiles: true, students: true, campaigns: true, majors: true, lead_sources: true, kpi_targets: true, report_configs: true } },
    },
  });
  if (!program) return { ok: false as const, reason: "program_not_found" as const };
  const usageCount = Object.values(program._count).reduce((total, count) => total + count, 0);
  if (usageCount > 0) return { ok: false as const, reason: "program_in_use" as const };

  await prisma.$transaction([
    prisma.institution_programs.delete({ where: { id } }),
    prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "institution_program", entity_id: id, action: "delete", ip_address: ipAddress, old_data: program } }),
  ]);
  return { ok: true as const, data: { id } };
}
