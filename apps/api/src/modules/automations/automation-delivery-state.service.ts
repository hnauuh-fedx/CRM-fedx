import { prisma } from "../../database/prisma";

const DELIVERY_LEASE_MS = 2 * 60_000;

type DeliveryClaimStore = {
  updateManyAndReturn: (args: unknown) => Promise<Array<{ attempt_count: number }>>;
  findUnique: (args: unknown) => Promise<{ status: string } | null>;
};

export async function claimAutomationDelivery(
  id: string,
  now = new Date(),
  store: DeliveryClaimStore = prisma.automation_message_deliveries as unknown as DeliveryClaimStore,
  allowAmbiguousRetry = false,
) {
  const staleBefore = new Date(now.getTime() - DELIVERY_LEASE_MS);
  const claimed = await store.updateManyAndReturn({
    where: {
      id,
      OR: [
        { status: { in: allowAmbiguousRetry ? ["pending", "failed"] : ["pending"] } },
        ...(allowAmbiguousRetry ? [{ status: "sending", updated_at: { lt: staleBefore } }] : []),
      ],
    },
    data: { status: "sending", attempt_count: { increment: 1 }, error_code: null, error_message: null, updated_at: now },
    select: { attempt_count: true },
  });
  if (claimed.length > 0) {
    return { claimed: true as const, status: "sending", attemptCount: claimed[0].attempt_count };
  }
  if (!allowAmbiguousRetry) await store.updateManyAndReturn({
    where: { id, OR: [{ status: "failed" }, { status: "sending", updated_at: { lt: staleBefore } }] },
    data: { status: "needs_review", error_code: "delivery_outcome_unknown", error_message: "Không tự gửi lại khi provider chưa được xác nhận hỗ trợ idempotency.", updated_at: now },
    select: { attempt_count: true },
  });
  const delivery = await store.findUnique({ where: { id }, select: { status: true } });
  return { claimed: false as const, status: delivery?.status ?? "missing" };
}

export function classifyAutomationDeliveryHttpStatus(status: number) {
  if (status >= 200 && status < 300) return "success" as const;
  if (status === 408 || status === 429 || status >= 500) return "transient" as const;
  return "unrecoverable" as const;
}
