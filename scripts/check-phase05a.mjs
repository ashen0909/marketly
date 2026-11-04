/** Marketly Phase 05A: read-only schema checks. Do not log credentials. */
import { createClient } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const pk=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!pk||!secret){console.error('❌ Missing Supabase configuration (URL, public key, or server-only key).');process.exit(1)}
const opts={auth:{autoRefreshToken:false,persistSession:false}};
const admin=createClient(url,secret,opts);const anon=createClient(url,pk,opts);
let errors=0;
for(const [table,fields] of [['marketly_test_orders','id,kind,status,payment_mode,amount_lkr'],['notifications','id,listing_id,kind']]){
 const {error}=await admin.from(table).select(fields).limit(1);
 if(error){errors++;console.error(`❌ ${table}: ${error.code??'ERROR'} ${error.message}`)}
 else console.log(`✅ ${table}: Phase 05A schema available`);
}
const {data:unauthOrders,error:anonError}=await anon.from('marketly_test_orders').select('id').limit(1);
if(!anonError && (unauthOrders?.length??0)>0){errors++;console.error('❌ Anonymous users can read test orders. Check permissions!')}
else console.log('✅ Anonymous users cannot view test orders');
const {error:anonymousRpc}=await anon.rpc('marketly_create_test_order',{
 p_kind:'business',p_listing_id:null,p_plan_id:null,p_photo_count:null,p_request_key:'00000000-0000-4000-8000-000000000000'
});
if(!anonymousRpc){errors++;console.error('❌ Anonymous user unexpectedly created a test order!')}
else console.log('✅ Anonymous users cannot create test orders');
if(errors){console.error(`❌ Phase 05A failed ${errors} checks`);process.exitCode=1}
else console.log('✅ Phase 05A schema checks passed. Next: authenticated UI and admin notification tests.');
