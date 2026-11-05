import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSriLankanMobile } from "../src/lib/profile-phone.ts";
import { districtTowns, sriLankaDistricts, townsForDistrict, isKnownTown, otherTownValue } from "../src/lib/sri-lanka-towns.ts";
import { profileCompletion, emptyProfileDetails } from "../src/lib/profile-completion.ts";

test("local Sri Lankan 07 mobile numbers normalize to +94", () => {
  assert.equal(normalizeSriLankanMobile("0771234567"), "+94771234567");
  assert.equal(normalizeSriLankanMobile("077 123 4567"), "+94771234567");
  assert.equal(normalizeSriLankanMobile("+94 77 123 4567"), "+94771234567");
  assert.equal(normalizeSriLankanMobile("94771234567"), "+94771234567");
});
test("invalid phone input is rejected rather than guessed", () => {
  assert.equal(normalizeSriLankanMobile("0112345678"), null);
  assert.equal(normalizeSriLankanMobile("077123456"), null);
  assert.equal(normalizeSriLankanMobile("+947712345678"), null);
});
test("all 25 existing Marketly districts have towns", () => {
  assert.equal(sriLankaDistricts.length,25);
  for (const district of sriLankaDistricts) assert.ok(districtTowns[district].length >= 5, district);
});
test("only district-specific towns appear in the dropdown", () => {
  assert.ok(isKnownTown("Gampaha", "Negombo"));
  assert.equal(isKnownTown("Colombo", "Negombo"), false);
  assert.ok(townsForDistrict("Gampaha").includes("Kadawatha"));
  assert.deepEqual(townsForDistrict("not a real district"), []);
  assert.equal(otherTownValue, "__other__");
});
test("profile completion only reaches 100 after all saved criteria exist", () => {
  const complete = profileCompletion("Example", { ...emptyProfileDetails,
    full_name:"Example Seller",phone:normalizeSriLankanMobile("0771234567"),
    district:"Gampaha",city:"Negombo",about:"Selling quality items.",
    contact_preference:"chat",photo_path:"some/valid/avatar.webp" });
  assert.equal(complete.percentage,100);
  assert.equal(complete.complete,true);
});
