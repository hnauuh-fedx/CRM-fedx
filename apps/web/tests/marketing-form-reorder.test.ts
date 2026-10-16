import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type DragEvent, type KeyboardEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { marketingFormIndexAfterMove, moveMarketingFormItems, resolveMarketingFormReorder } from "../src/modules/marketing/marketing-form-reorder-model";
import { useMarketingFormReorder } from "../src/modules/marketing/use-marketing-form-reorder";

test("stable IDs reject external, removed, duplicate and no-op targets; first page remains fixed", () => {
  assert.deepEqual(resolveMarketingFormReorder(["a", "b", "c"], "a", "c"), { from: 0, to: 2 });
  for (const [source, target] of [[null, "c"], ["external", "b"], ["b", "missing"], ["b", "b"]]) assert.equal(resolveMarketingFormReorder(["a", "b", "c"], source, target!), null);
  assert.equal(resolveMarketingFormReorder(["a", "a"], "a", "a"), null);
  assert.equal(resolveMarketingFormReorder(["a", "b", "c"], "a", "c", true), null);
  assert.equal(resolveMarketingFormReorder(["a", "b", "c"], "c", "a", true), null);
  assert.deepEqual(resolveMarketingFormReorder(["a", "b", "c"], "b", "c", true), { from: 1, to: 2 });
});
test("move preserves all question metadata and does not mutate source; editor follows non-adjacent moves", () => {
  const items = ["a", "b", "c", "d"].map(id => ({ id, validationRules: { formLayout: { pageId: "p", groupId: "g" } }, crmMappingField: id }));
  const moved = moveMarketingFormItems(items, 0, 3);
  assert.deepEqual(moved.map(item => item.id), ["b", "c", "d", "a"]);
  assert.deepEqual(items.map(item => item.id), ["a", "b", "c", "d"]);
  assert.equal(moved[3], items[0]);
  assert.deepEqual([0, 1, 2, 3, null].map(index => marketingFormIndexAfterMove(index, 0, 3)), [3, 0, 1, 2, null]);
  assert.deepEqual([0, 1, 2, 3].map(index => marketingFormIndexAfterMove(index, 3, 1)), [0, 2, 3, 1]);
  assert.deepEqual(moveMarketingFormItems(items, -1, 3), items);
});
function capture(options: Parameters<typeof useMarketingFormReorder>[0]) {
  let result: ReturnType<typeof useMarketingFormReorder> | undefined;
  function Harness() { result = useMarketingFormReorder(options); return createElement("div"); }
  renderToStaticMarkup(createElement(Harness));
  assert.ok(result);
  return result;
}
function dragEvent() {
  return { dataTransfer: { effectAllowed: "none", dropEffect: "none", setData() {} }, preventDefault() {}, stopPropagation() {} } as unknown as DragEvent<HTMLButtonElement>;
}
test("native handler flow ignores external drops and cancelled drags, then moves once", () => {
  const moves: Array<[number, number]> = [];
  const reorder = capture({ ids: ["a", "b", "c"], label: "câu hỏi", onMove: (from, to) => moves.push([from, to]) });
  reorder.itemProps("c").onDrop(dragEvent());
  assert.deepEqual(moves, []);
  reorder.handleProps("a").onDragStart(dragEvent());
  reorder.handleProps("a").onDragEnd();
  reorder.itemProps("c").onDrop(dragEvent());
  assert.deepEqual(moves, []);
  reorder.handleProps("a").onDragStart(dragEvent());
  reorder.itemProps("c").onDrop(dragEvent());
  reorder.itemProps("c").onDrop(dragEvent());
  assert.deepEqual(moves, [[0, 2]]);
});
test("Alt arrows match pointer move; plain arrows and saving/fixed page cannot reorder", () => {
  const moves: Array<[number, number]> = [];
  const options = { ids: ["a", "b", "c"], label: "trang", lockFirst: true, onMove: (from: number, to: number) => moves.push([from, to]) };
  const reorder = capture(options);
  const key = (key: string, altKey: boolean) => ({ key, altKey, preventDefault() {} }) as KeyboardEvent<HTMLButtonElement>;
  reorder.handleProps("b").onKeyDown(key("ArrowDown", false));
  reorder.handleProps("b").onKeyDown(key("ArrowUp", true));
  reorder.handleProps("a").onDragStart(dragEvent());
  reorder.itemProps("c").onDrop(dragEvent());
  assert.deepEqual(moves, []);
  reorder.handleProps("b").onKeyDown(key("ArrowDown", true));
  assert.deepEqual(moves, [[1, 2]]);
  const saving = capture({ ...options, disabled: true });
  assert.equal(saving.handleProps("b").draggable, false);
  assert.equal(saving.move("b", "c"), false);
});
