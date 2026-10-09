import assert from "node:assert/strict";
import test from "node:test";

import {
  extractVietnamPhoneFromText,
  mayContainLeadInformation,
  normalizeVietnamPhone,
  resolveInboundLeadName,
  usedProfileNameFallback,
} from "./lead-extraction.service";

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

test("extracts a Vietnamese phone directly from a phone-only message", () => {
  assert.equal(extractVietnamPhoneFromText("0912 345 678"), "0912345678");
  assert.equal(extractVietnamPhoneFromText("Số của em là +84 (912) 345-678"), "0912345678");
  assert.equal(extractVietnamPhoneFromText("Em muốn hỏi thông tin"), null);
});

test("uses the sender profile as a temporary lead name", () => {
  assert.deepEqual(resolveInboundLeadName(null, "Nguyễn Văn A", "0912345678"), {
    fullName: "Nguyễn Văn A",
    usedProfileNameFallback: true,
  });
  assert.deepEqual(resolveInboundLeadName("Trần Thị B", "Nguyễn Văn A", "0912345678"), {
    fullName: "Trần Thị B",
    usedProfileNameFallback: false,
  });
  assert.equal(usedProfileNameFallback({ usedProfileNameFallback: true }), true);
  assert.equal(usedProfileNameFallback({ usedProfileNameFallback: false }), false);
});
