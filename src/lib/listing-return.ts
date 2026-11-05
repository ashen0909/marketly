/** Internal listing-return destinations only; prevents externally supplied open redirects. */
export function safeListingReturn(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw || raw.length > 1800 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\r\n#]/.test(raw)) return null;
  try {
    const url = new URL(raw, "https://marketly.invalid");
    if (url.origin !== "https://marketly.invalid") return null;
    const path = url.pathname;
    const allowed = path === "/" || path === "/listings" || path === "/favorites" || path === "/dashboard"
      || /^\/sellers\/[0-9a-f-]{36}$/i.test(path) || /^\/messages(?:\/[0-9a-f-]{36})?$/i.test(path);
    return allowed ? `${path}${url.search}` : null;
  } catch { return null; }
}

/** Make a product's origin explicit so a back link survives refresh and direct route navigation. */
export function listingDetailHref(listingId: string, origin?: string | null): string {
  const from = safeListingReturn(origin);
  return `/listings/${encodeURIComponent(listingId)}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
}
