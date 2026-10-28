import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";

type NotificationClient = Pick<Prisma.TransactionClient, "users" | "notifications">;

export async function createManagementDataNotification(
  tx: NotificationClient,
  institutionProgramId: string,
  notification: { type: "data_export" | "data_delete"; title: string; content: string },
) {
  // Match authentication's per-program grants; legacy global roles do not grant access.
  const recipients = await tx.users.findMany({
    where: {
      status: "active",
      deleted_at: null,
      user_program_roles: { some: {
        institution_program_id: institutionProgramId,
        institution_programs: { status: "active" },
        roles: {
          code: { in: ["ADMIN", "DIRECTOR"] },
          role_permissions: { some: { permissions: {
            code: "audit.view",
            OR: [{ is_active: true }, { is_active: null }],
          } } },
        },
      } },
    },
    select: { id: true },
  });
  if (recipients.length) {
    await tx.notifications.createMany({ data: recipients.map(({ id }) => ({
      user_id: id,
      ...notification,
      is_read: false,
    })) });
  }
}

/** One summary per program, in the same transaction as the deletion and audit. */
export async function notifyDataDeletion(
  tx: NotificationClient,
  actor: Pick<AuthUser, "fullName">,
  records: ReadonlyArray<{ institution_program_id: string | null }>,
) {
  const counts = new Map<string, number>();
  for (const record of records) {
    // Never broadcast legacy records without a program to unrelated recipients.
    if (!record.institution_program_id) continue;
    counts.set(record.institution_program_id, (counts.get(record.institution_program_id) ?? 0) + 1);
  }
  for (const [programId, count] of counts) {
    await createManagementDataNotification(tx, programId, {
      type: "data_delete",
      title: "Thông báo xóa dữ liệu",
      content: `${actor.fullName} vừa xóa ${count} bản ghi lead/sinh viên.`,
    });
  }
}
