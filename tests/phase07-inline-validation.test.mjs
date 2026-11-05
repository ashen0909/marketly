import test from "node:test";
import assert from "node:assert/strict";
import { listingFieldIssues, firstInvalidListingField } from "../src/lib/listing-quality.ts";
const good = {
  title: "Samsung Galaxy S23 256GB", description: "Working perfectly, no issues and original box included.",
  price: 90000, category: "electronics", condition: "Used", location: "Colombo", photoCount: 3,
};
test("valid product has no inline errors", () => {
  assert.deepEqual(listingFieldIssues(good), {});
});
test("invalid fields return precise inline field messages", () => {
  const issues = listingFieldIssues({ ...good, title: "x", description: "too short", price: 0, category: "", location: "", photoCount: 0 });
  assert.equal(firstInvalidListingField(issues), "title");
  for (const field of ["title", "category", "price", "location", "description", "photos"])
    assert.equal(issues[field]?.severity, "error", field);
});
test("duplicate titles are blockers; generic names and low prices are warnings", () => {
  assert.equal(listingFieldIssues({ ...good, duplicate: true }).title?.severity, "error");
  assert.equal(listingFieldIssues({ ...good, title: "product" }).title?.severity, "warning");
  assert.equal(listingFieldIssues({ ...good, price: 20 }).price?.severity, "warning");
  assert.equal(firstInvalidListingField(listingFieldIssues({ ...good, price: 20 })), undefined);
});
test("photo count over free limit rejected", () => {
  assert.equal(listingFieldIssues({ ...good, photoCount: 6 }).photos?.severity, "error");
});
