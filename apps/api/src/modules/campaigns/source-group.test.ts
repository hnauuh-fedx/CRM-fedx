import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceGroup, sourceGroupSettingsSchema } from "@admission-crm/shared/source-group";

test("fixed configuration overrides all tracking, including explicit Other", () => {
  assert.deepEqual(resolveSourceGroup({ fixedGroup: "tiktok", utmSource: "fb_ads", referrer: "https://google.com/" }), { code: "tiktok", name: "TikTok", matchedBy: "configured" });
  assert.equal(resolveSourceGroup({ fixedGroup: "other", utmSource: "google" }).code, "other");
});
test("UTM aliases normalize into the canonical catalogue", () => {
  for (const [value, code] of [[" FB ", "facebook"], ["facebook_ads", "facebook"], ["Meta Ads", "facebook"], ["google-ads", "google"], ["TikTok", "tiktok"], ["zalo_oa", "zalo"], ["IG", "instagram"], ["YT", "youtube"], ["web", "website"]]) {
    assert.equal(resolveSourceGroup({ utmSource: value }).code, code);
  }
});
test("direct UTM precedes URL UTM, then referrer", () => {
  assert.equal(resolveSourceGroup({ utmSource: "zalo", sourceUrl: "https://landing.test/?utm_source=google", referrer: "https://facebook.com/" }).code, "zalo");
  assert.equal(resolveSourceGroup({ sourceUrl: "https://landing.test/?utm_source=FB_ads" }).code, "facebook");
  assert.equal(resolveSourceGroup({ utmSource: "unknown", referrer: "https://l.instagram.com/" }).code, "instagram");
  assert.equal(resolveSourceGroup({ fixedGroup: "auto", referrer: "https://www.google.com.vn/search" }).code, "google");
});
test("referrer matching validates protocol and domain boundaries", () => {
  for (const [domain, code] of [["m.facebook.com", "facebook"], ["www.google.com", "google"], ["www.tiktok.com", "tiktok"], ["zalo.me", "zalo"], ["youtu.be", "youtube"]]) assert.equal(resolveSourceGroup({ referrer: `https://${domain}/` }).code, code);
  for (const referrer of ["https://facebook.com.evil.test/", "https://notfacebook.com/", "javascript://facebook.com/", "https://facebook.com@evil.test/", "bad url"]) assert.equal(resolveSourceGroup({ referrer }).code, "other");
});
test("unknown UTM and names never create arbitrary groups", () => {
  for (const utmSource of [undefined, null, "", "  ", "Campaign 2026", "facebook-fake", "__proto__", "constructor"]) {
    assert.equal(resolveSourceGroup({ utmSource }).name, "Khác");
  }
  assert.equal(resolveSourceGroup({ sourceUrl: "https://facebook.com/landing" }).code, "other", "A landing URL host is not a referrer.");
});
test("settings accept automatic and known fixed groups while preserving other settings", () => {
  assert.ok(sourceGroupSettingsSchema.safeParse({}).success);
  assert.ok(sourceGroupSettingsSchema.safeParse({ sourceGroup: "auto", source: "Specific form" }).success);
  assert.ok(sourceGroupSettingsSchema.safeParse({ sourceGroup: "other" }).success);
  for (const sourceGroup of ["New group", "Facebook", [], {}]) assert.equal(sourceGroupSettingsSchema.safeParse({ sourceGroup }).success, false);
});
