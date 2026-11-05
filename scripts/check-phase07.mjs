/** Read-only checks: Phase 07 table and RPC permission boundaries. Never prints credentials. */
import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!pub||!secret){console.error("Missing Supabase config; do not share secret keys.");process.exit(1)}
const options={auth:{autoRefreshToken:false,persistSession:false}};
const admin=createClient(url,secret,options),anonymous=createClient(url,pub,options);
let failures=0;
for(const [table,columns] of [["marketly_listing_drafts","id,seller_id,title,description,price_lkr,category,location,condition,is_negotiable,image_paths,preview_paths,updated_at"],["listing_images","listing_id,storage_path,preview_storage_path,position"],["listings","id,title,moderation_status,moderation_note,status"]]){
 const {error}=await admin.from(table).select(columns).limit(1);
 if(error){failures++;console.error(`FAIL ${table}: ${error.message}`)}else console.log(`PASS ${table} columns`);
}
const {data:unread,error:anonError}=await anonymous.from("marketly_listing_drafts").select("id").limit(1);
if(!anonError&&(unread?.length||0)>0){failures++;console.error("FAIL anonymous access to drafts")}
else console.log("PASS anonymous draft rows hidden");
const fakeId="00000000-0000-4000-8000-000000000000";
const rpcCases=[
 ["marketly_save_listing_draft",{p_draft_id:null,p_title:"",p_description:"",p_price_lkr:null,p_category:null,p_location:null,p_condition:null,p_is_negotiable:false,p_image_paths:[],p_preview_paths:[]}],
 ["marketly_submit_listing_draft",{p_draft_id:fakeId}],
 ["marketly_delete_listing_draft",{p_draft_id:fakeId}],
 ["marketly_manage_listing_photos",{p_listing_id:fakeId,p_ordered_paths:["invalid"]}],
];
for(const [name,args] of rpcCases){
 const {error}=await anonymous.rpc(name,args);
 if(!error){failures++;console.error(`FAIL ${name}: anonymous call accepted`)}
 else console.log(`PASS ${name}: anonymous call denied`);
 // Service-role request carries no user identity and must NOT write anything;
 // it lets us distinguish a missing RPC from an intentionally hidden anon RPC.
 const {error:existsError}=await admin.rpc(name,args);
 if(!existsError){failures++;console.error(`FAIL ${name}: unexpected unauthenticated service call accepted`)}
 else if(existsError.code==="PGRST202"||existsError.code==="42883"){
   failures++;console.error(`FAIL ${name}: RPC not installed or signature missing`);
 }else console.log(`PASS ${name}: RPC exists`);
}
if(failures){console.error(`${failures} Phase 07 checks failed`);process.exitCode=1}
else console.log("PASS Phase 07 schema and basic access checks. Run two-account functional tests separately.");
