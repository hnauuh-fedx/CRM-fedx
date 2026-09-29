import assert from "node:assert/strict";
import test from "node:test";

import { mayContainLeadInformation, normalizeVietnamPhone } from "./lead-extraction.service";

test("detects messages that may contain lead contact information", () => {
  assert.equal(mayContainLeadInformation("SĐT: 0912 345 678"), true);
  assert.equal(mayContainLeadInformation("Liên hệ +84 912 345 678"), true);
  assert.equal(mayContainLeadInformation("Em muốn hỏi thông tin ngành học"), false);
});

test("normalizes supported Vietnamese phone formats", () => {
  assert.equal(normalizeVietnamPhone("+84 912 345 678"), "0912345678");
  assert.equal(normalizeVietnamPhone("84-912-345-678"), "0912345678");
  assert.equal(normalizeVietnamPhone("0912.345.678"), "0912345678");
  assert.equal(normalizeVietnamPhone("12345"), null);
  assert.equal(normalizeVietnamPhone(null), null);
});
