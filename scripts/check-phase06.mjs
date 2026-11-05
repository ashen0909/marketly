/** Read-only Phase 06 schema and anonymous permissions check. No customer data is changed. */
import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const privateKey=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!publicKey||!privateKey){console.error("Missing Supabase environment values. Do not share your keys.");process.exit(1)}
const settings={auth:{autoRefreshToken:false,persistSession:false}};
const admin=createClient(url,privateKey,settings),anon=createClient(url,publicKey,settings);
let errors=0;
for(const [name,cols] of [
 ["listings","id,expires_at,renewal_pending"],
 ["messages","id,is_system,read_at"],
 ["marketly_listing_renewals","id,billing_month"],
 ["marketly_chat_blocks","conversation_id,blocker_id"],
 ["marketly_chat_reports","id,status,reason"],
 ["marketly_seller_follows","follower_id,seller_id"],
 ["marketly_pending_price_drops","listing_id,previous_price"],
]) {
 const {error}=await admin.from(name).select(cols).limit(1);
 if(error){errors++;console.error(`FAIL ${name}: ${error.message}`)}
 else console.log(`PASS ${name} schema`);
}
for (const table of ["marketly_chat_blocks","marketly_chat_reports","marketly_seller_follows","marketly_pending_price_drops","marketly_listing_renewals"]) {
 const {data,error}=await anon.from(table).select("*").limit(1);
 if(!error && (data?.length??0)>0){errors++;console.error(`FAIL ${table}: anonymous rows visible`)}
 else console.log(`PASS ${table}: anonymous rows hidden`);
}
for(const [name,args] of [
 ["send_message",{p_conversation_id:"00000000-0000-4000-8000-000000000000",p_body:"test"}],
 ["marketly_chat_state",{p_conversation_id:"00000000-0000-4000-8000-000000000000"}],
 ["marketly_review_chat_report",{p_report_id:"00000000-0000-4000-8000-000000000000",p_status:"reviewed"}],
 ["marketly_toggle_seller_follow",{p_seller_id:"00000000-0000-4000-8000-000000000000"}],
 ]) {
 const {error}=await anon.rpc(name,args);
 if(!error){errors++;console.error(`FAIL ${name}: anonymous request unexpectedly accepted`)}
 else console.log(`PASS ${name}: anonymous RPC rejected`);
}
if(errors){console.error(`Phase 06 checks failed: ${errors}`);process.exitCode=1}
else console.log("PASS Phase 06 schema and privacy checks. Still test full interactions with two user accounts.");
