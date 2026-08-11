import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";

export type InstitutionProgramListQuery = {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  institutionId?: string;
  programTypeId?: string;
  sortBy: "createdAt" | "name" | "code" | "status";
  sortOrder: "asc" | "desc";
};

export type InstitutionProgramInput = {
  institutionId: string;
  programTypeId: string;
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
  institutions: { id: string; name: string; code: string; status: string | null };
  program_types: { id: string; name: string; code: string };
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
    institution: program.institutions,
    programType: program.program_types,
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
    ...(query.institutionId ? { institution_id: query.institutionId } : {}),
    ...(query.programTypeId ? { program_type_id: query.programTypeId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { code: { contains: query.search, mode: "insensitive" as const } },
            { institutions: { name: { contains: query.search, mode: "insensitive" as const } } },
            { program_types: { name: { contains: query.search, mode: "insensitive" as const } } },
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
        institutions: { select: { id: true, name: true, code: true, status: true } },
        program_types: { select: { id: true, name: true, code: true } },
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
      institutionId: query.institutionId ?? "",
      programTypeId: query.programTypeId ?? "",
    },
  };
}

export async function getInstitutionProgramManagementOptions() {
  const [institutions, programTypes] = await prisma.$transaction([
    prisma.institutions.findMany({ select: { id: true, name: true, code: true, status: true }, orderBy: [{ name: "asc" }] }),
    prisma.program_types.findMany({ select: { id: true, name: true, code: true }, orderBy: [{ name: "asc" }] }),
  ]);
  return { institutions, programTypes, statuses: ["active", "inactive", "archived"] };
}

async function validateReferences(input: InstitutionProgramInput) {
  const [institution, programType] = await prisma.$transaction([
    prisma.institutions.findUnique({ where: { id: input.institutionId }, select: { id: true } }),
    prisma.program_types.findUnique({ where: { id: input.programTypeId }, select: { id: true } }),
  ]);
  if (!institution) return { ok: false as const, reason: "institution_not_found" as const };
  if (!programType) return { ok: false as const, reason: "program_type_not_found" as const };
  return { ok: true as const };
}

export async function createInstitutionProgram(actor: AuthUser, input: InstitutionProgramInput, ipAddress?: string) {
  const refs = await validateReferences(input);
  if (!refs.ok) return refs;
  const code = normalizeCode(input.code);
  if (await prisma.institution_programs.findUnique({ where: { code }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }
  if (await prisma.institution_programs.findFirst({ where: { institution_id: input.institutionId, program_type_id: input.programTypeId, name: input.name.trim() }, select: { id: true } })) {
    return { ok: false as const, reason: "name_exists" as const };
  }

  return prisma.$transaction(async (tx) => {
    const program = await tx.institution_programs.create({
      data: { institution_id: input.institutionId, program_type_id: input.programTypeId, name: input.name.trim(), code, status: input.status, updated_at: new Date() },
      select: { id: true },
    });
    await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "institution_program", entity_id: program.id, action: "create", ip_address: ipAddress, new_data: { ...input, code } } });
    return { ok: true as const, data: program };
  });
}

export async function updateInstitutionProgram(actor: AuthUser, id: string, input: InstitutionProgramInput, ipAddress?: string) {
  const refs = await validateReferences(input);
  if (!refs.ok) return refs;
  const existing = await prisma.institution_programs.findUnique({ where: { id }, select: { id: true, institution_id: true, program_type_id: true, name: true, code: true, status: true } });
  if (!existing) return { ok: false as const, reason: "program_not_found" as const };
  const code = normalizeCode(input.code);
  if (await prisma.institution_programs.findFirst({ where: { code, id: { not: id } }, select: { id: true } })) {
    return { ok: false as const, reason: "code_exists" as const };
  }
  if (await prisma.institution_programs.findFirst({ where: { institution_id: input.institutionId, program_type_id: input.programTypeId, name: input.name.trim(), id: { not: id } }, select: { id: true } })) {
    return { ok: false as const, reason: "name_exists" as const };
  }

  await prisma.$transaction([
    prisma.institution_programs.update({ where: { id }, data: { institution_id: input.institutionId, program_type_id: input.programTypeId, name: input.name.trim(), code, status: input.status, updated_at: new Date() } }),
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
      institution_id: true,
      program_type_id: true,
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
