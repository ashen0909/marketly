/** Normalize Sri Lankan mobile numbers without guessing country codes. */
export function normalizeSriLankanMobile(input: string): string | null {
  const value = input.replace(/[\s().-]/g, "").trim();
  if (/^\+947\d{8}$/.test(value)) return value;
  if (/^947\d{8}$/.test(value)) return `+${value}`;
  if (/^07\d{8}$/.test(value)) return `+94${value.slice(1)}`;
  if (/^7\d{8}$/.test(value)) return `+94${value}`;
  return null;
}
