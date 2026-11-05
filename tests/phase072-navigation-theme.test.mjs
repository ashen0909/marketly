import test from "node:test";
import assert from "node:assert/strict";
import { safeListingReturn, listingDetailHref } from "../src/lib/listing-return.ts";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const helper = read("src/lib/listing-return.ts");
const detail = read("src/app/listings/[id]/page.tsx");
const card = read("src/components/market/listing-card.tsx");
const membership = read("src/app/membership/page.tsx");
const billing = read("src/app/billing/page.tsx");
const checkout = read("src/components/market/sandbox-checkout.tsx");

test("listing card receives an explicit return origin", () => {
  assert.match(card,/returnTo\?: string/);
  assert.match(card,/listingDetailHref\(listing\.id, returnTo\)/);
});
test("return-path allowlist excludes external navigation", () => {
  assert.match(helper,/raw\.startsWith\("\/\/"\)/);
  assert.match(helper,/allowed \? .* : null/);
  assert.match(helper,/encodeURIComponent\(from\)/);
});
test("listing detail renders visible top and bottom back links", () => {
  assert.match(detail,/aria-label="Return to previous page"/);
  assert.equal((detail.match(/<BackToBrowse isOwner=\{isOwner\} returnTo=\{from\}\/>/g)||[]).length,2);
});
test("browse and favorites carry filters and pagination", () => {
  const browse=read("src/app/listings/page.tsx");
  const fav=read("src/app/favorites/page.tsx");
  const dashboard=read("src/app/dashboard/page.tsx");
  assert.match(browse,/originQuery\.set/);
  assert.match(browse,/returnTo=\{returnTo\}/);
  assert.match(fav,/returnTo=\{`\/favorites\?page=\$\{page\}`\}/);
  assert.match(dashboard,/returnTo=\{dashboardReturn\}/);
});
test("membership and billing prioritize graphite and gold", () => {
  assert.match(membership,/to-\[#F6E8D0\]/);
  assert.match(billing,/to-\[#F7ECD8\]/);
  assert.match(checkout,/bg-\[#24272E\]/);
  assert.doesNotMatch(membership,/bg-\[#DFF5E7\]/);
});

test("return URLs preserve real browse filters, pagination and unicode search", () => {
  const from="/listings?q=Samsung+S24&category=electronics&location=Gampaha&page=3";
  const href=listingDetailHref("example-listing", from);
  assert.equal(href,`/listings/example-listing?from=${encodeURIComponent(from)}`);
  assert.equal(safeListingReturn(new URL(href,"https://marketly.invalid").searchParams.get("from")),from);
});
test("other entry points return to the exact parent view", () => {
  for (const origin of ["/", "/favorites?page=2", "/dashboard?status=sold&q=bike&page=4", "/sellers/12345678-1234-1234-1234-1234567890ab?page=2"]) {
    const href=listingDetailHref("item", origin);
    const back=safeListingReturn(new URL(href,"https://marketly.invalid").searchParams.get("from"));
    assert.equal(back,origin);
  }
});
test("unsafe redirect origins and stale product loops are rejected", () => {
  for (const origin of ["https://evil.example", "//evil.example", "/\\evil", "/login", "/listings/another-id", "/%2F%2Fevil", "\r\n", "/listings#secret"]) {
    assert.equal(safeListingReturn(origin),null,`should reject: ${JSON.stringify(origin)}`);
  }
  assert.equal(safeListingReturn(["/listings"]),null);
  assert.equal(listingDetailHref("item","//evil.example"),"/listings/item");
});
