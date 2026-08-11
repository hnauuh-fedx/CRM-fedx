import * as XLSX from "xlsx";

import type { AuthUser } from "../auth/auth.types";
import type { LeadInput } from "./lead-management.service";
import { createLead } from "./lead-management.service";
import { prisma } from "../../database/prisma";

type ImportRow = Record<string, unknown>;

export type LeadImportError = {
  row: number;
  fullName: string | null;
  phone: string | null;
  message: string;
};

export type LeadImportResult = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errors: LeadImportError[];
};

type ReferenceMaps = {
  sourcesById: Map<string, string>;
  sourcesByCode: Map<string, string>;
  sourcesByName: Map<string, string>;
  stagesById: Map<string, string>;
  stagesByName: Map<string, string>;
  programsById: Map<string, string>;
  programsByCode: Map<string, string>;
  programsByName: Map<string, string>;
  majorsById: Map<string, string>;
  majorsByCode: Map<string, string>;
  majorsByName: Map<string, string>;
  admissionStatusesById: Map<string, string>;
  admissionStatusesByCode: Map<string, string>;
  admissionStatusesByName: Map<string, string>;
};

const maxRows = 1000;
const headerAliases: Record<string, keyof LeadInput | "sourceCode" | "sourceName" | "stageName" | "programCode" | "programName" | "majorCode" | "majorName" | "admissionStatusCode" | "admissionStatusName"> = {
  fullname: "fullName",
  hoten: "fullName",
  hovaten: "fullName",
  tenungvien: "fullName",
  phone: "phone",
  sodienthoai: "phone",
  dienthoai: "phone",
  sdt: "phone",
  email: "email",
  sourceid: "sourceId",
  nguonid: "sourceId",
  sourcecode: "sourceCode",
  manguon: "sourceCode",
  sourcename: "sourceName",
  nguonlead: "sourceName",
  pipeline_stage_id: "pipelineStageId",
  pipelinestageid: "pipelineStageId",
  stageid: "pipelineStageId",
  tientrinhid: "pipelineStageId",
  stagename: "stageName",
  tientrinh: "stageName",
  status: "status",
  trangthai: "status",
  note: "note",
  ghichu: "note",
  gender: "gender",
  gioitinh: "gender",
  dateofbirth: "dateOfBirth",
  ngaysinh: "dateOfBirth",
  cccd: "cccd",
  birthplace: "birthPlace",
  noisinh: "birthPlace",
  nationality: "nationality",
  quoctich: "nationality",
  ethnicity: "ethnicity",
  dantoc: "ethnicity",
  religion: "religion",
  tongiao: "religion",
  graduationyear: "graduationYear",
  namtotnghiep: "graduationYear",
  highschoolname: "highSchoolName",
  truongthpt: "highSchoolName",
  province: "province",
  tinh: "province",
  district: "district",
  huyen: "district",
  ward: "ward",
  xa: "ward",
  specificaddress: "specificAddress",
  diachicuthe: "specificAddress",
  institutionprogramid: "institutionProgramId",
  programid: "institutionProgramId",
  chuongtrinhid: "institutionProgramId",
  programcode: "programCode",
  machuongtrinh: "programCode",
  programname: "programName",
  chuongtrinh: "programName",
  majorid: "majorId",
  nganhid: "majorId",
  majorcode: "majorCode",
  manganh: "majorCode",
  majorname: "majorName",
  nganh: "majorName",
  admissionstatusid: "admissionStatusId",
  trangthaihosoid: "admissionStatusId",
  admissionstatuscode: "admissionStatusCode",
  matrangthaihoso: "admissionStatusCode",
  admissionstatusname: "admissionStatusName",
  trangthaihoso: "admissionStatusName",
  trainingcode: "trainingCode",
  madt: "trainingCode",
  classcode: "classCode",
  malop: "classCode",
  subjectgroupcode: "subjectGroupCode",
  matohopmon: "subjectGroupCode",
  subjectgroupname: "subjectGroupName",
  tentohopmon: "subjectGroupName",
  score1: "score1",
  diem1: "score1",
  score2: "score2",
  diem2: "score2",
  score3: "score3",
  diem3: "score3",
  admissionscore: "admissionScore",
  diemxettuyen: "admissionScore",
  monthlyrevenue: "monthlyRevenue",
  doanhthuthang: "monthlyRevenue",
  gclid: "gclid",
  tags: "tags",
};

