const localTokenKey = "admission-crm.access-token";
const sessionTokenKey = "admission-crm.session-token";

export function clearLegacyAccessTokens() {
  localStorage.removeItem(localTokenKey);
  sessionStorage.removeItem(sessionTokenKey);
}
