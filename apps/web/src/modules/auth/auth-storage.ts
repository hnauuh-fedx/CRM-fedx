const localTokenKey = "admission-crm.access-token";
const sessionTokenKey = "admission-crm.session-token";

export function readAccessToken() {
  return localStorage.getItem(localTokenKey) ?? sessionStorage.getItem(sessionTokenKey);
}

export function persistAccessToken(accessToken: string, rememberDevice: boolean) {
  clearAccessToken();
  const storage = rememberDevice ? localStorage : sessionStorage;
  storage.setItem(rememberDevice ? localTokenKey : sessionTokenKey, accessToken);
}

export function clearAccessToken() {
  localStorage.removeItem(localTokenKey);
  sessionStorage.removeItem(sessionTokenKey);
}
