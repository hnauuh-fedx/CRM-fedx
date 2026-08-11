import type { AuthUser } from "../auth/auth.types";
import { prisma } from "../../database/prisma";

export type AdmissionFeePaymentInput = {
  feeStatus?: string;
  tuitionStatus?: string;
  monthlyRevenue?: string;
  paymentAmount?: string;
  paymentMethod?: string;
  paidAt?: string;
  note?: string;
};

export type AdmissionDebtConfirmationInput = {
  debtStatus: "confirmed" | "pending" | "disputed";
  note?: string;
};

const emptyToNull = (value?: string) => value?.trim() || null;
const toIso = (value?: Date | null) => value?.toISOString() ?? null;

async function findVisibleFeeProfile(profileId: string, scopedProgramId?: string) {
  return prisma.admission_profiles.findFirst({
    where: {
      id: profileId,
      ...(scopedProgramId ? { institution_program_id: scopedProgramId } : {}),
    },
    select: {
      id: true,
      lead_id: true,
      admission_code: true,
      fee_status: true,
      tuition_status: true,
      monthly_revenue: true,
      leads: { select: { id: true, full_name: true, assigned_to: true } },
    },
  });
}

export async function updateAdmissionFeePayment(
  user: AuthUser,
  profileId: string,
  input: AdmissionFeePaymentInput,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const existing = await findVisibleFeeProfile(profileId, scopedProgramId);
  if (!existing) {
    return { ok: false as const, reason: "fee_profile_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    const data = {
      fee_status: emptyToNull(input.feeStatus) ?? existing.fee_status,
      tuition_status: emptyToNull(input.tuitionStatus) ?? existing.tuition_status,
      monthly_revenue: emptyToNull(input.monthlyRevenue) ?? existing.monthly_revenue ?? 0,
      updated_at: new Date(),
    };
    await tx.admission_profiles.update({ where: { id: profileId }, data });
    await tx.lead_activities.create({
      data: {
        lead_id: existing.lead_id,
        user_id: user.id,
        type: "admission_fee_payment_updated",
        content: "Cập nhật thanh toán phí / học phí.",
        metadata: {
          profileId,
          paymentAmount: emptyToNull(input.paymentAmount),
          paymentMethod: emptyToNull(input.paymentMethod),
          paidAt: emptyToNull(input.paidAt),
          note: emptyToNull(input.note),
        },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_fee",
        entity_id: profileId,
        action: "payment_updated",
        old_data: {
          feeStatus: existing.fee_status,
          tuitionStatus: existing.tuition_status,
          monthlyRevenue: existing.monthly_revenue == null ? null : String(existing.monthly_revenue),
        },
        new_data: {
          feeStatus: data.fee_status,
          tuitionStatus: data.tuition_status,
          monthlyRevenue: data.monthly_revenue == null ? null : String(data.monthly_revenue),
          paymentAmount: emptyToNull(input.paymentAmount),
          paymentMethod: emptyToNull(input.paymentMethod),
          paidAt: emptyToNull(input.paidAt),
          note: emptyToNull(input.note),
        },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: profileId } };
  });
}

export async function confirmAdmissionFeeDebt(
  user: AuthUser,
  profileId: string,
  input: AdmissionDebtConfirmationInput,
  ipAddress?: string,
  scopedProgramId?: string,
) {
  const existing = await findVisibleFeeProfile(profileId, scopedProgramId);
  if (!existing) {
    return { ok: false as const, reason: "fee_profile_not_found" as const };
  }

  return prisma.$transaction(async (tx) => {
    await tx.lead_activities.create({
      data: {
        lead_id: existing.lead_id,
        user_id: user.id,
        type: "admission_debt_confirmed",
        content: "Xác nhận công nợ hồ sơ tuyển sinh.",
        metadata: { profileId, debtStatus: input.debtStatus, note: emptyToNull(input.note) },
      },
    });
    await tx.audit_logs.create({
      data: {
        user_id: user.id,
        entity_type: "admission_fee",
        entity_id: profileId,
        action: "debt_confirmed",
        old_data: {
          feeStatus: existing.fee_status,
          tuitionStatus: existing.tuition_status,
          monthlyRevenue: existing.monthly_revenue == null ? null : String(existing.monthly_revenue),
        },
        new_data: {
          debtStatus: input.debtStatus,
          note: emptyToNull(input.note),
        },
        ip_address: ipAddress,
      },
    });
    return { ok: true as const, data: { id: profileId, debtStatus: input.debtStatus } };
  });
}

export async function listAdmissionFeeHistory(profileId: string, scopedProgramId?: string) {
  const profile = await findVisibleFeeProfile(profileId, scopedProgramId);
  if (!profile) {
    return { ok: false as const, reason: "fee_profile_not_found" as const };
  }
  const items = await prisma.audit_logs.findMany({
    where: { entity_type: "admission_fee", entity_id: profileId },
    select: {
      id: true,
      action: true,
      old_data: true,
      new_data: true,
      created_at: true,
      users: { select: { full_name: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 100,
  });

  return {
    ok: true as const,
    data: {
      profile: {
        id: profile.id,
        admissionCode: profile.admission_code,
        candidateName: profile.leads?.full_name ?? null,
      },
      data: items.map((item) => ({
        id: item.id,
        action: item.action,
        oldData: item.old_data,
        newData: item.new_data,
        createdAt: toIso(item.created_at),
        actorName: item.users?.full_name ?? null,
      })),
    },
  };
}
