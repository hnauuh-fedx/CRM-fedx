import { createHash } from "node:crypto";
import { LEAD_PHONE_MAX_LENGTH, splitLeadPhones } from "@admission-crm/shared/lead-phone";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { createLeadInTransaction } from "./application/create-lead.use-case";
import { canAssignLead, canCreateLead } from "./application/lead-authorization";
import { getPipelineStageMarker } from "./domain/lead-lifecycle-status";
import { InvalidLeadImportFileError, type LeadImportResult } from "./lead-import.service";

export type BizflyRow = { row: number; values: Record<string, unknown> };
const columns: Record<string, string> = {
  hovaten: "fullName", sodienthoai: "phone", nguonhv: "sourceName",
  nganhdangky: "majorName", quytrinhtelesalecap1: "stageName",
  nhanvien: "assigneeEmail", nhanvienphutrach: "assigneeEmail", nhanvienphu: "secondaryAssigneeEmail",
  ghichu: "note", email: "email", ngaytao: "createdAt",
};

export function normalizeBizflyKey(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/\s+/g, " ");
}
const headerKey = (value: unknown) => normalizeBizflyKey(String(value ?? "")).replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => String(value ?? "").trim();
// Some Bizfly rows put the secondary assignee in the main cell: "main@x.vn, secondary@x.vn".
const emailList = (value: unknown) => text(value).split(/[,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean);

// Read by column position so repeated Bizfly headers (notably Ghi chú) do not overwrite data.
export function readBizflyRows(file: Buffer): BizflyRow[] | null {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(file, { type: "buffer", cellDates: true }); }
  catch { throw new InvalidLeadImportFileError("Không thể đọc file Excel."); }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
  const headerIndex = rows.slice(0, 10).findIndex((row) => {
    const keys = row.map(headerKey);
    return keys.includes("hovaten") && keys.includes("sodienthoai") && keys.includes("nguonhv");
  });
  if (headerIndex < 0) return null;
  const headers = rows[headerIndex].map(headerKey);
  const isFullExport = headers[0] === "hovaten" && headers[20] === "sodienthoai"
    && headers[106] === "nguonhv" && headers[181] === "ghichu";
  const result: BizflyRow[] = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    if (!row.some((value) => text(value))) return;
    const values: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      const field = columns[header];
      if (field && (!isFullExport || field !== "note" || column === 181)) values[field] = row[column];
    });
    result.push({ row: headerIndex + index + 2, values });
  });
  if (!result.length) throw new InvalidLeadImportFileError("File Excel chưa có dòng dữ liệu lead.");
  if (result.length > 5000) throw new InvalidLeadImportFileError("File Bizfly chỉ hỗ trợ tối đa 5.000 dòng mỗi lần import.");
  return result;
}

