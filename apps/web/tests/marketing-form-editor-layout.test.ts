import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Structural CSS regression: a child spanning 5 columns in the real 2-column
// editor creates implicit grid tracks and squeezes the preceding controls.
test("choice configuration cannot create implicit columns in the question editor", () => {
  const editor = readFileSync(new URL("../src/modules/marketing/marketing-form-question-editor.tsx", import.meta.url), "utf8");
  const choices = readFileSync(new URL("../src/modules/marketing/marketing-form-choice-options-editor.tsx", import.meta.url), "utf8");
  assert.ok(editor.includes("grid-cols-2"), "Fixture reaches the existing two-column editor.");
  const wrapper = choices.match(/<section className="([^"]+)"/)?.[1];
  assert.ok(wrapper, "Inspect the actual choice editor wrapper, not a copied fixture.");
  for (const token of wrapper.split(/\s+/)) {
    const span = token.match(/(?:^|:)col-span-(\d+)$/);
    assert.ok(!span || Number(span[1]) <= 2, `Choice editor ${token} creates implicit columns in its two-column parent.`);
  }
  assert.ok(wrapper.includes("col-span-full"), "Choice configuration must fill the available row at every width.");
});
test("visibility fills the row and option rows avoid fixed-width desktop tracks", () => {
  const visibility = readFileSync(new URL("../src/modules/marketing/marketing-form-visibility-editor.tsx", import.meta.url), "utf8");
  const wrapper = visibility.match(/return <FieldSet className="([^"]+)"/)?.[1] ?? "";
  assert.ok(wrapper.includes("col-span-full") && wrapper.includes("min-w-0"));
  const source = readFileSync(new URL("../src/modules/marketing/marketing-form-choice-options-editor.tsx", import.meta.url), "utf8");
  assert.match(source, /<ChoiceOptionRow\s+key=\{option.value\}/, "Options must keep their stable keys when composed into rows.");
  const choices = source.slice(source.indexOf("function ChoiceOptionRow("));
  const row = choices.match(/<div\b[^>]*className="([^"]+)"/)?.[1] ?? "";
  assert.ok(row.includes("sm:grid-cols-2") && row.includes("min-w-0"));
  assert.doesNotMatch(row, /grid-cols-\[.*\d+px/);
});
