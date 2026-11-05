"use client";
import {useState} from "react";
import { userFacingError } from "@/lib/user-facing-error";
import {createBrowserSupabase} from "@/lib/supabase/browser";
export function ReportListing({listingId}:{listingId:string}){
  const [open,setOpen]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false),[busy,setBusy]=useState(false);
  async function submit(data:FormData){setError("");setBusy(true);
    try{const db=createBrowserSupabase();const {error}=await db.rpc("marketly_report_listing",{p_listing_id:listingId,p_reason:String(data.get("reason")),p_details:String(data.get("details")||"")});
      if(error)throw new Error(error.message);setDone(true);setOpen(false);
    }catch(e){setError(userFacingError(e, "general"));}finally{setBusy(false);}}
  return <section className="mt-4">{done?<p role="status" className="text-sm text-emerald-700">Report submitted for admin review.</p>:<>
    <button onClick={()=>setOpen(v=>!v)} className="text-xs font-semibold text-red-700 underline" type="button">Report this advertisement</button>
    {open&&<form action={submit} className="mt-3 space-y-3 rounded-xl border p-4">
      <label className="block text-xs font-semibold">Reason<select name="reason" required className="field-control mt-2">
        {[['scam','Suspicious / scam'],['counterfeit','Counterfeit'],['prohibited','Prohibited item'],['wrong_information','Wrong information'],['other','Other']].map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></label><label className="block text-xs font-semibold">Details (optional)<textarea name="details" maxLength={1000} className="field-control mt-2 min-h-20"/></label>
      <button disabled={busy} className="rounded-lg bg-[#24272E] px-4 py-2 text-xs font-bold text-white">{busy?'Submitting...':'Send report'}</button>
      {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    </form>}
  </>}</section>;
}
