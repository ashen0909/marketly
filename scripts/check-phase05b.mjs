/** Read-only Phase 05B schema/security diagnostic. Does not create orders or modify data. */
import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const pk=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!pk||!key){console.error('❌ Set Supabase URL, public and server-only keys in .env.local. Never share the keys.');process.exit(1)}
const opts={auth:{autoRefreshToken:false,persistSession:false}};
const admin=createClient(url,key,opts),anon=createClient(url,pk,opts);
let failed=0;
for(const [table,fields] of [
 ['marketly_sandbox_payments','id,kind,status,amount_lkr,mode'],
 ['marketly_sandbox_entitlements','id,kind,credits_total,credits_used,ends_at,mode'],
 ['messages','id,is_system'],
 ['listings','id,deleted_at,status'],
]){
 const {error}=await admin.from(table).select(fields).limit(1);
 if(error){failed++;console.error(`❌ ${table}: ${error.code??'ERROR'} ${error.message}`)}
 else console.log(`✅ ${table}: SQL 006 columns available`);
}
for(const table of ['marketly_sandbox_payments','marketly_sandbox_entitlements']){
 const {data,error}=await anon.from(table).select('id').limit(1);
 // Permission error is acceptable; no rows is also safe under RLS.
 if(!error&&(data?.length??0)>0){failed++;console.error(`❌ ${table}: PUBLIC DATA LEAK`)}
 else console.log(`✅ ${table}: anonymous rows not exposed`);
}
const {error:publicError}=await anon.rpc('marketly_sandbox_record_result',{
 p_payment_id:'00000000-0000-4000-8000-000000000000',p_success:true
});
if(!publicError){failed++;console.error('❌ Anonymous user could invoke sandbox verifier')}
else console.log('✅ Sandbox verifier rejects anonymous requests');
const {error:publicStartError}=await anon.rpc('marketly_sandbox_start_checkout',{
 p_user_id:'00000000-0000-4000-8000-000000000000',p_kind:'extra_ad',p_listing_id:null,
 p_plan_id:null,p_photo_count:null,p_request_key:'00000000-0000-4000-8000-000000000000'
});
if(!publicStartError){failed++;console.error('❌ Anonymous user could create sandbox order')}
else console.log('✅ Sandbox checkout creation rejects anonymous requests');
if(failed){console.error(`❌ Phase 05B check found ${failed} issue(s).`);process.exitCode=1}
else console.log('✅ Phase 05B schema check PASS. Test seller delete and sold notices with two accounts next.');
