const selectedProgramStorageKey = "admission-crm.selected-institution-program-id";
export const selectedProgramChangedEvent = "admission-crm:program-changed";
let activeUserId: string | null = null;
let selectedProgramId: string | null = null;
let needsReselection = false;

// Other tabs may remember their choice, but must not switch an open form.
export function setInstitutionProgramUser(userId: string | null) {
  if (activeUserId === userId) return;
  activeUserId = userId;
  selectedProgramId = null;
  needsReselection = false;
  try {
    // The old shared key has no trustworthy account owner; confirm it again.
    window.localStorage.removeItem(selectedProgramStorageKey);
    if (userId) selectedProgramId = window.localStorage.getItem(`${selectedProgramStorageKey}:${userId}`);
  } catch { /* The current tab still works when storage is unavailable. */ }
  window.dispatchEvent(new Event(selectedProgramChangedEvent));
}

export function readSelectedInstitutionProgramId() {
  return selectedProgramId;
}

export function storeSelectedInstitutionProgramId(programId: string | null) {
  needsReselection = !programId && Boolean(selectedProgramId);
  selectedProgramId = programId;
  if (activeUserId) {
    try {
      const key = `${selectedProgramStorageKey}:${activeUserId}`;
      if (programId) window.localStorage.setItem(key, programId);
      else window.localStorage.removeItem(key);
    } catch { /* Preserve the in-memory selection if persistence is blocked. */ }
  }
  window.dispatchEvent(new Event(selectedProgramChangedEvent));
}

export function readInstitutionProgramReselectionRequired() {
  return needsReselection;
}

export function subscribeToInstitutionProgram(listener: () => void) {
  window.addEventListener(selectedProgramChangedEvent, listener);
  return () => window.removeEventListener(selectedProgramChangedEvent, listener);
}
