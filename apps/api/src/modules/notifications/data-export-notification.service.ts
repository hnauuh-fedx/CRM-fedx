import { prisma } from "../../database/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { createManagementDataNotification } from "./management-data-notification.service";

type ExportEvent = {
  institutionProgramId: string;
  label: string;
  count: number;
  format: "csv" | "xlsx";
  entityType: string;
  entityId?: string;
  action?: string;
  metadata?: Prisma.InputJsonObject;
};

/** Record the export and its in-app alerts together, before releasing the file. */
export async function recordDataExport(
  actor: AuthUser,
  event: ExportEvent,
  ipAddress?: string,
  database: Pick<typeof prisma, "$transaction"> = prisma,
) {
  await database.$transaction(async (tx) => {
    await tx.audit_logs.create({ data: {
      user_id: actor.id,
      entity_type: event.entityType,
      entity_id: event.entityId,
      action: event.action ?? "export",
      ip_address: ipAddress,
      new_data: {
        ...event.metadata,
        institutionProgramId: event.institutionProgramId,
        count: event.count,
        format: event.format,
      },
    } });
    await createManagementDataNotification(tx, event.institutionProgramId, {
      type: "data_export",
      title: "Thông báo xuất dữ liệu",
      // Only export metadata: never include the exported rows, filters or download link.
      content: `${actor.fullName} vừa xuất ${event.label}: ${event.count} dòng dữ liệu, định dạng ${event.format.toUpperCase()}.`,
    });
  });
}
