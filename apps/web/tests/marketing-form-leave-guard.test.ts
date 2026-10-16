import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryRouter } from "react-router-dom";
import { createFormControl } from "react-hook-form";
import { attemptInstitutionProgramChange, type InstitutionProgramChangeGuard } from "../src/modules/institutions/institution-program-change";
import { acknowledgeMarketingFormSave, preventMarketingFormUnload, shouldBlockMarketingFormRoute } from "../src/modules/marketing/marketing-form-leave-model";
import type { MarketingFormInput } from "../src/modules/marketing/marketing-reference.types";

test("program guards run before storage/state/cache commit; cancel preserves current scope", () => {
  let selected = "a";
  let writes = 0;
  let requested: string | null = null;
  let approved: string | null = null;
  const guards = new Set<InstitutionProgramChangeGuard>();
  const guard: InstitutionProgramChangeGuard = next => {
    if (approved === next) { approved = null; return true; }
    requested = next;
    return false;
  };
  guards.add(guard);
  const attempt = (next: string) => attemptInstitutionProgramChange(next, selected, ["a", "b"], guards, value => { writes++; selected = value; });
  assert.equal(attempt("b"), false);
  assert.equal(requested, "b");
  assert.equal(selected, "a");
  assert.equal(writes, 0);
  requested = null; // Stay / Escape only clears the pending intent.
  assert.equal(selected, "a");
  assert.equal(attempt("a"), false);
  assert.equal(attempt("not-visible"), false);
  assert.equal(requested, null);
  approved = "b";
  assert.equal(attempt("b"), true);
  assert.equal(selected, "b");
  assert.equal(writes, 1);
  assert.equal(approved, null);
  assert.equal(attempt("a"), false); // Approval is not reusable for later changes.
  guards.delete(guard); // Editor unmount removes its guard.
  assert.equal(attempt("a"), true);
});

test("route guard covers sidebar, search and Back but permits same route and clean forms", async () => {
  let dirty = true;
  let saving = false;
  const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/tong-quan", "/marketing/form-survey/fixture"], initialIndex: 1 });
  const readBlocker = () => router.getBlocker("survey", ({ currentLocation, nextLocation }) => shouldBlockMarketingFormRoute(dirty, saving, currentLocation, nextLocation));
  try {
    readBlocker();
    await router.navigate("/sale/leads");
    assert.equal(router.state.location.pathname, "/marketing/form-survey/fixture");
    assert.equal(readBlocker().state, "blocked");
    readBlocker().reset!();
    await router.navigate(-1);
    assert.equal(readBlocker().state, "blocked");
    assert.equal(router.state.location.pathname, "/marketing/form-survey/fixture");
    readBlocker().proceed!();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(router.state.location.pathname, "/tong-quan");
    dirty = false;
    await router.navigate("/marketing/form-survey/fixture");
    saving = true;
    await router.navigate("/sale/leads");
    assert.equal(readBlocker().state, "blocked");
    readBlocker().reset!();
    saving = false;
    await router.navigate("/sale/leads");
    assert.equal(router.state.location.pathname, "/sale/leads");
    const current = { pathname: "/same", search: "" };
    assert.equal(shouldBlockMarketingFormRoute(true, false, current, current), false);
    assert.equal(shouldBlockMarketingFormRoute(true, false, current, { ...current, search: "?changed=1" }), true);
  } finally { router.deleteBlocker("survey"); router.dispose(); }
});

test("hard reload warning prevents unload using browser-standard contract", () => {
  let prevented = false;
  const event = { preventDefault: () => { prevented = true; }, returnValue: "initial" };
  preventMarketingFormUnload(event);
  assert.equal(prevented, true);
  assert.equal(event.returnValue, "");
});

test("successful save acknowledges only submitted values, not edits made while waiting", () => {
  const initial = { name: "Initial", fields: [], customFieldValues: {} } as unknown as MarketingFormInput;
  const form = createFormControl<MarketingFormInput>({ defaultValues: initial });
  let dirty = false;
  const unsubscribe = form.subscribe({ formState: { isDirty: true, values: true }, callback: state => { dirty = state.isDirty; } });
  try {
    form.register("name");
    form.setValue("name", "Submitted", { shouldDirty: true });
    const submitted = structuredClone(form.getValues());
    form.setValue("name", "Edited while saving", { shouldDirty: true });
    acknowledgeMarketingFormSave(form, submitted);
    assert.equal(form.getValues("name"), "Edited while saving");
    assert.equal(dirty, true);
    form.setValue("name", "Submitted", { shouldDirty: true });
    assert.equal(dirty, false);
    acknowledgeMarketingFormSave(form, submitted);
    assert.equal(dirty, false);
  } finally { unsubscribe(); }
});
