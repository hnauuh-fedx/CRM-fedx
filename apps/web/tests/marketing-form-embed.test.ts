import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createMarketingFormEmbedMessage,
  marketingFormEmbedProtocol,
  parseMarketingFormEmbedMessage,
  resolveMarketingFormRedirect,
  sanitizeMarketingFormTracking,
} from "@admission-crm/shared/marketing-form-embed";

test("embed messages require protocol, version, form id and bounded resize", () => {
  const message = createMarketingFormEmbedMessage("resize", "form-1", { height: 840 });
  assert.deepEqual(parseMarketingFormEmbedMessage(message, "form-1"), message);
  assert.equal(message.protocol, marketingFormEmbedProtocol);
  assert.equal(parseMarketingFormEmbedMessage({ ...message, formId: "form-2" }, "form-1"), null);
  assert.equal(parseMarketingFormEmbedMessage({ ...message, version: 2 }, "form-1"), null);
  assert.equal(parseMarketingFormEmbedMessage({ ...message, height: 50 }, "form-1"), null);
  assert.equal(parseMarketingFormEmbedMessage({ ...message, height: 9000 }, "form-1"), null);
  assert.equal(parseMarketingFormEmbedMessage({ ...message, extra: true }, "form-1"), null);
});

test("tracking accepts only bounded UTM and safe source URLs", () => {
  assert.deepEqual(sanitizeMarketingFormTracking({
    utm_source: " newsletter ",
    utm_medium: "email",
    utm_campaign: "october",
    utm_content: "cta-a",
    utm_term: "admission",
    source_url: "https://landing.example/path?x=1&utm_source=newsletter#section",
    source_referrer: "https://search.example/result?q=student#top",
    institution_program_id: "must-not-pass",
    unknown: "must-not-pass",
  }), {
    utm_source: "newsletter",
    utm_medium: "email",
    utm_campaign: "october",
    utm_content: "cta-a",
    utm_term: "admission",
    source_url: "https://landing.example/path?utm_source=newsletter",
    source_referrer: "https://search.example/result",
  });
  assert.deepEqual(sanitizeMarketingFormTracking({ utm_source: "x".repeat(201), source_url: "javascript:alert(1)" }), {});
});

test("redirect is limited to configured mode, scheme and origin", () => {
  const sameOrigin = resolveMarketingFormRedirect({ redirectMode: "form", redirectUrl: "/cam-on" }, "https://crm.example");
  assert.deepEqual(sameOrigin, { mode: "form", url: "https://crm.example/cam-on" });
  const landing = resolveMarketingFormRedirect({ redirectMode: "landing_page", redirectUrl: "https://school.example/cam-on", redirectAllowedOrigins: ["https://school.example"] }, "https://crm.example");
  assert.deepEqual(landing, { mode: "landing_page", url: "https://school.example/cam-on" });
  assert.equal(resolveMarketingFormRedirect({ redirectMode: "landing_page", redirectUrl: "https://evil.example/phish", redirectAllowedOrigins: ["https://school.example"] }, "https://crm.example"), null);
  assert.equal(resolveMarketingFormRedirect({ redirectMode: "landing_page", redirectUrl: "https://school.example/cam-on", redirectAllowedOrigins: ["https://school.example/path"] }, "https://crm.example"), null);
  assert.equal(resolveMarketingFormRedirect({ redirectMode: "form", redirectUrl: "javascript:alert(1)" }, "https://crm.example"), null);
  assert.equal(resolveMarketingFormRedirect({ redirectMode: "form", redirectUrl: "http://school.example/insecure" }, "https://crm.example"), null);
  assert.equal(resolveMarketingFormRedirect({ redirectMode: "form", redirectUrl: "/cam-on" }, "http://crm.example"), null);
});

test("host snippet verifies origin/source/form and never posts with wildcard", () => {
  const source = readFileSync(fileURLToPath(new URL("../public/marketing-form-embed.js", import.meta.url)), "utf8");
  assert.match(source, /event\.origin !== iframeUrl\.origin/);
  assert.match(source, /event\.source !== iframe\.contentWindow/);
  assert.match(source, /data\.formId !== formId/);
  assert.match(source, /exactKeys\(data, baseKeys/);
  assert.match(source, /postMessage\([^]*iframeUrl\.origin\)/);
  assert.doesNotMatch(source, /postMessage\([^,]+,\s*["']\*["']/);
  assert.match(source, /redirectUrl\.protocol === "https:"/);
  assert.match(source, /iframe\.style\.minHeight = "240px"/);
  assert.match(source, /data\.url === configuredRedirect/);
});

test("iframe verifies the configured parent before accepting tracking", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/modules/marketing/pages/public-marketing-form-page.tsx", import.meta.url)), "utf8");
  assert.match(source, /event\.origin !== parentOrigin/);
  assert.match(source, /event\.source !== window\.parent/);
  assert.match(source, /parseMarketingFormEmbedMessage\(event\.data, formId\)/);
  assert.match(source, /window\.parent\.postMessage\([^]*parentOrigin\)/);
  assert.doesNotMatch(source, /postMessage\([^,]+,\s*["']\*["']/);
  assert.match(source, /submittedPayload = \{ \.\.\.payload, \.\.\.tracking \}/);
  assert.match(source, /content\?\.getBoundingClientRect\(\)\.height \?\? document\.body\.scrollHeight/);
  assert.doesNotMatch(source, /document\.documentElement\.scrollHeight/);
});

test("production share code requires an environment public base URL", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/modules/marketing/pages/marketing-forms-page.tsx", import.meta.url)), "utf8");
  assert.match(source, /VITE_PUBLIC_WEB_URL \?\? \(import\.meta\.env\.PROD \? "" : window\.location\.origin\)/);
  assert.match(source, /if \(!configuredOrigin\) return ""/);
  assert.match(source, /import\.meta\.env\.PROD && local/);
});
