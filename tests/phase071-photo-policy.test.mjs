import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir=path.dirname(fileURLToPath(import.meta.url));
const migration=fs.readFileSync(path.join(dir,"../supabase/migrations/202611050012_deleted_photo_cleanup.sql"),"utf8");
const script=fs.readFileSync(path.join(dir,"../scripts/cleanup-deleted-images.mjs"),"utf8");
test("deleted photo cleanup enforces at least 30-day retention at the database",()=>{
 assert.match(migration,/deleted_at\s*<=\s*now\(\)-interval\s*'30 days'/);
});
test("cleanup uses an explicit deleted status, never sold",()=>{
 assert.match(migration,/status='deleted'/);
 assert.match(script,/listing\?\.status!=="deleted"/);
});
test("script requires explicit execution and backup acknowledgement",()=>{
 assert.match(script,/--execute/);assert.match(script,/--backed-up/);
 assert.match(script,/if \(execute && !args\.includes\("--backed-up"\)\)/);
});
test("cleanup metadata function is privileged service role only",()=>{
 assert.match(migration,/auth\.role\(\)<>\s*'service_role'/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.marketly_finalize_deleted_image_cleanup\(uuid\) TO service_role/);
});
