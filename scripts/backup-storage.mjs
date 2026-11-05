/** Manual Supabase Storage backup of public listings and private profile photos.
 * Run with --execute after reviewing the destination; dry run by default.
 * Files are saved OUTSIDE the Git repository.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret){console.error("Server-only Supabase credentials required.");process.exit(1);}
const execute=process.argv.includes("--execute");
const now=new Date().toISOString().replaceAll(":","-");
const dest=path.join(os.homedir(),"Downloads","marketly-private-backups",`storage-${now}`);
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
let files=0,bytes=0,failures=0;
async function walk(bucket,prefix="") {
 const storage=db.storage.from(bucket);
 let offset=0;
 while (true) {
  const {data,error}=await storage.list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
  if(error){console.error(`Cannot list bucket ${bucket}: ${error.message}`);failures++;return;}
  for(const object of data||[]){
   const relative=prefix?`${prefix}/${object.name}`:object.name;
   // Prevent path traversal or strange names from ever leaving the backup root.
   if(relative.split("/").some(segment=>!segment || segment===".." || segment===".")){failures++;continue;}
   if(object.id===null || object.metadata===null){await walk(bucket,relative);continue;}
   files++;bytes+=Number(object.metadata?.size||0);
   if(!execute)continue;
   const target=path.join(dest,bucket,...relative.split("/"));
   await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
   const {data:blob,error:downloadError}=await storage.download(relative);
   if(downloadError||!blob){console.error("Could not download",bucket,relative,downloadError?.message);failures++;continue;}
   await fs.writeFile(target,Buffer.from(await blob.arrayBuffer()),{mode:0o600});
  }
  if((data?.length||0)<100)break;
  offset+=100;
 }
}
if(execute){await fs.mkdir(dest,{recursive:true,mode:0o700});console.log("Backup destination:",dest);}
else console.log("DRY RUN — pass --execute to save media outside this repository.");
for(const bucket of ["listing-images","marketly-profile-photos"])await walk(bucket);
console.log(JSON.stringify({mode:execute?"BACKUP":"DRY RUN",files,estimatedBytes:bytes,failures,destination:execute?dest:null},null,2));
if(failures)process.exitCode=1;
