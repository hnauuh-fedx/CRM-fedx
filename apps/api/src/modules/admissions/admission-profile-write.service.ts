import { prisma } from "../../database/prisma";
import { leadFormFieldCatalog } from "@admission-crm/shared/lead-form-field-catalog";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Preserve status, payment and conversion fields while patching descriptive admission data. */
export async function patchAdmissionInformation(tx: TransactionClient, leadId: string, programId: string | null, values: Record<string, unknown>) {
  const columns = Object.fromEntries(leadFormFieldCatalog.flatMap((group) => group.fields)
    .filter((field) => field.storage.startsWith("admission_profiles.") && field.key !== "admissionStatusId")
    .map((field) => [field.key, field.storage.split(".")[1]]));
  Object.assign(columns, { majorId: "major_id", admissionCode: "admission_code", trainingType: "training_type", applicationReceivedDate: "application_received_date", telesaleReceivedDate: "telesale_received_date", admissionExpiresAt: "expires_at", studentCardStatus: "student_card_status" });
  const provided = Object.entries(columns).filter(([key]) => Object.hasOwn(values, key));
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (!provided.length) return changes;
  const profile = await tx.admission_profiles.findUnique({ where: { lead_id: leadId } });
  if (profile?.institution_program_id && profile.institution_program_id !== programId) throw new Error("Hồ sơ tuyển sinh không cùng chương trình với Lead.");
  const data: Record<string, unknown> = {};
  for (const [key, column] of provided) {
    const rawBefore = (profile as Record<string, unknown> | null)?.[column] ?? null;
    const before = ["score1", "score2", "score3", "admissionScore", "monthlyRevenue"].includes(key) && rawBefore !== null ? Number(rawBefore) : rawBefore;
    const after = values[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes[key] = { before, after };
    data[column] = after;
  }
  if (Object.keys(data).length) {
    await tx.admission_profiles.upsert({ where: { lead_id: leadId }, create: { lead_id: leadId, institution_program_id: programId, ...data }, update: { ...data, updated_at: new Date() } });
    if (Object.hasOwn(data, "major_id")) await tx.students.updateMany({ where: { lead_id: leadId }, data: { major_id: data.major_id as string | null } });
  }
  return changes;
}

export type AdmissionInput = {
  institutionProgramId?: string;
  majorId?: string;
  admissionStatusId?: string;
  trainingCode?: string;
  classCode?: string;
  subjectGroupCode?: string;
  subjectGroupName?: string;
  score1?: string;
  score2?: string;
  score3?: string;
  admissionScore?: string;
  enrollmentBatch?: string;
  registrationStation?: string;
  decisionNumber?: string;
  decisionSignedDate?: string;
  monthlyRevenue?: string;
};

const emptyToNull = (value?: string) => value?.trim() || null;

function hasAdmissionDetails(input: AdmissionInput) {
  return [
    input.majorId,
    input.admissionStatusId,
    input.trainingCode,
    input.classCode,
    input.subjectGroupCode,
    input.subjectGroupName,
    input.score1,
    input.score2,
    input.score3,
    input.admissionScore,
    input.enrollmentBatch,
    input.registrationStation,
    input.decisionNumber,
    input.decisionSignedDate,
    input.monthlyRevenue,
  ].some(Boolean);
}

export async function hasValidAdmissionReferences(tx: TransactionClient, input: AdmissionInput) {
  if (!hasAdmissionDetails(input)) {
    return true;
  }

  const [program, major, status] = await Promise.all([
    input.institutionProgramId
      ? tx.institution_programs.findUnique({ where: { id: input.institutionProgramId }, select: { id: true } })
      : Promise.resolve(null),
    input.majorId
      ? tx.majors.findFirst({
          where: {
            id: input.majorId,
            ...(input.institutionProgramId
              ? { OR: [{ institution_program_id: input.institutionProgramId }, { institution_program_id: null }] }
              : {}),
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.admissionStatusId
      ? tx.admission_statuses.findUnique({ where: { id: input.admissionStatusId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return (
    (!input.institutionProgramId || Boolean(program))
    && (!input.majorId || Boolean(major))
    && (!input.admissionStatusId || Boolean(status))
  );
}

export async function saveAdmissionProfile(tx: TransactionClient, leadId: string, input: AdmissionInput) {
  const existing = await tx.admission_profiles.findUnique({ where: { lead_id: leadId }, select: { id: true } });
  if (!hasAdmissionDetails(input) && !existing) {
    return;
  }
  const data = {
    institution_program_id: input.institutionProgramId ?? null,
    major_id: input.majorId ?? null,
    admission_status_id: input.admissionStatusId ?? null,
    training_code: emptyToNull(input.trainingCode),
    class_code: emptyToNull(input.classCode),
    subject_group_code: emptyToNull(input.subjectGroupCode),
    subject_group_name: emptyToNull(input.subjectGroupName),
    score_1: input.score1 ?? null,
    score_2: input.score2 ?? null,
    score_3: input.score3 ?? null,
    admission_score: input.admissionScore ?? null,
    enrollment_batch: emptyToNull(input.enrollmentBatch),
    registration_station: emptyToNull(input.registrationStation),
    decision_number: emptyToNull(input.decisionNumber),
    decision_signed_date: input.decisionSignedDate ? new Date(input.decisionSignedDate) : null,
    monthly_revenue: input.monthlyRevenue ?? 0,
    updated_at: new Date(),
  };
  await tx.admission_profiles.upsert({
    where: { lead_id: leadId },
    create: { lead_id: leadId, ...data },
    update: data,
  });
  // The shared lead editor also edits enrolled records; keep academic references aligned.
  await tx.students.updateMany({
    where: { lead_id: leadId },
    data: { institution_program_id: data.institution_program_id, major_id: data.major_id },
  });
}
