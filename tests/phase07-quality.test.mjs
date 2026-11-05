import test from "node:test";
import assert from "node:assert/strict";
import {listingQuality,sameTitle} from "../src/lib/listing-quality.ts";
test("exact and whitespace/case-variant titles are duplicates",()=>{
 assert.equal(sameTitle(" iPhone  13 ","IPHONE 13"),true);
 assert.equal(sameTitle("iPhone 13","iPhone 14"),false);
});
test("no false alarms on complete fields",()=>{
 assert.deepEqual(listingQuality("Samsung S23 256GB","Fully working handset with original box",85000,3),[]);
});
test("missing details, missing image and suspicious low price are flagged",()=>{
 const tips=listingQuality("Test","short",20,0);
 assert.ok(tips.some(t=>t.includes("descriptive title")));
 assert.ok(tips.some(t=>t.includes("Describe condition")));
 assert.ok(tips.some(t=>t.includes("photo")));
 assert.ok(tips.some(t=>t.includes("unusually low")));
});
test("more than five photos warns before real payments",()=>{
 assert.ok(listingQuality("Samsung S23 256GB","Excellent used condition. No damage.",10000,6).some(t=>t.includes("first five")));
});
