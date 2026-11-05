import test from "node:test";
import assert from "node:assert/strict";
import { userFacingError } from "../src/lib/user-facing-error.ts";

test("unknown backend codes do not leak into the interface", () => {
  assert.equal(userFacingError("NO_CANT", "save"), "We couldn't save your changes. Please try again.");
  assert.equal(userFacingError(new Error("PGRST201: relationship ambiguous"), "general"), "Something went wrong. Please try again.");
});
test("PostgreSQL error internals are not displayed", () => {
  assert.equal(userFacingError({message:'record "old" has no field "chat_reopen_notice_pending"'},"save"), "We couldn't save your changes. Please try again.");
  assert.equal(userFacingError("permission denied for table conversations","general"), "You don't have permission to do that. Sign in or check your account.");
});
test("a sold item returns an actionable chat message", () => {
  assert.match(userFacingError("CHAT_CLOSED_ITEM_UNAVAILABLE","message"),/relisted/i);
});
test("blocked and rate-limited chats get readable messages", () => {
  assert.match(userFacingError("CHAT_BLOCKED","message"),/blocked/);
  assert.match(userFacingError("MESSAGE_RATE_LIMIT","message"),/quickly/);
});
test("posting and draft codes get precise messages", () => {
  assert.match(userFacingError("MAX_TEN_DRAFTS","save"),/ten drafts/);
  assert.match(userFacingError("DUPLICATE_ACTIVE_AD_TITLE","save"),/active ad/);
});
test("common connectivity problems get a retry instruction", () => {
  assert.match(userFacingError(new TypeError("Failed to fetch"),"billing"),/internet/);
  assert.match(userFacingError("NetworkError when attempting to fetch resource"),/connection/i);
});
test("rate limiting and auth problems are safely mapped", () => {
  assert.match(userFacingError("429 Too many requests"),/too many attempts/i);
  assert.match(userFacingError("JWT expired"),/sign in again/i);
});
test("a clear field validation hint stays visible", () => {
  assert.equal(userFacingError("Please select a district.","save"),"Please select a district.");
});
test("sensitive server detail never appears when passed a non-error object", () => {
  assert.equal(userFacingError({ token: "abc123" },"billing"),"The test checkout couldn't finish. Please try again.");
});
