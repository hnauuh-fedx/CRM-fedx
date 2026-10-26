import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { once } from "node:events";
import {
  defaultWorkCalendar,
  type SaleWorkScheduleInput,
} from "@admission-crm/shared/sale-work-schedule";
import type { AutomationReassignmentPolicy } from "@admission-crm/shared/automation-reassignment-policy";

async function main() {
  // This suite only runs in the disposable database created by the existing runner.
  if (
    !/^\/crm_manual_unassign_test_\d+$/.test(
      new URL(process.env.DATABASE_URL!).pathname,
    )
  )
    throw new Error(
      "Use test:integration:work-schedules (isolated database required).",
    );
  process.env.NODE_ENV = "test";
  process.env.DISABLE_REDIS = "true";
  // Validate the additive SQL in a fresh schema in this disposable database.
  const migrationClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await migrationClient.connect();
  try {
    await migrationClient.query("CREATE SCHEMA work_schedule_migration_test");
    await migrationClient.query(
      "SET search_path TO work_schedule_migration_test, public",
    );
    await migrationClient.query(
      "CREATE TABLE work_schedule_migration_test.users (id uuid PRIMARY KEY); CREATE TABLE work_schedule_migration_test.institution_programs (id uuid PRIMARY KEY); CREATE TABLE work_schedule_migration_test.automation_reassignment_monitors (id uuid PRIMARY KEY, assignee_id uuid, institution_program_id uuid, status text)",
    );
    await migrationClient.query(
      await readFile(
        "prisma/migrations/20261026090000_sale_work_schedules/migration.sql",
        "utf8",
      ),
    );
    const index = await migrationClient.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname='work_schedule_migration_test' AND indexname='uq_sale_work_calendar_current'",
    );
    assert.equal(index.rows.length, 1);
  } finally {
    await migrationClient.end();
  }
  const { prisma } = await import("../database/prisma.js");
  const { getAuthUser } = await import("../modules/auth/auth.service.js");
  const { saveWorkSchedule, listWorkSchedules, searchScheduleSales } =
    await import("../modules/sale-work-schedules/sale-work-schedule.service.js");
  const {
    createReassignmentMonitor,
    processReassignmentExpiry,
    processReassignmentWarning,
  } = await import("../modules/automations/automation-reassignment.service.js");
  const { refreshChangedWorkCalendars } =
    await import("../modules/sale-work-schedules/reassignment-work-calendar.service.js");
  const { validateAutomationRule } =
    await import("../modules/automations/automation.service.js");
  try {
    const programs = await prisma.institution_programs.findMany({ take: 2 });
    const programId = programs[0].id;
    const manager = await prisma.users.findUniqueOrThrow({
      where: { email: "director@tvu.edu.vn" },
    });
    const managerRole = await prisma.roles.findUniqueOrThrow({
      where: { code: "DIRECTOR" },
    });
    await prisma.user_program_roles.create({
      data: {
        user_id: manager.id,
        role_id: managerRole.id,
        institution_program_id: programId,
      },
    });
    const actor = await getAuthUser(manager.id, programId);
    assert.ok(actor);
    const saleRole = await prisma.roles.create({
      data: { code: `WS-${randomUUID()}`, name: "Test lịch Sale" },
    });
    await prisma.role_access_scopes.create({
      data: { role_id: saleRole.id, scope_code: "ASSIGNED_ONLY" },
    });
    await prisma.role_institution_programs.create({
      data: { role_id: saleRole.id, institution_program_id: programId },
    });
    const permission = await prisma.permissions.findUniqueOrThrow({
      where: { code: "lead.view_assigned" },
    });
    await prisma.role_permissions.create({
      data: { role_id: saleRole.id, permission_id: permission.id },
    });
    const sales = await Promise.all(
      [1, 2].map((index) =>
        prisma.users.create({
          data: {
            email: `ws-${randomUUID()}@example.test`,
            full_name: `Sale lịch ${index}`,
            password_hash: "test-only",
            user_program_roles: {
              create: {
                institution_program_id: programId,
                role_id: saleRole.id,
              },
            },
            user_roles: { create: { role_id: saleRole.id } },
          },
        }),
      ),
    );
    const base: SaleWorkScheduleInput = {
      name: "Lịch Telesale",
      note: "",
      isActive: true,
      calendar: defaultWorkCalendar(),
      saleIds: sales.map((sale) => sale.id),
      replaceExisting: false,
    };
    let schedule = await saveWorkSchedule(actor, programId, undefined, base);
    assert.equal(schedule.sales.length, 2);
    assert.equal(
      (await listWorkSchedules(actor, programId, { page: 1, limit: 1 }))
        .pagination.total,
      1,
    );
    assert.equal(
      (await searchScheduleSales(actor, programId, "Sale lịch", 1)).data.length,
      2,
    );
    await assert.rejects(
      saveWorkSchedule(actor, programs[1].id, undefined, base),
      /phạm vi/,
    );
    await assert.rejects(
      saveWorkSchedule(actor, programId, undefined, base),
      /đã có lịch/,
    );
    await assert.rejects(
      saveWorkSchedule(actor, programId, schedule.id, { ...base, version: 99 }),
      /đã được thay đổi/,
    );
    await assert.rejects(
      saveWorkSchedule(
        { ...actor, accessScope: "DEPARTMENT", departmentIds: [] },
        programId,
        schedule.id,
        { ...base, version: 1 },
      ),
      /phạm vi/,
    );
    assert.equal(
      (
        await listWorkSchedules(
          { ...actor, accessScope: "DEPARTMENT", departmentIds: [] },
          programId,
          { page: 1, limit: 20 },
        )
      ).data.length,
      0,
    );
    const policy: AutomationReassignmentPolicy = {
      enabled: true,
      workingTimeOnly: true,
      interactionCriterion: "not_opened_since_assignment",
      timeoutMinutes: 60,
      assignToAnotherSale: true,
      excludeCurrentAssignee: true,
      maxReassignments: 1,
      recyclePool: false,
      maxPoolCycles: 1,
      warningEnabled: true,
      warningBeforeMinutes: 30,
      warningContent: "Vui lòng chăm sóc",
      secondWarningEnabled: true,
      secondWarningBeforeMinutes: 10,
      secondWarningContent: "Sắp chuyển",
      notifyOnRemoval: true,
    };
    const rule = await prisma.automation_rules.create({
      data: {
        name: "Test lịch",
        trigger_type: "lead_created",
        created_by: manager.id,
        institution_program_id: programId,
        is_active: true,
        graph_data: { nodes: [], edges: [] },
      },
    });
    await prisma.automation_rules.update({
      where: { id: rule.id },
      data: {
        graph_data: {
          nodes: [
            {
              id: "trigger",
              type: "trigger",
              position: { x: 0, y: 0 },
              data: { label: "Khởi động", triggerType: "lead_created" },
            },
            {
              id: "pool",
              type: "action_assign_pool",
              position: { x: 200, y: 0 },
              data: {
                label: "Chia Lead",
                assignmentStrategy: "round_robin",
                assigneeIds: sales.map((sale) => sale.id),
                reassignmentPolicy: policy,
              },
            },
          ],
          edges: [{ id: "edge", source: "trigger", target: "pool" }],
        },
      },
    });
    assert.equal(
      (await validateAutomationRule(actor, rule.id))?.valid,
      true,
      "Rule có lịch cho đủ Sale phải hợp lệ.",
    );
    const create = async (
      suffix: string,
      started = "2030-10-25T16:30:00+07:00",
      customPolicy = policy,
    ) => {
      const lead = await prisma.leads.create({
        data: {
          full_name: `Lead lịch ${suffix}`,
          phone: "0901234567",
          institution_program_id: programId,
          assigned_to: sales[0].id,
          owner_id: manager.id,
        },
      });
      const assignedAt = new Date(started);
      const assignment = await prisma.lead_assignments.create({
        data: {
          lead_id: lead.id,
          assigned_to: sales[0].id,
          assigned_by: manager.id,
          assigned_at: assignedAt,
          is_main_owner: true,
        },
      });
      const monitor = await prisma.$transaction((tx) =>
        createReassignmentMonitor(tx, {
          ruleId: rule.id,
          nodeId: "pool",
          assignment: {
            assignmentId: assignment.id,
            assigneeId: sales[0].id,
            previousAssigneeId: null,
            departmentId: null,
            assignedAt,
          },
          leadId: lead.id,
          actorId: manager.id,
          institutionProgramId: programId,
          nodeSnapshot: {
            assignmentStrategy: "round_robin",
            assigneeIds: sales.map((sale) => sale.id),
          },
          policy: customPolicy,
        }),
      );
      return {
        lead,
        assignment,
        monitor:
          await prisma.automation_reassignment_monitors.findUniqueOrThrow({
            where: { id: monitor.id },
          }),
      };
    };
    const weekend = await create("weekend");
    assert.equal(
      weekend.monitor.reassignment_due_at.toISOString(),
      new Date("2030-10-28T08:30:00+07:00").toISOString(),
    );
    assert.equal(
      weekend.monitor.warning_due_at?.toISOString(),
      new Date("2030-10-28T08:00:00+07:00").toISOString(),
    );
    assert.equal(
      weekend.monitor.second_warning_due_at?.toISOString(),
      new Date("2030-10-28T08:20:00+07:00").toISOString(),
    );
    await processReassignmentWarning(
      weekend.monitor.id,
      new Date("2030-10-27T22:00:00+07:00"),
    );
    await processReassignmentExpiry(
      weekend.monitor.id,
      new Date("2030-10-28T08:29:00+07:00"),
    );
    assert.equal(
      (await prisma.leads.findUniqueOrThrow({ where: { id: weekend.lead.id } }))
        .assigned_to,
      sales[0].id,
    );
    assert.equal(
      (
        await processReassignmentWarning(
          weekend.monitor.id,
          new Date("2030-10-28T08:00:00+07:00"),
        )
      ).outcome,
      "warned",
    );
    assert.equal(
      (
        await processReassignmentWarning(
          weekend.monitor.id,
          new Date("2030-10-28T08:20:00+07:00"),
          "second",
        )
      ).outcome,
      "warned",
    );
    const concurrent = await Promise.all([
      processReassignmentExpiry(
        weekend.monitor.id,
        new Date("2030-10-28T08:30:00+07:00"),
      ),
      processReassignmentExpiry(
        weekend.monitor.id,
        new Date("2030-10-28T08:30:00+07:00"),
      ),
    ]);
    assert.equal(
      concurrent.filter((result) => result.outcome === "reassigned").length,
      1,
    );
    assert.equal(
      await prisma.lead_assignments.count({
        where: { lead_id: weekend.lead.id },
      }),
      2,
    );
    const interacted = await create("outside interaction");
    await prisma.lead_assignments.update({
      where: { id: interacted.assignment.id },
      data: { first_opened_at: new Date("2030-10-26T22:00:00+07:00") },
    });
    await processReassignmentExpiry(
      interacted.monitor.id,
      new Date("2030-10-28T09:00:00+07:00"),
    );
    assert.equal(
      (
        await prisma.automation_reassignment_monitors.findUniqueOrThrow({
          where: { id: interacted.monitor.id },
        })
      ).completion_reason,
      "lead_opened",
    );
    const delayed = await create("late worker");
    await processReassignmentExpiry(
      delayed.monitor.id,
      new Date("2030-10-28T22:00:00+07:00"),
    );
    const deferred =
      await prisma.automation_reassignment_monitors.findUniqueOrThrow({
        where: { id: delayed.monitor.id },
      });
    assert.equal(deferred.status, "pending");
    assert.equal(
      deferred.reassignment_due_at.toISOString(),
      new Date("2030-10-29T08:00:00+07:00").toISOString(),
    );
    const pending = await create("calendar edit");
    const changedCalendar = defaultWorkCalendar();
    changedCalendar.days[1].shifts = [{ start: "10:00", end: "17:00" }];
    schedule = await saveWorkSchedule(actor, programId, schedule.id, {
      ...base,
      calendar: changedCalendar,
      version: schedule.version,
    });
    assert.equal(
      (
        await prisma.automation_reassignment_monitors.findUniqueOrThrow({
          where: { id: pending.monitor.id },
        })
      ).calendar_refresh_required,
      true,
    );
    await refreshChangedWorkCalendars();
    assert.equal(
      (
        await prisma.automation_reassignment_monitors.findUniqueOrThrow({
          where: { id: pending.monitor.id },
        })
      ).reassignment_due_at.toISOString(),
      new Date("2030-10-28T10:30:00+07:00").toISOString(),
    );
    // Stale queue messages must respect the newly calculated deadline.
    await processReassignmentExpiry(
      pending.monitor.id,
      new Date("2030-10-28T08:30:00+07:00"),
    );
    assert.equal(
      (await prisma.leads.findUniqueOrThrow({ where: { id: pending.lead.id } }))
        .assigned_to,
      sales[0].id,
    );
    const replacement = await saveWorkSchedule(actor, programId, undefined, {
      ...base,
      name: "Lịch thay thế",
      saleIds: [sales[0].id],
      replaceExisting: true,
    });
    const old = await prisma.sale_work_schedule_members.count({
      where: { schedule_id: schedule.id, user_id: sales[0].id },
    });
    assert.equal(old, 0);
    assert.equal(
      await prisma.sale_work_calendar_periods.count({
        where: {
          user_id: sales[0].id,
          institution_program_id: programId,
          effective_to: null,
        },
      }),
      1,
    );
    await saveWorkSchedule(actor, programId, replacement.id, {
      ...base,
      name: replacement.name,
      saleIds: replacement.saleIds,
      isActive: false,
      version: replacement.version,
    });
    await refreshChangedWorkCalendars();
    const stopped =
      await prisma.automation_reassignment_monitors.findUniqueOrThrow({
        where: { id: pending.monitor.id },
      });
    assert.match(stopped.last_error!, /chưa có lịch/);
    await assert.rejects(create("no current calendar"), /chưa có lịch/);
    const invalid = await validateAutomationRule(actor, rule.id);
    assert.equal(invalid?.valid, false);
    assert.ok(
      invalid?.issues.some((issue) => issue.message.includes("chưa có lịch")),
    );
    const { app } = await import("../app.js");
    const { createAuthSession } =
      await import("../modules/auth/auth-session.service.js");
    const session = await createAuthSession(
      manager.id,
      manager.password_hash,
      false,
    );
    const saleSession = await createAuthSession(
      sales[0].id,
      sales[0].password_hash,
      false,
    );
    assert.ok(session && saleSession);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const endpoint = `http://127.0.0.1:${address.port}/api/sale-work-schedules`;
      assert.equal((await fetch(endpoint)).status, 401);
      assert.equal(
        (
          await fetch(endpoint, {
            headers: {
              Authorization: `Bearer ${saleSession.accessToken}`,
              "X-Institution-Program-Id": programId,
            },
          })
        ).status,
        403,
      );
      const headers = {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Institution-Program-Id": programId,
        "Content-Type": "application/json",
      };
      const response = await fetch(endpoint, { headers });
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        data: Record<string, unknown>[];
      };
      assert.ok(
        body.data.length > 0 && !JSON.stringify(body).includes("password_hash"),
      );
      assert.equal(
        (
          await fetch(endpoint, {
            headers,
            method: "POST",
            body: JSON.stringify({
              ...base,
              calendar: { timezone: "Asia/Ho_Chi_Minh", days: [] },
            }),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(`${endpoint}/${randomUUID()}`, {
            headers,
            method: "PUT",
            body: JSON.stringify(base),
          })
        ).status,
        404,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    assert.ok(
      await prisma.audit_logs.count({
        where: { entity_type: "sale_work_schedule" },
      }),
    );
    console.log(
      "PASS: scoped lists/writes, optimistic versions, calendar conflicts/replacement, warnings, weekend, outside-hours interaction, concurrent expiry, late worker, schedule edits and missing calendar",
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