export async function importLeadsFromWorkbook(user: AuthUser, file: Buffer, scopedInstitutionProgramId?: string): Promise<LeadImportResult> {
  const rows = readRows(file);
  const referenceMaps = await getReferenceMaps(scopedInstitutionProgramId);
  const errors: LeadImportError[] = [];
  let importedRows = 0;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const mapped = mapRow(row);
    const normalized = normalizeInput(mapped, referenceMaps, scopedInstitutionProgramId);
    if (!normalized.ok) {
      errors.push({ row: rowNumber, fullName: asText(mapped.fullName) ?? null, phone: asText(mapped.phone) ?? null, message: normalized.message });
      continue;
    }

    const result = await createLead(user, normalized.input);
    if (!result.ok) {
      errors.push({
        row: rowNumber,
        fullName: normalized.input.fullName,
        phone: normalized.input.phone,
        message: resultMessage(result.reason),
      });
      continue;
    }
    importedRows += 1;
  }

  return {
    totalRows: rows.length,
    importedRows,
    failedRows: errors.length,
    errors,
  };
}

function readRows(file: Buffer) {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<ImportRow>(worksheet, { defval: "" });
  return rows.slice(0, maxRows);
}

async function getReferenceMaps(scopedInstitutionProgramId?: string): Promise<ReferenceMaps> {
  const [sources, stages, programs, majors, admissionStatuses] = await prisma.$transaction([
    prisma.lead_sources.findMany({
      where: scopedInstitutionProgramId ? { OR: [{ institution_program_id: scopedInstitutionProgramId }, { institution_program_id: null }] } : undefined,
      select: { id: true, code: true, name: true },
    }),
    prisma.pipeline_stages.findMany({ select: { id: true, name: true } }),
    prisma.institution_programs.findMany({
      where: scopedInstitutionProgramId ? { id: scopedInstitutionProgramId } : { status: "active" },
      select: { id: true, code: true, name: true },
    }),
    prisma.majors.findMany({
      where: scopedInstitutionProgramId ? { OR: [{ institution_program_id: scopedInstitutionProgramId }, { institution_program_id: null }] } : undefined,
      select: { id: true, code: true, name: true },
    }),
    prisma.admission_statuses.findMany({ select: { id: true, code: true, name: true } }),
  ]);

  return {
    sourcesById: mapBy(sources, "id"),
    sourcesByCode: mapBy(sources, "code"),
    sourcesByName: mapBy(sources, "name"),
    stagesById: mapBy(stages, "id"),
    stagesByName: mapBy(stages, "name"),
    programsById: mapBy(programs, "id"),
    programsByCode: mapBy(programs, "code"),
    programsByName: mapBy(programs, "name"),
    majorsById: mapBy(majors, "id"),
    majorsByCode: mapBy(majors, "code"),
    majorsByName: mapBy(majors, "name"),
    admissionStatusesById: mapBy(admissionStatuses, "id"),
    admissionStatusesByCode: mapBy(admissionStatuses, "code"),
    admissionStatusesByName: mapBy(admissionStatuses, "name"),
  };
}

function mapBy<T extends { id: string }, K extends keyof T>(items: T[], key: K) {
  const map = new Map<string, string>();
  for (const item of items) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      map.set(normalizeKey(value), item.id);
    }
  }
  return map;
}

function mapRow(row: ImportRow) {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = headerAliases[normalizeHeader(header)];
    if (key) mapped[key] = asText(value) ?? "";
  }
  return mapped;
}

