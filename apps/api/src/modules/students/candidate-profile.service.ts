import { prisma } from "../../database/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type CandidateProfileInput = {
  birthPlace?: string;
  cccdIssueDate?: string;
  cccdIssuePlace?: string;
  nationality?: string;
  ethnicity?: string;
  religion?: string;
  graduationYear?: string;
  graduationCertificate?: string;
  previousGraduationCertificate?: string;
  graduationMajor?: string;
  graduationRank?: string;
  diplomaIssuePlace?: string;
  academicRank12?: string;
  conductRank12?: string;
  highSchoolName?: string;
  highSchoolProvince?: string;
  highSchoolDistrict?: string;
  currentJob?: string;
  companyName?: string;
  specificAddress?: string;
  permanentAddress?: string;
  currentAddress?: string;
  currentResidence?: string;
  province?: string;
  district?: string;
  ward?: string;
  hamlet?: string;
  relative1FullName?: string;
  relative1Relationship?: string;
  relative1Phone?: string;
  relative1Job?: string;
  relative1Address?: string;
  relative2FullName?: string;
  relative2Relationship?: string;
  relative2Phone?: string;
  relative2Job?: string;
  relative2Address?: string;
};

const emptyToNull = (value?: string) => value?.trim() || null;
const hasAny = (...values: Array<string | undefined>) => values.some((value) => Boolean(value?.trim()));

export async function saveCandidateProfile(tx: TransactionClient, leadId: string, input: CandidateProfileInput) {
  const profileData = {
    birth_place: emptyToNull(input.birthPlace),
    nationality: emptyToNull(input.nationality),
    ethnicity: emptyToNull(input.ethnicity),
    religion: emptyToNull(input.religion),
    cccd_issue_date: input.cccdIssueDate ? new Date(input.cccdIssueDate) : null,
    cccd_issue_place: emptyToNull(input.cccdIssuePlace),
    graduation_year: input.graduationYear ? Number(input.graduationYear) : null,
    graduation_certificate: emptyToNull(input.graduationCertificate),
    previous_graduation_certificate: emptyToNull(input.previousGraduationCertificate),
    graduation_major: emptyToNull(input.graduationMajor),
    graduation_rank: emptyToNull(input.graduationRank),
    diploma_issue_place: emptyToNull(input.diplomaIssuePlace),
    academic_rank_12: emptyToNull(input.academicRank12),
    conduct_rank_12: emptyToNull(input.conductRank12),
    high_school_name: emptyToNull(input.highSchoolName),
    high_school_province: emptyToNull(input.highSchoolProvince),
    high_school_district: emptyToNull(input.highSchoolDistrict),
    current_job: emptyToNull(input.currentJob),
    company_name: emptyToNull(input.companyName),
    updated_at: new Date(),
  };
  const hasProfile = hasAny(
    input.birthPlace, input.nationality, input.ethnicity, input.religion, input.cccdIssueDate, input.cccdIssuePlace,
    input.graduationYear, input.graduationCertificate, input.previousGraduationCertificate, input.graduationMajor,
    input.graduationRank, input.diplomaIssuePlace, input.academicRank12, input.conductRank12, input.highSchoolName,
    input.highSchoolProvince, input.highSchoolDistrict, input.currentJob, input.companyName,
  );
  const existingProfile = await tx.student_profiles.findUnique({ where: { lead_id: leadId }, select: { id: true } });
  if (hasProfile || existingProfile) {
    await tx.student_profiles.upsert({
      where: { lead_id: leadId },
      create: { lead_id: leadId, ...profileData },
      update: profileData,
    });
  }

  await saveAddress(tx, leadId, "specific", { detail_address: emptyToNull(input.specificAddress) }, hasAny(input.specificAddress));
  await saveAddress(tx, leadId, "permanent", { detail_address: emptyToNull(input.permanentAddress) }, hasAny(input.permanentAddress));
  await saveAddress(tx, leadId, "current", {
    detail_address: emptyToNull(input.currentAddress),
    province: emptyToNull(input.province),
    district: emptyToNull(input.district),
    ward: emptyToNull(input.ward),
    hamlet: emptyToNull(input.hamlet),
  }, hasAny(input.currentAddress, input.province, input.district, input.ward, input.hamlet));
  await saveAddress(tx, leadId, "residence", { detail_address: emptyToNull(input.currentResidence) }, hasAny(input.currentResidence));

  await saveRelative(tx, leadId, true, {
    fullName: input.relative1FullName,
    relationship: input.relative1Relationship,
    phone: input.relative1Phone,
    job: input.relative1Job,
    address: input.relative1Address,
  });
  await saveRelative(tx, leadId, false, {
    fullName: input.relative2FullName,
    relationship: input.relative2Relationship,
    phone: input.relative2Phone,
    job: input.relative2Job,
    address: input.relative2Address,
  });
}

async function saveAddress(
  tx: TransactionClient,
  leadId: string,
  type: string,
  data: { detail_address: string | null; province?: string | null; district?: string | null; ward?: string | null; hamlet?: string | null },
  hasData: boolean,
) {
  const existing = await tx.addresses.findFirst({ where: { lead_id: leadId, type }, select: { id: true } });
  if (!hasData && !existing) {
    return;
  }
  if (existing) {
    await tx.addresses.update({ where: { id: existing.id }, data });
    return;
  }
  await tx.addresses.create({ data: { lead_id: leadId, type, ...data } });
}

async function saveRelative(
  tx: TransactionClient,
  leadId: string,
  isPrimary: boolean,
  input: { fullName?: string; relationship?: string; phone?: string; job?: string; address?: string },
) {
  const existing = await tx.relatives.findFirst({ where: { lead_id: leadId, is_primary: isPrimary }, select: { id: true, address_id: true } });
  if (!input.fullName?.trim()) {
    if (existing) {
      await tx.relatives.delete({ where: { id: existing.id } });
    }
    return;
  }
  let addressId = existing?.address_id ?? null;
  if (input.address?.trim()) {
    if (addressId) {
      await tx.addresses.update({ where: { id: addressId }, data: { detail_address: input.address.trim() } });
    } else {
      addressId = (await tx.addresses.create({
        data: { lead_id: leadId, type: isPrimary ? "relative_primary" : "relative_secondary", detail_address: input.address.trim() },
        select: { id: true },
      })).id;
    }
  }
  const data = {
    full_name: input.fullName.trim(),
    relationship: emptyToNull(input.relationship),
    phone: emptyToNull(input.phone),
    job: emptyToNull(input.job),
    address_id: addressId,
  };
  if (existing) {
    await tx.relatives.update({ where: { id: existing.id }, data });
  } else {
    await tx.relatives.create({ data: { lead_id: leadId, is_primary: isPrimary, ...data } });
  }
}
