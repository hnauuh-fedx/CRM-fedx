import assert from "node:assert/strict";
import { test } from "node:test";
import { historyData, withHistorySource } from "./history-source";
import { leadHistoryActorLabel } from "../modules/leads/lead-history-actor";

test("execution sources stay isolated across concurrent and nested work", async () => {
  const row = { user_id: "responsible-user", metadata: { fromStageId: "before" } };
  const [webhook, automation] = await Promise.all([
    withHistorySource({ channel: "webhook", name: "Intake" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return historyData(row, "metadata");
    }),
    withHistorySource({ channel: "automation", name: "Assign" }, async () => {
      await Promise.resolve();
      const nested = withHistorySource({ channel: "api" }, () => historyData(row, "metadata"));
      assert.equal(leadHistoryActorLabel("lead_assigned", nested.metadata), "API / Webhook");
      return historyData(row, "metadata");
    }),
  ]);
  assert.equal(leadHistoryActorLabel("lead_updated", webhook.metadata), "API / Webhook · Intake");
  assert.equal(leadHistoryActorLabel("lead_assigned", automation.metadata), "Hệ thống · Automation: Assign");
  assert.equal(webhook.user_id, row.user_id);
  assert.equal(webhook.metadata.fromStageId, "before");
  assert.equal(historyData(row, "metadata"), row);
  assert.equal(leadHistoryActorLabel("lead_updated", row.metadata), undefined);
});

test("legacy events use explicit system evidence without mislabelling manual work", () => {
  assert.equal(leadHistoryActorLabel("webhook_update", {}), "API / Webhook");
  assert.equal(leadHistoryActorLabel("lead_updated", {}, "Cập nhật Lead từ inbound webhook."), "API / Webhook");
  assert.equal(leadHistoryActorLabel("automation_reassignment", null), "Hệ thống · Automation");
  assert.equal(leadHistoryActorLabel("source_received", {}), "Hệ thống");
  for (const kind of ["assign", "reassign", "note_created", "lead_updated"]) assert.equal(leadHistoryActorLabel(kind, {}), undefined);
});
