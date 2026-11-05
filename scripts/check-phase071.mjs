/** Read-only Phase 07.1 schema/RLS checks; never prints secrets or user records. */
import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!pub||!secret){console.error("Missing Supabase config. Keep keys private.");process.exit(1);}
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(url,secret,options),anon=createClient(url,pub,options);
let errors=0;
for(const [table,cols] of [
  ["marketly_profile_details","user_id,full_name,phone,district,city,about,contact_preference,photo_path,email_notifications"],
  ["marketly_deleted_image_cleanup","id,listing_id,storage_path,preview_storage_path,deleted_at,cleaned_at"],
  ["profiles","id,display_name,identity_verified"],
]){
 const {error}=await service.from(table).select(cols).limit(1);
 if(error){console.error("FAIL",table,error.message);errors++;}else console.log("PASS",table,"schema");
}
for(const table of ["marketly_profile_details","marketly_deleted_image_cleanup"]){
 const {data,error}=await anon.from(table).select("*").limit(1);
 if(!error && (data?.length||0)>0){console.error("FAIL anonymous reads",table);errors++;}
 else console.log("PASS anonymous privacy",table);
}
for(const [name,args] of [
  ["marketly_update_my_profile",{p_display_name:"Anon",p_full_name:"Test",p_phone:"",p_district:"",p_city:"",p_about:"",p_contact_preference:"",p_email_notifications:true}],
  ["marketly_set_profile_photo",{p_photo_path:null}],
  ["marketly_request_verification",{p_kind:"identity",p_details:""}],
  ["marketly_finalize_deleted_image_cleanup",{p_id:"00000000-0000-4000-8000-000000000000"}],
]){
 const {error}=await anon.rpc(name,args);
 if(!error){console.error("FAIL anonymous RPC",name);errors++;}else console.log("PASS anonymous RPC denied",name);
}
const {data:bucket,error:bucketError}=await service.storage.getBucket("marketly-profile-photos");
if(bucketError||bucket?.public!==false){console.error("FAIL private profile photo bucket");errors++;}
else console.log("PASS private profile photo bucket");
if(errors){console.error(`Phase 07.1: ${errors} schema checks failed`);process.exitCode=1;}
else console.log("PASS Phase 07.1 schema/privacy checks. Still test with real user/admin accounts.");
