import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";
import type { Prisma } from "../../generated/prisma/client";
import { getStudentConversionRequirements, getSystemFieldRequirements } from "../custom-fields/system-field-requirements.service";
import { listStudentConversionCustomFields } from "../leads/lead-custom-fields.service";

export type MissingConversionField = { key: string; label: string };
type Requirements = Record<string, boolean>;
type Client = Pick<Prisma.TransactionClient, "leads" | "system_settings" | "custom_fields" | "entity_tags">;

const leadFields = leadFormFieldCatalog.flatMap((group) => group.fields).filter((field) => !field.readOnly);

export function isFilledValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** A field that is required on input is always required for conversion as well. */
export function requiredStudentConversionFieldKeys(inputRequirements: Requirements, conversionRequirements: Requirements) {
  return leadFields
    .filter((field) => field.requiredLocked || (inputRequirements[field.key] ?? field.isRequired ?? false) || conversionRequirements[field.key])
    .map((field) => field.key);
}

export function collectMissingFields(keys: string[], values: Record<string, unknown>): MissingConversionField[] {
  return leadFields
    .filter((field) => keys.includes(field.key) && !isFilledValue(values[field.key]))
    .map((field) => ({ key: field.key, label: field.label }));
}

async function loadLeadSystemFieldValues(client: Client, leadId: string): Promise<Record<string, unknown>> {
  const lead = await client.leads.findUnique({
    where: { id: leadId },
    select: {
      full_name: true, phone: true, source_id: true, email: true, gender: true, date_of_birth: true, cccd: true,
      note: true, temperature: true, pipeline_stage_id: true, major_id: true, institution_program_id: true,
      student_profiles: {
        select: {
          birth_place: true, cccd_issue_date: true, cccd_issue_place: true, ethnicity: true, religion: true, nationality: true,
          graduation_year: true, graduation_certificate: true, previous_graduation_certificate: true, diploma_issue_place: true,
          graduation_major: true, graduation_rank: true, academic_rank_12: true, conduct_rank_12: true, high_school_name: true,
          high_school_district: true, high_school_province: true, current_job: true, company_name: true,
        },
      },
      addresses: { select: { type: true, province: true, district: true, ward: true, hamlet: true, detail_address: true } },
      relatives: { select: { full_name: true, relationship: true, phone: true, job: true, is_primary: true, addresses: { select: { detail_address: true } } } },
      admission_profiles: {
        select: {
          major_id: true, admission_status_id: true, institution_program_id: true, training_code: true, class_code: true,
          subject_group_code: true, subject_group_name: true, score_1: true, score_2: true, score_3: true, admission_score: true,
          enrollment_batch: true, registration_station: true, decision_number: true, decision_signed_date: true, monthly_revenue: true,
        },
      },
      utm_trackings: { select: { gclid: true }, orderBy: { created_at: "asc" }, take: 1 },
    },
  });
  if (!lead) return {};
  const tagCount = await client.entity_tags.count({ where: { entity_type: "lead", entity_id: leadId } });
  const profile = lead.student_profiles;
  const admission = lead.admission_profiles;
  const address = (type: string) => lead.addresses.find((item) => item.type === type);
  const primaryRelative = lead.relatives.find((relative) => relative.is_primary);
  const secondaryRelative = lead.relatives.find((relative) => !relative.is_primary);
  const current = address("current");
  return {
    fullName: lead.full_name, phone: lead.phone, sourceId: lead.source_id, email: lead.email, gender: lead.gender,
    dateOfBirth: lead.date_of_birth, cccd: lead.cccd, note: lead.note, temperature: lead.temperature,
    pipelineStageId: lead.pipeline_stage_id,
    birthPlace: profile?.birth_place, cccdIssueDate: profile?.cccd_issue_date, cccdIssuePlace: profile?.cccd_issue_place,
    ethnicity: profile?.ethnicity, religion: profile?.religion, nationality: profile?.nationality,
    graduationYear: profile?.graduation_year, graduationCertificate: profile?.graduation_certificate,
    previousGraduationCertificate: profile?.previous_graduation_certificate, diplomaIssuePlace: profile?.diploma_issue_place,
    graduationMajor: profile?.graduation_major, graduationRank: profile?.graduation_rank, academicRank12: profile?.academic_rank_12,
    conductRank12: profile?.conduct_rank_12, highSchoolName: profile?.high_school_name, highSchoolDistrict: profile?.high_school_district,
    highSchoolProvince: profile?.high_school_province, currentJob: profile?.current_job, companyName: profile?.company_name,
    specificAddress: address("specific")?.detail_address, currentAddress: current?.detail_address,
    permanentAddress: address("permanent")?.detail_address, currentResidence: address("residence")?.detail_address,
    hamlet: current?.hamlet, ward: current?.ward, district: current?.district, province: current?.province,
    relative1FullName: primaryRelative?.full_name, relative1Relationship: primaryRelative?.relationship, relative1Phone: primaryRelative?.phone,
    relative1Job: primaryRelative?.job, relative1Address: primaryRelative?.addresses?.detail_address,
    relative2FullName: secondaryRelative?.full_name, relative2Relationship: secondaryRelative?.relationship, relative2Phone: secondaryRelative?.phone,
    relative2Job: secondaryRelative?.job, relative2Address: secondaryRelative?.addresses?.detail_address,
    majorId: admission?.major_id ?? lead.major_id, admissionStatusId: admission?.admission_status_id,
    institutionProgramId: admission?.institution_program_id ?? lead.institution_program_id,
    trainingCode: admission?.training_code, classCode: admission?.class_code, subjectGroupCode: admission?.subject_group_code,
    subjectGroupName: admission?.subject_group_name, score1: admission?.score_1, score2: admission?.score_2, score3: admission?.score_3,
    admissionScore: admission?.admission_score, enrollmentBatch: admission?.enrollment_batch,
    registrationStation: admission?.registration_station, decisionNumber: admission?.decision_number,
    decisionSignedDate: admission?.decision_signed_date, monthlyRevenue: admission?.monthly_revenue,
    gclid: lead.utm_trackings[0]?.gclid, tags: tagCount > 0 ? tagCount : null,
  };
}

/**
 * Lists the configured fields that are still empty on a lead. Reads stored values directly so the
 * check does not depend on what the acting user may view; only field labels are returned.
 */
export async function findMissingStudentConversionFields(client: Client, leadId: string, programId: string | null) {
  // Sequential on purpose: the client may be an interactive transaction.
  const inputRequirements = await getSystemFieldRequirements("LEAD", client);
  const conversionRequirements = await getStudentConversionRequirements(client);
  const keys = requiredStudentConversionFieldKeys(inputRequirements, conversionRequirements);
  const values = keys.length ? await loadLeadSystemFieldValues(client, leadId) : {};
  const customFields = await listStudentConversionCustomFields(client, leadId, programId);
  return [
    ...collectMissingFields(keys, values),
    ...customFields.filter((field) => !isFilledValue(field.value)).map((field) => ({ key: `custom:${field.id}`, label: field.label })),
  ];
}
