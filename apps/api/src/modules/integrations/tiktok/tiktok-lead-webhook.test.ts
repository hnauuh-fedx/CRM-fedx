import assert from "node:assert/strict";
import test from "node:test";

import { extractTikTokLeads, flattenTikTokLeadPayload, normalizeTikTokFieldKey, parseTikTokJson } from "./tiktok-lead-webhook";

test("normalizes Vietnamese and English question labels to mapping keys", () => {
  assert.equal(normalizeTikTokFieldKey("Phone Number"), "phone_number");
  assert.equal(normalizeTikTokFieldKey("Ngành học quan tâm?"), "nganh_hoc_quan_tam");
  assert.equal(normalizeTikTokFieldKey("Địa chỉ"), "dia_chi");
});

test("flattens nested lead answers next to TikTok metadata", () => {
  const { leadId, flat } = flattenTikTokLeadPayload({
    subscription_id: "999",
    advertiser_id: "7696366423161503796",
    lead: {
      lead_id: "7300000000000000001",
      page_id: "7200000000000000001",
      create_time: 1760860800,
      field_data: [
        { name: "Full Name", value: "Nguyễn Văn A" },
        { name: "Phone Number", value: "0901234567" },
        { name: "email", values: ["a@example.com"] },
        { name: "Ngành quan tâm", value: ["CNTT", "Kinh tế"] },
      ],
    },
  });

  assert.equal(leadId, "7300000000000000001");
  assert.equal(flat.advertiser_id, "7696366423161503796");
  assert.equal(flat.page_id, "7200000000000000001");
  assert.equal(flat.full_name, "Nguyễn Văn A");
  assert.equal(flat.phone_number, "0901234567");
  assert.equal(flat.email, "a@example.com");
  assert.equal(flat.nganh_quan_tam, "CNTT, Kinh tế");
});

test("accepts a JSON string content envelope", () => {
  const { leadId, flat } = flattenTikTokLeadPayload({
    event: "lead",
    content: JSON.stringify({ lead_id: "1", fields: [{ field_name: "Phone", field_value: "0912345678" }] }),
  });

  assert.equal(leadId, "1");
  assert.equal(flat.phone, "0912345678");
});

test("returns no lead id for a non-object payload", () => {
  assert.deepEqual(flattenTikTokLeadPayload("not json"), { leadId: null, flat: {} });
});

test("extracts each lead from a real TikTok entry/changes notification without rounding ids", () => {
  const raw = `{"request_id": 7698223042085831234, "object": 1, "entry": [{
    "id": 7698222831972811234, "page_id": 7696083428135190805, "page_name": "Biểu mẫu",
    "campaign_id": 0, "advertiser_id": 7696074909180854324, "create_time": 1792382244, "lead_source": "INSTANT_FORM",
    "changes": [
      {"field": "email", "value": "test_email_address@mail.com"},
      {"field": "phone_number", "value": "8001000000"},
      {"field": "Bạn quan tâm đến ngành học nào?", "value": "CNTT"},
      {"field": "name", "value": "Jane Doe"}
    ]}], "time": 1792382244}`;

  const leads = extractTikTokLeads(parseTikTokJson(raw));

  assert.equal(leads.length, 1);
  const [lead] = leads;
  assert.equal(lead.leadId, "7698222831972811234");
  assert.equal(lead.flat.page_id, "7696083428135190805");
  assert.equal(lead.flat.advertiser_id, "7696074909180854324");
  assert.equal(lead.flat.name, "Jane Doe");
  assert.equal(lead.flat.phone_number, "8001000000");
  assert.equal(lead.flat.email, "test_email_address@mail.com");
  assert.equal(lead.flat.ban_quan_tam_den_nganh_hoc_nao, "CNTT");
  assert.equal(lead.flat.request_id, undefined);
});

test("ignores notifications without lead entries", () => {
  assert.deepEqual(extractTikTokLeads({ object: 1, entry: [] }), []);
  assert.deepEqual(extractTikTokLeads({ event: "ping" }), []);
});
