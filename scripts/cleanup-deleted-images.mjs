/**
 * Manual cleanup tool. Dry run by default; requires --execute and --backed-up.
 * Requires server-only SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.
 * Photos of SOLD/PAUSED/ACTIVE ads are never selected.
 * Supabase Storage deletion is followed by idempotent DB metadata cleanup.
 */
import { createClient } from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {console.error("Missing server-only Supabase credentials.");process.exit(1);}
const args=process.argv.slice(2);const execute=args.includes("--execute");
if (execute && !args.includes("--backed-up")) {
 console.error("Refusing deletion: make a database AND storage backup first, then pass --execute --backed-up.");process.exit(1);
}
const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const today=new Date();const cutoff=new Date(today.getTime()-30*24*3600*1000).toISOString();
let cursor=0,ready=0,deleted=0,failed=0;
if (!execute) console.log("DRY RUN — no photos will be deleted. Cutoff:",cutoff);
const jobsToProcess=[];
// Snapshot the eligible queue BEFORE any modifications, so deletes cannot shift paging.
while(true) {
 const {data:jobs,error}=await supabase.from("marketly_deleted_image_cleanup")
   .select("id,listing_id,storage_path,preview_storage_path,deleted_at,cleaned_at")
   .is("cleaned_at",null).lte("deleted_at",cutoff).order("deleted_at",{ascending:true}).order("id",{ascending:true}).range(cursor,cursor+99);
 if(error){console.error("Queue query failed:",error.message);process.exit(1);}
 if(!jobs?.length)break;
 jobsToProcess.push(...jobs);
 if(jobs.length<100)break;
 cursor+=100;
}
for(const job of jobsToProcess){
 const {data:listing,error:listingErr}=await supabase.from("listings")
   .select("status,deleted_at").eq("id",job.listing_id).maybeSingle();
 if(listingErr || listing?.status!=="deleted" || !listing.deleted_at || listing.deleted_at>cutoff){
   console.warn("SKIP: listing not eligible",job.listing_id);failed++;continue;
 }
 ready++;
 if(!execute)continue;
 const paths=[job.storage_path,job.preview_storage_path].filter(Boolean);
 const {error:removeErr}=await supabase.storage.from("listing-images").remove(paths);
 if(removeErr){console.error("Storage removal failed for job",job.id,removeErr.message);failed++;continue;}
 const {error:finishErr}=await supabase.rpc("marketly_finalize_deleted_image_cleanup",{p_id:job.id});
 if(finishErr){console.error("Metadata finalization failed for job",job.id,finishErr.message);failed++;continue;}
 deleted++;
}
console.log(JSON.stringify({mode:execute?"EXECUTE":"DRY RUN",eligibleJobs:ready,completed:deleted,skippedOrFailed:failed},null,2));
if(failed)process.exitCode=1;
