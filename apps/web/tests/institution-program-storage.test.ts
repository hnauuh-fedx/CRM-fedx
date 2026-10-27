import assert from "node:assert/strict";
import { test } from "node:test";
import { readInstitutionProgramReselectionRequired, readSelectedInstitutionProgramId, setInstitutionProgramUser, storeSelectedInstitutionProgramId, subscribeToInstitutionProgram } from "../src/modules/institutions/institution-program-storage";

test("remembered programs belong to an account and never silently change an open tab", () => {
  const values = new Map<string, string>();
  const events = new EventTarget();
  const key = "admission-crm.selected-institution-program-id";
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) } });
  const unsubscribe = subscribeToInstitutionProgram(() => { changes++; });
  let changes = 0;
  try {
    values.set(key, "unowned-legacy-program");
    setInstitutionProgramUser("first");
    assert.equal(readSelectedInstitutionProgramId(), null);
    assert.equal(values.has(key), false);
    storeSelectedInstitutionProgramId("a");
    assert.equal(values.get(`${key}:first`), "a");
    // Another tab remembers B without switching this tab's active form/header.
    values.set(`${key}:first`, "b");
    assert.equal(readSelectedInstitutionProgramId(), "a");
    setInstitutionProgramUser("first");
    assert.equal(readSelectedInstitutionProgramId(), "a", "Refreshing the same identity preserves this tab's context");
    setInstitutionProgramUser(null);
    assert.equal(readSelectedInstitutionProgramId(), null);
    assert.equal(values.get(`${key}:first`), "b", "Logout preserves the account preference");
    setInstitutionProgramUser("second");
    assert.equal(readSelectedInstitutionProgramId(), null);
    storeSelectedInstitutionProgramId("c");
    setInstitutionProgramUser("first");
    assert.equal(readSelectedInstitutionProgramId(), "b");
    storeSelectedInstitutionProgramId(null);
    assert.equal(readInstitutionProgramReselectionRequired(), true);
    assert.equal(values.has(`${key}:first`), false);
    storeSelectedInstitutionProgramId("a");
    assert.equal(readInstitutionProgramReselectionRequired(), false);
    // A browser that blocks persistence still allows working in the current tab.
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("Storage denied"); } });
    setInstitutionProgramUser("third");
    storeSelectedInstitutionProgramId("d");
    assert.equal(readSelectedInstitutionProgramId(), "d");
    assert.ok(changes >= 8);
  } finally {
    unsubscribe();
    setInstitutionProgramUser(null);
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
