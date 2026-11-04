/** Marketly Phase 04 schema diagnostics. Never print credentials. */
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!publicKey||!secret){console.error('Missing Supabase URL, publishable key or server secret in .env.local');process.exit(1)}
const args={auth:{persistSession:false,autoRefreshToken:false}};
const publicDb=createClient(url,publicKey,args),adminDb=createClient(url,secret,args);
let failures=0;
const schema=[['listings','id,moderation_status,is_negotiable'],['listing_images','id,preview_storage_path'],['listing_reports','id,reason,status'],['seller_verification_requests','id,kind,status'],['marketly_admins','user_id'],['marketly_admin_log','id,action']];
for(const [table,fields] of schema){
  const {error}=await adminDb.from(table).select(fields).limit(1);
  if(error){failures++;console.error(`❌ ${table}: ${error.code||'error'} ${error.message}`)}
  else console.log(`✅ ${table}: Phase 04 schema available`);
}
const {data:isAdmin,error:adminCheckError}=await publicDb.rpc('marketly_is_admin');
if(adminCheckError){failures++;console.error('❌ Anonymous admin check:',adminCheckError.message)}
else if(isAdmin!==false){failures++;console.error('❌ Anonymous user must never be admin')}
else console.log('✅ Anonymous users cannot be admins');
for(const table of ['listing_reports','seller_verification_requests','marketly_admin_log']){
  const {data,error}=await publicDb.from(table).select('id').limit(1);
  if(!error && (data?.length??0)>0){failures++;console.error(`❌ Anonymous visitor read private ${table} data`)}
  else console.log(`✅ ${table}: anonymous access not exposing rows`);
}
if(failures){console.error(`❌ Phase 04 checks failed: ${failures}`);process.exitCode=1}
else console.log('✅ Phase 04 schema checks passed. Next: authenticated seller/admin end-to-end tests.');
