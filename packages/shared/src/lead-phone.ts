export const LEAD_PHONE_MAX_LENGTH = 30;

/** Separator used by Bizfly exports when a contact has several phone numbers. */
export const LEAD_PHONE_LIST_SEPARATOR = "|";

/** A standard Vietnamese phone number: exactly 10 digits and starts with 0. */
export function isStandardLeadPhone(value: string | null | undefined) {
  return /^0\d{9}$/.test(value?.trim() ?? "");
}

/** Removes common formatting characters while keeping unexpected ones visible for review. */
export function normalizeLeadPhone(value: unknown) {
  let phone = String(value ?? "").trim().replace(/[\s.\-()]/g, "");
  // Spreadsheet exports often drop the leading 0 of a 10-digit number.
  if (/^[1-9]\d{8}$/.test(phone)) phone = `0${phone}`;
  return phone;
}

/** Splits a Bizfly phone cell such as "0918979962|0963726127" into unique numbers. */
export function splitLeadPhones(value: unknown) {
  const phones = String(value ?? "").split(LEAD_PHONE_LIST_SEPARATOR).map(normalizeLeadPhone).filter(Boolean);
  return [...new Set(phones)];
}
