import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadImportErrorsTable } from "../src/modules/leads/components/lead-import-errors-table";

function renderErrors(count: number) {
  return renderToStaticMarkup(createElement(LeadImportErrorsTable, { errors: Array.from({ length: count }, (_, index) => ({
    row: index + 3, fullName: `Candidate-${index + 1}`, phone: null, message: `Error-${index + 1}`,
  })) }));
}

test("import errors render only one page while keeping navigation to all remaining errors", () => {
  const html = renderErrors(45);
  const body = html.match(/<tbody[^>]*>(.*?)<\/tbody>/s)![1];
  assert.equal((body.match(/<tr\b/g) ?? []).length, 20);
  assert.ok(body.includes("Candidate-20"));
  assert.ok(!body.includes("Candidate-21"));
  assert.ok(html.includes("Hiển thị lỗi 1–20 / 45. Trang 1 / 3."));
  assert.match(html, /<nav[^>]*aria-label="Phân trang lỗi import"/);
  assert.match(html, /<button[^>]*aria-label="Trang đầu"[^>]*disabled=""/);
  assert.doesNotMatch(html, /<button[^>]*aria-label="Trang cuối"[^>]*disabled=""/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 4);
  assert.equal((html.match(/<button[^>]*type="button"/g) ?? []).length, 4);
});

test("single page disables navigation and preserves missing values", () => {
  const html = renderErrors(1);
  assert.ok(html.includes("Hiển thị lỗi 1–1 / 1. Trang 1 / 1."));
  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 4);
  assert.ok(html.includes(">-</td>"));
});

test("maximum Bizfly result reports all 5000 errors without rendering all rows", () => {
  const html = renderErrors(5000);
  assert.ok(html.includes("Hiển thị lỗi 1–20 / 5000. Trang 1 / 250."));
  assert.equal((html.match(/<tbody[^>]*>(.*?)<\/tbody>/s)![1].match(/<tr\b/g) ?? []).length, 20);
});
