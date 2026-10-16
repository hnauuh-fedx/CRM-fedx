export function isAutomationProviderConfigured(url: string | undefined, token: string | undefined, integration = false) {
  if (!url || !token?.trim()) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (integration && local) return ["http:", "https:"].includes(parsed.protocol);
    return parsed.protocol === "https:" && !local;
  } catch { return false; }
}
