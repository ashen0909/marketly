"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createBrowserSupabase} from "@/lib/supabase/browser";

type Props={kind:"listing"|"report"|"verification";id:string;};
export function AdminActions({kind,id}:Props){
  const router=useRouter();const [note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function decide(action:string){
    if(["rejected","hide"].includes(action) && !note.trim()){setError("Please add a reason for rejection/hiding.");return;}
    if(kind==="verification" && action==="approved" && !window.confirm("Have you genuinely checked identity using an approved secure process? Never approve based on payment alone."))return;
    setBusy(true);setError("");
    try{const db=createBrowserSupabase();const opts=kind==="listing"?{p_listing_id:id,p_decision:action,p_note:note}:
      kind==="report"?{p_report_id:id,p_action:action,p_note:note}:{p_request_id:id,p_decision:action,p_note:note};
      const fn=kind==="listing"?"marketly_review_listing":kind==="report"?"marketly_review_report":"marketly_review_verification";
      const {error}=await db.rpc(fn,opts);if(error)throw new Error(error.message);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Review failed");}finally{setBusy(false);}}
  const actions=kind==="report"?[['hide','Hide listing'],['dismiss','Dismiss report'],['resolve','Resolve']]:[['approved','Approve'],['rejected','Reject']];
  return <div className="mt-3 space-y-2"><input aria-label="Admin review reason" value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="Review note (optional)" className="field-control"/>
    <div className="flex flex-wrap gap-2">{actions.map(([action,label])=><button type="button" key={action} disabled={busy} onClick={()=>decide(action)} className="rounded-lg border border-[#B88746] px-3 py-1.5 text-xs font-semibold hover:bg-amber-50">{label}</button>)}</div>
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
