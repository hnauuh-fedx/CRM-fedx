type JsonObject = Record<string, unknown>;

const metadataKeys = ["lead_id", "page_id", "advertiser_id", "campaign_id", "adgroup_id", "ad_id", "create_time", "form_name", "page_name"] as const;
const answerListKeys = ["changes", "field_data", "fields", "answers", "user_info", "lead_data"] as const;
const nestedLeadKeys = ["lead", "data", "content", "event_data"] as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string" || !value.trim().startsWith("{")) return value;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

/** Converts a form question label such as "Phone Number" into a stable mapping key: "phone_number". */
export function normalizeTikTokFieldKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 150);
}

function toScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(toScalar).filter((item) => item !== null && item !== "");
    return items.length ? items.join(", ") : null;
  }
  return null;
}

function collectAnswers(list: unknown, output: JsonObject) {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!isObject(item)) continue;
    const label = item.field ?? item.field_name ?? item.name ?? item.key ?? item.question ?? item.label;
    if (typeof label !== "string" || !label.trim()) continue;
    const value = toScalar(item.value ?? item.values ?? item.answer ?? item.field_value);
    const key = normalizeTikTokFieldKey(label);
    if (key && value !== null && output[key] === undefined) output[key] = value;
  }
}

function collectFrom(source: JsonObject, output: JsonObject, depth: number) {
  if (Array.isArray(source.entry)) return;
  for (const key of metadataKeys) {
    const value = toScalar(source[key]);
    if (value !== null && output[key] === undefined) output[key] = String(value);
  }
  for (const key of answerListKeys) collectAnswers(parseMaybeJson(source[key]), output);
  for (const [key, raw] of Object.entries(source)) {
    if ((answerListKeys as readonly string[]).includes(key) || (nestedLeadKeys as readonly string[]).includes(key)) continue;
    const value = toScalar(raw);
    const normalized = normalizeTikTokFieldKey(key);
    if (normalized && value !== null && output[normalized] === undefined) output[normalized] = value;
  }
  if (depth >= 3) return;
  for (const key of nestedLeadKeys) {
    const nested = parseMaybeJson(source[key]);
    if (isObject(nested)) collectFrom(nested, output, depth + 1);
  }
}

/**
 * TikTok lead notifications nest form answers in a list of { name, value } items. The CRM webhook
 * mapping engine works on flat keys, so answers are flattened to normalized keys (e.g. "phone_number")
 * next to TikTok metadata such as lead_id and page_id.
 */
export function flattenTikTokLeadPayload(payload: unknown) {
  const parsed = parseMaybeJson(payload);
  const flat: JsonObject = {};
  if (isObject(parsed)) collectFrom(parsed, flat, 0);
  const leadId = typeof flat.lead_id === "string" && flat.lead_id ? flat.lead_id : null;
  return { leadId, flat };
}

/**
 * TikTok sends 19-digit ids (lead, page, advertiser) as JSON numbers, which JSON.parse silently rounds
 * (7698222831972811234 -> 7698222831972811000). Quote long integer literals before parsing.
 */
export function parseTikTokJson(raw: string): unknown {
  return JSON.parse(raw.replace(/([:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"'));
}

/**
 * Real TikTok lead notifications look like { entry: [{ id, page_id, advertiser_id, changes: [{ field, value }] }] },
 * one entry per lead. Older/alternative shapes with a single lead are still accepted.
 */
export function extractTikTokLeads(payload: unknown) {
  const parsed = parseMaybeJson(payload);
  if (isObject(parsed) && Array.isArray(parsed.entry)) {
    return parsed.entry.filter(isObject).flatMap((entry) => {
      const flat: JsonObject = {};
      collectFrom({ ...entry, lead_id: entry.lead_id ?? entry.id }, flat, 0);
      const leadId = typeof flat.lead_id === "string" && flat.lead_id ? flat.lead_id : null;
      return leadId ? [{ leadId, flat, raw: entry }] : [];
    });
  }
  const single = flattenTikTokLeadPayload(parsed);
  return single.leadId ? [{ leadId: single.leadId, flat: single.flat, raw: parsed }] : [];
}
