import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { prisma } from "../../../database/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { deleteLead, deleteLeads } from "./delete-lead.use-case";

const actor: AuthUser = {
  id: "actor", fullName: "Nguyễn Văn A", email: "private@example.test",
  avatarUrl: null, roles: [], permissions: ["lead.delete", "lead.view_all"],
  departmentIds: [], institutionProgramIds: ["program-a", "program-b"], accessScope: "ALL",
};
const lead = (id: string, program: string | null = "program-a") => ({
  id, institution_program_id: program, full_name: "Tên khách hàng riêng tư",
  pipeline_stage_id: null, assigned_to: null,
});

function fixture(t: TestContext, records: ReturnType<typeof lead>[], failNotifications = false, recipients = ["admin", "director"]) {
  const pending: string[] = [];
  const committed: string[] = [];
  const notifications: Prisma.notificationsCreateManyArgs[] = [];
  const recipientQueries: Prisma.usersFindManyArgs[] = [];
  let leadQuery: Prisma.leadsFindManyArgs | Prisma.leadsFindFirstArgs | undefined;
  let transactions = 0;
  const tx = {
    leads: {
      findFirst: async (args: Prisma.leadsFindFirstArgs) => { leadQuery = args; return records[0] ?? null; },
      findMany: async (args: Prisma.leadsFindManyArgs) => { leadQuery = args; return records; },
      update: async () => { pending.push("delete"); },
      updateMany: async () => { pending.push("delete"); return { count: records.length }; },
    },
    lead_activities: {
      create: async () => { pending.push("activity"); },
      createMany: async () => { pending.push("activity"); },
    },
    audit_logs: {
      create: async () => { pending.push("audit"); },
      createMany: async () => { pending.push("audit"); },
    },
    users: { findMany: async (args: Prisma.usersFindManyArgs) => {
      recipientQueries.push(args);
      return recipients.map((id) => ({ id }));
    } },
    notifications: { createMany: async (args: Prisma.notificationsCreateManyArgs) => {
      if (failNotifications) throw new Error("notification write failed");
      notifications.push(args);
      pending.push("notification");
    } },
  } as unknown as Prisma.TransactionClient;
  // Prisma exposes methods through a proxy, without the descriptor mock.method requires.
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = (async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => {
    transactions += 1;
    const result = await callback(tx);
    committed.push(...pending);
    return result;
  }) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = originalTransaction; });
  return { committed, notifications, recipientQueries, query: () => leadQuery, transactions: () => transactions };
}

test("single deletion writes the alert with the deletion, activity and audit in one transaction", async (t) => {
  const f = fixture(t, [lead("lead-a")]);
  assert.equal((await deleteLead(actor, "lead-a", "program-a")).ok, true);
  assert.deepEqual(f.committed, ["delete", "activity", "audit", "notification"]);
  assert.equal(f.transactions(), 1);
  assert.deepEqual(f.notifications[0].data, ["admin", "director"].map((id) => ({
    user_id: id, type: "data_delete", title: "Thông báo xóa dữ liệu",
    content: "Nguyễn Văn A vừa xóa 1 bản ghi lead/sinh viên.", is_read: false,
  })));
  assert.equal(f.query()?.where?.institution_program_id, "program-a");
  assert.ok(!JSON.stringify(f.notifications).includes("Tên khách hàng riêng tư"));
  assert.ok(!JSON.stringify(f.notifications).includes(actor.email));
});

test("bulk deletion sends one summary per recipient and counts unique records", async (t) => {
  const f = fixture(t, [lead("lead-a"), lead("lead-b")]);
  const result = await deleteLeads(actor, ["lead-a", "lead-b", "lead-a"], "program-a");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.deletedCount, 2);
  assert.equal(f.notifications.length, 1);
  assert.ok(JSON.stringify(f.notifications).includes("2 bản ghi"));
  assert.deepEqual(f.query()?.where?.id, { in: ["lead-a", "lead-b"] });
});

test("bulk summaries are separated by each record's actual program", async (t) => {
  const f = fixture(t, [lead("lead-a"), lead("lead-b", "program-b")]);
  assert.equal((await deleteLeads(actor, ["lead-a", "lead-b"])).ok, true);
  assert.equal(f.notifications.length, 2);
  assert.deepEqual(f.recipientQueries.map((query) =>
    (query.where!.user_program_roles as { some: { institution_program_id: string } }).some.institution_program_id,
  ), ["program-a", "program-b"]);
});

test("permission denial never starts deletion or notification work", async (t) => {
  const f = fixture(t, [lead("lead-a")]);
  const denied = { ...actor, permissions: [] };
  assert.equal((await deleteLead(denied, "lead-a", "program-a")).ok, false);
  assert.equal((await deleteLeads(denied, ["lead-a"], "program-a")).ok, false);
  assert.equal(f.transactions(), 0);
  assert.deepEqual(f.notifications, []);
});

test("missing records do not write alerts", async (t) => {
  const f = fixture(t, []);
  assert.equal((await deleteLead(actor, "missing", "program-a")).ok, false);
  assert.equal((await deleteLeads(actor, ["missing"], "program-a")).ok, false);
  assert.deepEqual(f.committed, []);
  assert.deepEqual(f.notifications, []);
});

test("a partially visible batch is rejected without deletion or notifications", async (t) => {
  const f = fixture(t, [lead("lead-a")]);
  assert.equal((await deleteLeads(actor, ["lead-a", "invisible"], "program-a")).ok, false);
  assert.deepEqual(f.committed, []);
  assert.deepEqual(f.notifications, []);
});

test("notification errors propagate through the deletion transaction", async (t) => {
  const f = fixture(t, [lead("lead-a")], true);
  await assert.rejects(deleteLead(actor, "lead-a", "program-a"), /notification write failed/);
  await assert.rejects(deleteLeads(actor, ["lead-a"], "program-a"), /notification write failed/);
  assert.deepEqual(f.committed, []);
});

test("no eligible recipients does not prevent deletion", async (t) => {
  const f = fixture(t, [lead("lead-a")], false, []);
  assert.equal((await deleteLeads(actor, ["lead-a"], "program-a")).ok, true);
  assert.deepEqual(f.committed, ["delete", "activity", "audit"]);
  assert.deepEqual(f.notifications, []);
});

test("legacy records without a program never broadcast notifications", async (t) => {
  const f = fixture(t, [lead("legacy", null)]);
  assert.equal((await deleteLead(actor, "legacy")).ok, true);
  assert.deepEqual(f.recipientQueries, []);
  assert.deepEqual(f.notifications, []);
});
