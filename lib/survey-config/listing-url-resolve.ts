/** Normaliza URL: agrega https:// si falta esquema. Compartido con parser y resolve. */
export function coerceListingHref(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed}`;
}