function normalizeInput(mapped: Record<string, string>, references: ReferenceMaps, scopedInstitutionProgramId?: string) {
  const fullName = asText(mapped.fullName);
  const phone = asText(mapped.phone)?.replace(/\D/g, "");
  const sourceId = resolveReference(mapped.sourceId, references.sourcesById)
    ?? resolveReference(mapped.sourceCode, references.sourcesByCode)
    ?? resolveReference(mapped.sourceName, references.sourcesByName);
  const pipelineStageId = resolveReference(mapped.pipelineStageId, references.stagesById)
    ?? resolveReference(mapped.stageName, references.stagesByName)
    ?? undefined;
  const institutionProgramId = scopedInstitutionProgramId
    ?? resolveReference(mapped.institutionProgramId, references.programsById)
    ?? resolveReference(mapped.programCode, references.programsByCode)
    ?? resolveReference(mapped.programName, references.programsByName)
    ?? undefined;
  const majorId = resolveReference(mapped.majorId, references.majorsById)
    ?? resolveReference(mapped.majorCode, references.majorsByCode)
    ?? resolveReference(mapped.majorName, references.majorsByName)
    ?? undefined;
  const admissionStatusId = resolveReference(mapped.admissionStatusId, references.admissionStatusesById)
    ?? resolveReference(mapped.admissionStatusCode, references.admissionStatusesByCode)
    ?? resolveReference(mapped.admissionStatusName, references.admissionStatusesByName)
    ?? undefined;

  if (!fullName || fullName.length < 2) return { ok: false as const, message: "Thiếu họ tên hoặc họ tên quá ngắn." };
  if (!phone || !/^\d{10}$/.test(phone)) return { ok: false as const, message: "Số điện thoại phải gồm đúng 10 chữ số." };
  if (!sourceId) return { ok: false as const, message: "Không tìm thấy nguồn lead. Dùng sourceId, mã nguồn hoặc tên nguồn hợp lệ." };

  const input: LeadInput = {
    fullName,
    phone,
    sourceId,
    pipelineStageId,
    email: asText(mapped.email),
    gender: asText(mapped.gender),
    dateOfBirth: normalizeDate(mapped.dateOfBirth),
    cccd: asText(mapped.cccd),
    note: asText(mapped.note),
    status: asText(mapped.status),
    birthPlace: asText(mapped.birthPlace),
    nationality: asText(mapped.nationality),
    ethnicity: asText(mapped.ethnicity),
    religion: asText(mapped.religion),
    graduationYear: asText(mapped.graduationYear),
    highSchoolName: asText(mapped.highSchoolName),
    province: asText(mapped.province),
    district: asText(mapped.district),
    ward: asText(mapped.ward),
    specificAddress: asText(mapped.specificAddress),
    institutionProgramId,
    majorId,
    admissionStatusId,
    trainingCode: asText(mapped.trainingCode),
    classCode: asText(mapped.classCode),
    subjectGroupCode: asText(mapped.subjectGroupCode),
    subjectGroupName: asText(mapped.subjectGroupName),
    score1: normalizeDecimal(mapped.score1),
    score2: normalizeDecimal(mapped.score2),
    score3: normalizeDecimal(mapped.score3),
    admissionScore: normalizeDecimal(mapped.admissionScore),
    monthlyRevenue: normalizeDecimal(mapped.monthlyRevenue),
    gclid: asText(mapped.gclid),
    tags: asText(mapped.tags),
  };
  return { ok: true as const, input };
}

function resolveReference(value: string | undefined, map: Map<string, string>) {
  const text = asText(value);
  return text ? map.get(normalizeKey(text)) : undefined;
}

function normalizeHeader(value: string) {
  return normalizeKey(value).replace(/[^a-z0-9_]/g, "");
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
}

function asText(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
  return text || undefined;
}

function normalizeDate(value: unknown) {
  const text = asText(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function normalizeDecimal(value: unknown) {
  const text = asText(value)?.replace(",", ".");
  return text && /^\d+(\.\d{1,2})?$/.test(text) ? text : undefined;
}

function resultMessage(reason: string) {
  if (reason === "phone_already_exists") return "Số điện thoại đã tồn tại trong danh sách lead.";
  if (reason === "source_not_found") return "Nguồn lead không tồn tại.";
  if (reason === "stage_not_found") return "Tiến trình đã chọn không tồn tại.";
  return "Ngành đăng ký hoặc trạng thái hồ sơ không tồn tại.";
}
