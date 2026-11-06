/** Explicit, manual, admin-operated sensitive document cleanup.
 * Run with --dry-run or --execute --backup-confirmed --retention-approved.
 * NEVER put service-role credentials in NEXT_PUBLIC_ variables or Git.
 * Deleted Storage objects can be irrecoverable: verify external backups and retention first.
 */
import {createClient} from "@supabase/supabase-js";
const args=new Set(process.argv.slice(2));
const execute=args.has("--execute"),dryRun=args.has("--dry-run");
if(execute===dryRun){console.error("Choose exactly one: --dry-run OR --execute --backup-confirmed --retention-approved");process.exit(2);}
if(execute&&(!args.has("--backup-confirmed")||!args.has("--retention-approved"))){console.error("Execution requires explicit backup and retention acknowledgements.");process.exit(2);}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.MARKETLY_SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key){console.error("Missing Supabase URL or private MARKETLY_SUPABASE_SERVICE_ROLE_KEY.");process.exit(2);}
const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const cutoff=new Date().toISOString();
const {data, error}=await db.from("marketly_identity_submissions")
 .select("request_id,front_path,back_path,selfie_path,purge_after")
 .lte("purge_after",cutoff).is("documents_purged_at",null).limit(100);
if(error){console.error("Could not load retention candidates:",error.message);process.exit(1);}
console.log(`Eligible identity records: ${data?.length??0}. Mode: ${execute?"EXECUTE":"DRY-RUN"}`);
let completed=0,failed=0;
for(const record of data??[]){
 const paths=[record.front_path,record.back_path,record.selfie_path].filter(Boolean);
 if(!execute){console.log(`Would remove 3 or fewer private files for request ${record.request_id}. Eligible since: ${record.purge_after}`);continue;}
 try{
  if(paths.length){const {error:removeError}=await db.storage.from("marketly-identity-private").remove(paths);if(removeError)throw removeError;}
  const {error:updateError}=await db.from("marketly_identity_submissions")
   .update({front_path:null,back_path:null,selfie_path:null,documents_purged_at:new Date().toISOString()})
   .eq("request_id",record.request_id).is("documents_purged_at",null);
  if(updateError)throw updateError;
  completed++;
 }catch(e){failed++;console.error(`Could not finish request ${record.request_id}: ${e?.message??"Unknown error"}`);}
}
console.log(`Completed: ${completed}; failed: ${failed}. Re-run only after checking errors/backups.`);
if(failed)process.exitCode=1;
