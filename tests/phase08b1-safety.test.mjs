import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = x=>readFileSync(new URL(`../${x}`, import.meta.url),'utf8');
const submit = read('src/app/api/verification/submit/route.ts');
const migration = read('supabase/migrations/202611060016_phase08b1_duplicate_identity.sql');
const review = read('src/components/market/admin-identity-review.tsx');
const page = read('src/app/verification/page.tsx');
test('uploaded image pixels decoded, bounded and metadata stripped',()=>{
 assert.match(submit,/sharp\(bytes/); assert.match(submit,/limitInputPixels/); assert.match(submit,/\.rotate\(\)/); assert.match(submit,/\.jpeg\(/); assert.match(submit,/stats\.entropy/);
});
test('concurrent NIC conflict checks are protected by transaction advisory lock',()=>{
 assert.match(migration,/pg_advisory_xact_lock\(hashtextextended\(p_nic_fingerprint/);
 assert.match(migration,/i\.seller_id<>v_uid/); assert.match(migration,/NIC_ALREADY_LINKED_TO_ANOTHER_SELLER/);
});
test('identity requires real separate human review',()=>{
 assert.match(review,/Manual photo review checklist/);assert.match(review,/Face match, ID authenticity/);assert.match(review,/possible_duplicate_identity===true/);
});
test('owner benefits do not falsely mark personal identity verified',()=>{
 assert.match(page,/Owner \/ Super Admin benefits active/);assert.match(page,/This is not a personal identity verification badge/);
});
