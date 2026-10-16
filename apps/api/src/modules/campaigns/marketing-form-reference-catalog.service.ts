import { prisma } from "../../database/prisma";
import type { MarketingFormViewer } from "./marketing-form-scope";

export async function listMarketingFormReferenceCatalog(actor: MarketingFormViewer, programId: string, query: { target: "major_id" | "source_id"; page: number; limit: number; search?: string }) {
  if (!actor.institutionProgramIds?.includes(programId)) return { ok: false as const };
  const where = {
    OR: [{ institution_program_id: programId }, { institution_program_id: null }],
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
  };
  const args = { where, select: { id: true, name: true }, orderBy: [{ name: "asc" as const }, { id: "asc" as const }], skip: (query.page - 1) * query.limit, take: query.limit };
  const [rows, total] = query.target === "major_id"
    ? await prisma.$transaction([prisma.majors.findMany(args), prisma.majors.count({ where })])
    : await prisma.$transaction([prisma.lead_sources.findMany(args), prisma.lead_sources.count({ where })]);
  return { ok: true as const, data: { data: rows.map((row) => ({ value: row.id, label: row.name })), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } } };
}
