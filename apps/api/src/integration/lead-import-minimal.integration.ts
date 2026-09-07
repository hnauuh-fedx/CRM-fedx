import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import * as XLSX from "xlsx";

import { prisma } from "../database/prisma";
import { getAuthUser } from "../modules/auth/auth.service";

process.env.NODE_ENV = "test";

const phone = `09${randomInt(10_000_000, 100_000_000)}`;
let createdLeadId: string | null = null;

function workbookBuffer(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Leads");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function verifyMinimalLeadImport() {
  try {
    const { importLeadsFromWorkbook, InvalidLeadImportFileError } = await import("../modules/leads/lead-import.service.js");
    const [director, source] = await Promise.all([
      prisma.users.findUniqueOrThrow({ where: { email: "director@tvu.edu.vn" }, select: { id: true } }),
      prisma.lead_sources.findFirstOrThrow({
        orderBy: { created_at: "asc" },
        select: { name: true, institution_program_id: true },
      }),
    ]);
    const programId = source.institution_program_id ?? (await prisma.institution_programs.findFirstOrThrow({
      where: { status: "active" },
      orderBy: { created_at: "asc" },
      select: { id: true },
    })).id;
    const user = await getAuthUser(director.id);
    assert.ok(user, "Cần tài khoản giám đốc để kiểm thử import lead.");

    await assert.rejects(
      () => importLeadsFromWorkbook(user, workbookBuffer([["fullName"], ["Thiếu dữ liệu"]]), programId),
      (error) => error instanceof InvalidLeadImportFileError && error.message.includes("phone") && error.message.includes("sourceId"),
    );

    const result = await importLeadsFromWorkbook(user, workbookBuffer([
      ["fullName", "phone", "sourceName"],
      ["Nguyễn import tối thiểu", Number(phone.slice(1)), source.name],
    ]), programId);
    assert.deepEqual({ importedRows: result.importedRows, failedRows: result.failedRows }, { importedRows: 1, failedRows: 0 });

    const createdLead = await prisma.leads.findFirstOrThrow({ where: { phone }, select: { id: true, institution_program_id: true } });
    createdLeadId = createdLead.id;
    assert.equal(createdLead.institution_program_id, programId);
    console.log("Minimal lead import verified: required headers, optional columns omitted, source name and numeric phone.");
  } finally {
    if (createdLeadId) {
      await prisma.audit_logs.deleteMany({ where: { entity_type: "lead", entity_id: createdLeadId } });
      await prisma.leads.deleteMany({ where: { id: createdLeadId } });
    }
    await prisma.$disconnect();
  }
}

verifyMinimalLeadImport().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
