"use client";
import {useState} from "react";
import { userFacingError } from "@/lib/user-facing-error";
import {createBrowserSupabase} from "@/lib/supabase/browser";
export function VerificationForm(){const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
  async function submit(data:FormData){setBusy(true);setStatus("");try{const db=createBrowserSupabase();const {error}=await db.rpc("marketly_request_verification",{p_kind:String(data.get("kind")),p_details:String(data.get("details")||"")});if(error)throw new Error(error.message);setStatus("Your request is pending review. No badge is granted until checked.");}catch(e){setStatus(userFacingError(e, "verification"));}finally{setBusy(false);}}
  return <form action={submit} className="space-y-4 rounded-2xl border bg-white p-6"><label className="field-label block">Verification type<select name="kind" className="field-control mt-2"><option value="identity">Individual identity</option><option value="business">Registered business</option></select></label>
    <label className="field-label block">Message (optional, no sensitive numbers)<textarea name="details" maxLength={400} className="field-control mt-2 min-h-20" placeholder="Tell our team how to contact you for verification"/></label>
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Do not enter NIC/passport numbers or upload identity documents here. We will need a secure verification process before issuing identity badges.</p>
    <button disabled={busy} className="rounded-lg bg-[#24272E] px-5 py-3 font-semibold text-white">{busy?"Sending...":"Request verification"}</button>{status&&<p role="status" className="text-sm">{status}</p>}
  </form>;
}
