import { prisma } from "../../database/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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

export async function hasValidAdmissionReferences(tx: TransactionClient, input: AdmissionInput, leadId?: string) {
  if (!hasAdmissionDetails(input)) {
    if (!leadId) {
      return true;
    }
    const existing = await tx.admission_profiles.findUnique({ where: { lead_id: leadId }, select: { id: true } });
    return !existing || Boolean(input.institutionProgramId);
  }
  if (!input.institutionProgramId || !input.majorId || !input.admissionStatusId) {
    return false;
  }
  const [program, major, status] = await Promise.all([
    tx.institution_programs.findUnique({ where: { id: input.institutionProgramId }, select: { id: true } }),
    tx.majors.findFirst({
      where: {
        id: input.majorId,
        OR: [{ institution_program_id: input.institutionProgramId }, { institution_program_id: null }],
      },
      select: { id: true },
    }),
    tx.admission_statuses.findUnique({ where: { id: input.admissionStatusId }, select: { id: true } }),
  ]);
  return Boolean(program && major && status);
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
}
