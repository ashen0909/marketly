import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Import the real TS policy through TypeScript's built-in transpiler (not a duplicate implementation).
import ts from "typescript";
const root = process.cwd();
function load(moduleName) {
  const file = path.join(root, "src/lib", moduleName + ".ts");
  let source = fs.readFileSync(file, "utf8");
  source = source.replace('from "./config"', 'from "./config"');
  const cjs = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const requireFn = (id) => id === "./config" ? load("config") : (() => { throw new Error("Unexpected module " + id); })();
  new Function("require", "module", "exports", cjs)(requireFn, module, module.exports);
  return module.exports;
}
const { quoteListingImages } = load("pricing");

test("first five images always free", () => {
  for (let n = 0; n <= 5; n++) assert.equal(quoteListingImages(n).extraImageTotalLkr, 0);
});
test("extra images cost LKR 100 each", () => {
  assert.deepEqual([6,7,8,10,12].map(n => quoteListingImages(n).extraImageTotalLkr), [100,200,300,500,700]);
});
test("unpaid extra images may not be published", () => {
  assert.equal(quoteListingImages(5).canPublishWithoutPayment, true);
  assert.equal(quoteListingImages(6).canPublishWithoutPayment, false);
});
test("invalid counts rejected", () => {
  for (const n of [-1, 1.5, 13, Infinity, NaN]) assert.throws(() => quoteListingImages(n), RangeError);
});
