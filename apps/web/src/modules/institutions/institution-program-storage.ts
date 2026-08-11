const selectedProgramStorageKey = "admission-crm.selected-institution-program-id";

export function readSelectedInstitutionProgramId() {
  return window.localStorage.getItem(selectedProgramStorageKey);
}

export function storeSelectedInstitutionProgramId(programId: string) {
  window.localStorage.setItem(selectedProgramStorageKey, programId);
}
