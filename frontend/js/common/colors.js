export const FALLBACK_TAG_COLOR = "#6c757d";

export function sanitizeHexColor(color) {
  if (!color || typeof color !== "string") return FALLBACK_TAG_COLOR;
  let value = color.trim();
  if (!value) return FALLBACK_TAG_COLOR;
  if (!value.startsWith("#")) value = `#${value}`;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  if (!/^#[0-9a-f]{6}$/i.test(value)) return FALLBACK_TAG_COLOR;
  return value.toLowerCase();
}

export function getReadableTextColor(hex) {
  if (!hex || typeof hex !== "string") return "#fff";
  let value = hex.trim().replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (value.length !== 6) return "#fff";
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if ([r, g, b].some((num) => Number.isNaN(num))) return "#fff";
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#212529" : "#fff";
}