export function parseBizflyCreatedAt(value: unknown): Date | undefined {
  if (!text(value)) return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Ngày tạo không hợp lệ.");
    return new Date(value.getTime() - 7 * 60 * 60 * 1000);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error("Ngày tạo không hợp lệ.");
    return parseBizflyCreatedAt(`${parsed.d}/${parsed.m}/${parsed.y} ${parsed.H}:${parsed.M}:${parsed.S}`);
  }
  const source = text(value);
  const timeFirst = source.match(/^(\d{1,2}:\d{1,2}:\d{1,2})\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})$/);
  const raw = timeFirst ? `${timeFirst[2]} ${timeFirst[1]}` : source;
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (local) {
    const [, d, m, y, h = "0", min = "0", sec = "0"] = local;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +sec));
    if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d
      || +h > 23 || +min > 59 || +sec > 59) throw new Error("Ngày tạo không hợp lệ.");
    // Bizfly exports local Vietnamese time (UTC+07:00).
    return new Date(date.getTime() - 7 * 60 * 60 * 1000);
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)) {
    throw new Error("Ngày tạo phải có định dạng ngày/tháng/năm hoặc ISO có múi giờ.");
  }
  if (!z.iso.date().safeParse(raw.slice(0, 10)).success) throw new Error("Ngày tạo không hợp lệ.");
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00+07:00` : raw);
  if (Number.isNaN(date.getTime())) throw new Error("Ngày tạo không hợp lệ.");
  return date;
}

export function resolveBizflyStage(value: unknown, stages: Array<{ id: string; name: string }>) {
  const raw = text(value);
  if (!raw) return undefined;
  // The export does not identify the failed stage; initialize Fail at the existing L0.
  const marker = normalizeBizflyKey(raw) === "fail" ? "L0" : getPipelineStageMarker(raw);
  if (!marker || !["L0", "L1", "L2", "L3", "L4", "L5", "L8"].includes(marker)) {
    throw new Error(`Tiến trình “${raw}” chưa có ánh xạ. Vui lòng dùng L0, L1, L2, L3, L4, L5, L8 hoặc Fail.`);
  }
  const target = marker === "L3" ? "L4" : marker === "L8" ? "L5" : marker;
  const matches = stages.filter((stage) => getPipelineStageMarker(stage.name) === target);
  if (matches.length !== 1) throw new Error(`Không xác định được duy nhất tiến trình ${target} trong pipeline hiện có.`);
  return matches[0].id;
}

function uniqueReference(items: Array<{ id: string; name: string }>, value: string, label: string) {
  const matches = items.filter((item) => normalizeBizflyKey(item.name) === normalizeBizflyKey(value));
  if (matches.length > 1) throw new Error(`${label} “${value}” trùng tên. Vui lòng kiểm tra danh mục.`);
  return matches[0]?.id;
}

export async function importBizflyRows(
  user: AuthUser, rows: BizflyRow[], programId?: string, ipAddress?: string,
  database: Pick<typeof prisma, "institution_programs" | "lead_sources" | "majors" | "pipeline_stages" | "users" | "$transaction"> = prisma,
): Promise<LeadImportResult> {
  if (!programId) throw new InvalidLeadImportFileError("Vui lòng chọn chương trình đang làm việc trước khi import Bizfly.");
  if (!canCreateLead(user) || !user.institutionProgramIds.includes(programId)) {
    throw new InvalidLeadImportFileError("Bạn không có quyền import lead vào chương trình này.");
  }
  const program = await database.institution_programs.findFirst({ where: { id: programId, status: "active" }, select: { id: true } });
  if (!program) throw new InvalidLeadImportFileError("Chương trình đang làm việc không còn hoạt động.");
  const [sources, majors, stages, assignees] = await Promise.all([
    database.lead_sources.findMany({ where: { OR: [{ institution_program_id: programId }, { institution_program_id: null }] }, select: { id: true, name: true, institution_program_id: true } }),
    database.majors.findMany({ where: { institution_program_id: programId }, select: { id: true, name: true } }),
    database.pipeline_stages.findMany({ select: { id: true, name: true } }),
    database.users.findMany({ where: { status: "active", deleted_at: null,
      user_program_roles: { some: { institution_program_id: programId } },
      ...(!(user.accessScope === "ALL" && user.permissions.includes("lead.view_all"))
        ? { user_departments: { some: { department_id: { in: user.departmentIds } } } } : {}),
    }, select: { id: true, email: true } }),
  ]);
  const errors: LeadImportResult["errors"] = [];
  let importedRows = 0;
  for (const row of rows) {
    const v = row.values;
    const fullName = text(v.fullName);
    // Non-standard numbers are imported as-is and highlighted in the UI for review.
    const [phone = "", ...secondaryPhones] = splitLeadPhones(v.phone);
    try {
      if (fullName.length < 2 || fullName.length > 255) throw new Error("Họ và tên phải có từ 2 đến 255 ký tự.");
      if (!phone) throw new Error("Vui lòng nhập số điện thoại.");
      if ([phone, ...secondaryPhones].some((item) => item.length > LEAD_PHONE_MAX_LENGTH)) {
        throw new Error(`Mỗi số điện thoại tối đa ${LEAD_PHONE_MAX_LENGTH} ký tự.`);
      }
      const email = text(v.email) || undefined;
      if (email && !z.email().max(255).safeParse(email).success) throw new Error("Email không hợp lệ.");
      const sourceName = text(v.sourceName);
      const localSources = sources.filter((source) => source.institution_program_id === programId);
      const sourceId = uniqueReference(localSources, sourceName, "Nguồn HV")
        ?? uniqueReference(sources.filter((source) => source.institution_program_id === null), sourceName, "Nguồn HV");
      if (!sourceId) throw new Error(`Không tìm thấy nguồn HV “${sourceName}” trong chương trình đang chọn.`);
      const majorName = text(v.majorName);
      if (majorName.length > 255) throw new Error("Ngành đăng ký không được vượt quá 255 ký tự.");
      const existingMajorId = majorName ? uniqueReference(majors, majorName, "Ngành đăng ký") : undefined;
      const pipelineStageId = resolveBizflyStage(v.stageName, stages);
      const lifecycleStatus = normalizeBizflyKey(text(v.stageName)) === "fail" ? "FAIL" as const : undefined;
      const [assigneeEmail = "", ...extraAssigneeEmails] = emailList(v.assigneeEmail);
      const secondaryColumnEmails = emailList(v.secondaryAssigneeEmail);
      if (extraAssigneeEmails.length > 1) throw new Error("Cột nhân viên chỉ được có tối đa 2 email (nhân viên chính, nhân viên phụ).");
      if (secondaryColumnEmails.length > 1) throw new Error("Cột nhân viên (phụ) chỉ được có 1 email.");
      // The dedicated secondary column wins over a second email in the main cell.
      const secondaryAssigneeEmail = secondaryColumnEmails[0] ?? extraAssigneeEmails[0] ?? "";
      if ((assigneeEmail || secondaryAssigneeEmail) && !canAssignLead(user)) throw new Error("Bạn không có quyền gán nhân viên phụ trách.");
      const resolveAssignee = (email: string, label: string) => {
        if (!email) return undefined;
        if (!z.email().max(255).safeParse(email).success) throw new Error(`Email ${label} không hợp lệ.`);
        // Email identity must not use the accent-stripping normalization of catalog names.
        const matches = assignees.filter((person) => person.email.trim().toLowerCase() === email);
        if (matches.length > 1) throw new Error(`Email ${label} “${email}” trùng tài khoản. Vui lòng kiểm tra danh sách nhân viên.`);
        if (!matches[0]) throw new Error(`Không tìm thấy ${label} có email “${email}” thuộc chương trình và phạm vi được phép.`);
        return matches[0].id;
      };
      const assigneeId = resolveAssignee(assigneeEmail, "nhân viên phụ trách");
      const secondaryAssigneeId = resolveAssignee(secondaryAssigneeEmail, "nhân viên phụ");
      const createdAt = parseBizflyCreatedAt(v.createdAt);
      const note = text(v.note) || undefined;
      const importedMajorId = await database.$transaction(async (tx) => {
        let majorId = existingMajorId;
        if (majorName && !majorId) {
          const code = `BIZFLY-${createHash("sha256").update(normalizeBizflyKey(majorName)).digest("hex").slice(0, 32)}`;
          const major = await tx.majors.upsert({
            where: { institution_program_id_code: { institution_program_id: programId, code } },
            create: { name: majorName, code, institution_program_id: programId }, update: {}, select: { id: true },
          });
          majorId = major.id;
        }
        const result = await createLeadInTransaction(tx, user, {
          fullName, phone, secondaryPhones, sourceId, institutionProgramId: programId, majorId, pipelineStageId, assigneeId, secondaryAssigneeId, note, email,
        }, { ipAddress, importInitialization: { createdAt, lifecycleStatus } });
        if (!result.ok) {
          const messages: Record<string, string> = {
            phone_already_exists: "Số điện thoại đã tồn tại trong chương trình này.",
            assignee_not_telesale: "Nhân viên không đủ quyền nhận lead trong chương trình này.",
            secondary_assignee_invalid: "Nhân viên phụ không đủ quyền nhận lead trong chương trình này.",
            assignment_forbidden: "Bạn không có quyền gán nhân viên phụ trách.",
            permission_denied: "Bạn không có quyền tạo lead.",
          };
          throw new Error(messages[result.reason] ?? "Nguồn, ngành hoặc tiến trình không còn hợp lệ.");
        }
        return majorId;
      });
      if (majorName && !existingMajorId && importedMajorId) majors.push({ id: importedMajorId, name: majorName });
      importedRows++;
    } catch (error) {
      // Each row is atomic: a rejected lead must not leave a newly created major behind.
      errors.push({ row: row.row, fullName: fullName || null, phone: text(v.phone) || null,
        message: error instanceof Error ? error.message : "Không thể import dòng lead này." });
    }
  }
  return { totalRows: rows.length, importedRows, failedRows: errors.length, errors };
}
