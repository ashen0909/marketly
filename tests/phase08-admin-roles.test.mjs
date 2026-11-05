/** Phase 08A static contracts. This is NOT a substitute for a connected Supabase test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const src=p=>readFileSync(resolve(root,p),'utf8');
const sql=src('supabase/migrations/202611050014_owner_subadmin_roles.sql');
const access=src('src/lib/admin-access.ts');
const manager=src('src/components/market/sub-admin-manager.tsx');
const admin=src('src/app/admin/page.tsx');
const sell=src('src/components/market/sell-form.tsx');
const photos=src('src/lib/images/upload-listing-photos.ts');

test('01 — Migration is transaction-scoped, preserving only one owner',()=>{
 assert.match(sql,/^BEGIN;/m);assert.match(sql,/^COMMIT;/m);
 assert.match(sql,/marketly_one_owner_idx/);assert.match(sql,/MULTIPLE_EXISTING_ADMINS/);
 assert.match(sql,/role\s+text NOT NULL DEFAULT 'sub_admin'/);
});
test('02 — Owner is only account allowed to manage sub-admins',()=>{
 assert.match(sql,/FUNCTION public\.marketly_owner_manage_sub_admin/);
 assert.match(sql,/IF NOT public\.marketly_is_owner\(\) THEN RAISE EXCEPTION 'OWNER_ONLY'/);
 assert.match(sql,/IF v_role='owner' THEN RAISE EXCEPTION 'OWNER_PROTECTED'/);
 assert.match(sql,/granted_at timestamptz/);
});
test('03 — Assigned privileges use database authentication rather than client UI',()=>{
 for(const p of ['listings','reports','chat_reports','verification','billing_view','audit_view']){
  assert.ok(sql.includes(`'${p}'`));assert.ok(access.includes(`"${p}"`));
 }
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.marketly_admin_has_permission/);
 assert.match(sql,/JOIN auth\.users/);
});
test('04 — Public RLS helpers are callable by anonymous visitors, return false when not signed in',()=>{
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.marketly_admin_has_permission\(text\) TO anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.marketly_is_admin\(\) TO anon,authenticated/);
 assert.match(sql,/auth\.uid\(\) IS NOT NULL/);
});
test('05 — All four existing moderation functions are permission-wrapped, legacy functions revoked',()=>{
 for(const [fn,permission] of [['listing','listings'],['report','reports'],['verification','verification'],['chat_report','chat_reports']]){
  assert.match(sql,new RegExp(`FUNCTION public\\.marketly_review_${fn}\\(`));
  assert.ok(sql.includes(`marketly_admin_has_permission('${permission}')`));
  assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.marketly_review_${fn}_before_roles`));
 }
 const blocked=sql.match(/SELF_REVIEW_NOT_ALLOWED/g)??[];assert.ok(blocked.length>=4);
});
test('06 — Owner fee waiver is authoritative in SQL, with 12 image cap and no paid gateway bypass',()=>{
 assert.match(sql,/IF NOT public\.marketly_is_owner\(\) AND \(SELECT count\(\*\) FROM public\.listing_post_ledger/);
 assert.match(sql,/THEN 12 ELSE 5 END/);
 assert.match(sql,/v_count>\(CASE WHEN public\.marketly_is_owner\(\) THEN 12 ELSE 5 END\)/);
 assert.match(sell,/photoLimit = ownerBenefits \? marketlyConfig\.maxImagesPerListing : marketlyConfig\.freeImagesPerListing/);
 assert.match(photos,/images.length>limit/);
});
test('07 — Owner boost only for own approved active listings and expires',()=>{
 assert.match(sql,/p_days NOT IN\(7,14,30\)/);
 assert.match(sql,/seller_id=auth\.uid\(\) AND status='active' AND moderation_status='approved'/);
 assert.match(sql,/owner_boost_until>now\(\)/);
 assert.match(src('src/lib/catalog.ts'),/active_owner_boost_sort/);
});
test('08 — Dashboard quick access and team manager restrict sub-admin privileges',()=>{
 for(const p of ['listings','reports','chat_reports','verification','billing_view'])assert.ok(admin.includes(`adminCan(access,"${p}")`));
 assert.match(admin,/access\.role==="owner"&&<QuickLink href="\/admin\/sub-admins"/);
 assert.match(src('src/app/admin/sub-admins/page.tsx'),/\.role!=="owner"\)notFound\(\)/);
 assert.match(manager,/marketly_owner_find_user/);assert.match(manager,/marketly_owner_manage_sub_admin/);
 assert.match(manager,/"suspend"/);assert.match(manager,/"remove"/);
});
test('09 — Existing Phase07.2 back-to-results navigation still in source',()=>{
 const details=src('src/app/listings/[id]/page.tsx');
 assert.match(details,/returnTo|back|Back/i);
 assert.ok(existsSync(resolve(root,'tests/phase072-navigation-theme.test.mjs')));
});
test('10 — Private environment files stay excluded from Git (not deleted locally)',()=>{
 // Marketly legitimately uses .env.local for Supabase configuration.
 // Check the repository's protection instead of requiring local secrets to be absent.
 const ignore=src('.gitignore');
 assert.match(ignore,/^\s*\.env\*\s*$/m,'The .gitignore must ignore private .env files');
 const git=spawnSync('git',['ls-files','--cached','-z'],{cwd:root,encoding:'utf8'});
 if(git.status===0){
  const privateEnvFiles=git.stdout.split('\0').filter(Boolean).filter(p=>{
   const basename=p.split('/').at(-1);
   return /^\.env(?:\..+)?$/.test(basename) && basename!=='.env.example';
  });
  assert.deepEqual(privateEnvFiles,[],'Private environment files must never be tracked in Git');
 }
});
