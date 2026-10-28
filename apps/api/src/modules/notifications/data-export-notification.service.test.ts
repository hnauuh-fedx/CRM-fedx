import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { recordDataExport } from "./data-export-notification.service";

const actor: AuthUser = {
  id: "exporter", fullName: "Nguyễn Văn A", email: "private@example.test",
  avatarUrl: null, roles: ["TELESALE"], permissions: ["lead.export"],
  departmentIds: [], institutionProgramIds: ["program-a"], accessScope: "ASSIGNED_ONLY",
};
const event = {
  institutionProgramId: "program-a", label: "danh sách lead", count: 20,
  format: "xlsx" as const, entityType: "lead_export", metadata: { page: 2 },
};

function fixture(recipientIds: string[], failNotifications = false) {
  let recipientQuery: Prisma.usersFindManyArgs | undefined;
  let audit: Prisma.audit_logsCreateArgs | undefined;
  let notifications: Prisma.notificationsCreateManyArgs | undefined;
  let committed = false;
  const tx = {
    users: { findMany: async (args: Prisma.usersFindManyArgs) => {
      recipientQuery = args;
      return recipientIds.map((id) => ({ id }));
    } },
    audit_logs: { create: async (args: Prisma.audit_logsCreateArgs) => { audit = args; } },
    notifications: { createMany: async (args: Prisma.notificationsCreateManyArgs) => {
      notifications = args;
      if (failNotifications) throw new Error("notification write failed");
    } },
  };
  const database = {
    $transaction: async (callback: (client: typeof tx) => Promise<void>) => {
      await callback(tx);
      committed = true;
    },
  } as unknown as NonNullable<Parameters<typeof recordDataExport>[3]>;
  return { database, result: () => ({ recipientQuery, audit, notifications, committed }) };
}

test("selects only active program admins/directors with an enabled audit permission", async () => {
  const f = fixture(["admin", "director"]);
  await recordDataExport(actor, event, "127.0.0.1", f.database);
  assert.deepEqual(f.result().recipientQuery, {
    where: {
      status: "active", deleted_at: null,
      user_program_roles: { some: {
        institution_program_id: "program-a", institution_programs: { status: "active" },
        roles: {
          code: { in: ["ADMIN", "DIRECTOR"] },
          role_permissions: { some: { permissions: {
            code: "audit.view", OR: [{ is_active: true }, { is_active: null }],
          } } },
        },
      } },
    },
    select: { id: true },
  });
  assert.equal(f.result().committed, true);
});

test("writes one unread alert per recipient, including an exporter who is also a director", async () => {
  const f = fixture([actor.id, "admin"]);
  await recordDataExport(actor, event, "127.0.0.1", f.database);
  assert.deepEqual(f.result().notifications?.data, [actor.id, "admin"].map((id) => ({
    user_id: id, type: "data_export", title: "Thông báo xuất dữ liệu",
    content: "Nguyễn Văn A vừa xuất danh sách lead: 20 dòng dữ liệu, định dạng XLSX.",
    is_read: false,
  })));
  assert.deepEqual(f.result().audit?.data, {
    user_id: actor.id, entity_type: "lead_export", entity_id: undefined, action: "export",
    ip_address: "127.0.0.1",
    new_data: { page: 2, institutionProgramId: "program-a", count: 20, format: "xlsx" },
  });
  assert.ok(!JSON.stringify(f.result().notifications).includes(actor.email));
  assert.ok(!JSON.stringify(f.result().notifications).includes("127.0.0.1"));
});

test("preserves report audit actions and keeps filters out of alerts", async () => {
  const f = fixture(["director"]);
  await recordDataExport(actor, {
    ...event, entityType: "marketing_form", entityId: "form-id", action: "export_aggregate_report",
    format: "csv", metadata: { fromDate: "2026-10-01", page: 1 },
  }, undefined, f.database);
  assert.equal(f.result().audit?.data.action, "export_aggregate_report");
  assert.equal(f.result().audit?.data.entity_id, "form-id");
  assert.ok(!JSON.stringify(f.result().notifications).includes("2026-10-01"));
  assert.ok(JSON.stringify(f.result().notifications).includes("CSV"));
});

test("still audits empty exports when no eligible recipient exists", async () => {
  const f = fixture([]);
  await recordDataExport(actor, { ...event, count: 0 }, undefined, f.database);
  assert.equal(f.result().notifications, undefined);
  assert.ok(f.result().audit);
  assert.equal(f.result().committed, true);
});

test("propagates write failures so the caller cannot release an unrecorded export", async () => {
  const f = fixture(["admin"], true);
  await assert.rejects(recordDataExport(actor, event, undefined, f.database), /notification write failed/);
  assert.equal(f.result().committed, false);
});
