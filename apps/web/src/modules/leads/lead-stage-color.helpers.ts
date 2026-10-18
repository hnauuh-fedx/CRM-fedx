export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split("").map((item) => item + item).join("")}`;
  }
  return fallback;
}

export function getReadableTextColor(hexColor: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
