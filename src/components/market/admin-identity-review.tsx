"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, ScanSearch, ShieldAlert } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useMarketlyUi } from "@/components/market/marketly-ui-provider";

type Checks = { documents_present?: boolean; nic_format_valid?: boolean; name_matches_profile?: boolean;
  possible_duplicate_identity?: boolean; manual_nic_authenticity_required?: boolean; manual_face_comparison_required?: boolean; document_clarity_manual_review?: boolean; };
type Props = { requestId: string; status: string; isOwner: boolean; isOwn: boolean; escalated: boolean; hasIdentity: boolean };
export function AdminIdentityReview({ requestId, status, isOwner, isOwn, escalated, hasIdentity }: Props) {
 const db = createBrowserSupabase();
 const router = useRouter(); const { confirm, toast } = useMarketlyUi();
 const [checks, setChecks] = useState<Checks | null>(null);
 const [prechecking, setPrechecking] = useState(false);
 const [busy, setBusy] = useState(false);
 const [note, setNote] = useState("");
 const [reviewed, setReviewed] = useState(false);
 const [seen, setSeen] = useState({front:false,back:false,selfie:false});
 const [scanStep, setScanStep] = useState(0);
 const [error, setError] = useState("");
 async function runPrecheck() {
  if (prechecking) return;
  setPrechecking(true);setError("");setChecks(null);setScanStep(1);
  const { data, error: dbError } = await db.rpc("marketly_identity_precheck", { p_request_id: requestId });
  setScanStep(2);
  if (dbError) setError("Could not complete checks. Verify permissions and try again.");
  else setChecks((data || {}) as Checks);
  setScanStep(3);
  setPrechecking(false);
 }
 async function decide(action: "approved" | "rejected" | "changes_requested" | "escalate" | "revoke") {
  if (busy || isOwn) return;
  if (["rejected","changes_requested","escalate","revoke"].includes(action) && note.trim().length<8) {
   setError("Enter a clear reason with at least 8 characters."); return;
  }
  if (action==="approved" && (!checks || !checks.documents_present || !reviewed || !Object.values(seen).every(Boolean))) {
   setError("Run the pre-check, inspect each photo, and confirm your manual review before approval.");return;
  }
  if (!await confirm({ title: action==="approved"?"Approve seller verification?":action==="revoke"?"Revoke seller verification?":"Confirm verification action?",
    description: "Your action is logged. Uploaded evidence is sensitive and must not be shared.", confirmLabel: "Confirm" })) return;
  setBusy(true);setError("");
  let fn = "marketly_review_verification";
  let args: Record<string, string>={ p_request_id: requestId, p_decision: action,
    p_note: action==="approved"?"Manually inspected NIC front, back and selfie; identity evidence reviewed. "+note:note };
  if (action==="escalate") { fn="marketly_escalate_verification"; args={p_request_id:requestId,p_reason:note}; }
  if (action==="revoke") { fn="marketly_owner_revoke_verification"; args={p_request_id:requestId,p_reason:note}; }
  const { error: dbError } = await db.rpc(fn, args);
  if (dbError) setError(dbError.message.includes("PENDING_REQUEST_REQUIRED")?"Another reviewer already handled this request. Refresh to see its status.":"Action could not be completed. Check your permissions and the request status.");
  else {toast("Verification review saved", "success");router.refresh();}
  setBusy(false);
 }
 return <section className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Identity pre-check & decision</h2><p className="mt-1 text-xs text-stone-600">Automated consistency checks are not government NIC or facial verification.</p></div>
  <button type="button" onClick={runPrecheck} disabled={!hasIdentity||prechecking} className="inline-flex items-center gap-2 rounded-xl bg-[#24272E] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{prechecking?<LoaderCircle className="size-4 animate-spin"/>:<ScanSearch className="size-4"/>}{prechecking?"Checking securely...":"Run Smart Pre-Check"}</button></div>
  <div className="rounded-xl border border-[#E9D9BC] bg-[#FFFCF7] p-4"><p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#79551F]">Review progress</p><div className="grid gap-2 sm:grid-cols-3">{[
  ["1. Database evidence",scanStep>=1], ["2. Consistency checks",scanStep>=3 && !!checks], ["3. Manual photo inspection",Object.values(seen).every(Boolean)]
  ].map(([label,done])=><div key={String(label)} className={`rounded-lg border p-3 text-xs font-semibold ${done?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-stone-200 bg-white text-stone-600"}`}>{done?"✓ ":"○ "}{label}</div>)}</div><p className="mt-2 text-xs text-stone-600">A scan result appears as soon as the server responds. No simulated scanning delay. OCR, face detection and document authenticity remain REVIEW until independently assessed.</p></div>
  {prechecking&&<div role="status" className="rounded-xl bg-[#F8F0E3] p-4 text-sm text-[#66502A]"><LoaderCircle className="mr-2 inline size-4 animate-spin"/>Checking stored photos, formatted data and possible duplicate identities...</div>}
  {checks&&<div className="grid gap-2 sm:grid-cols-2">{[
   ["Three uploaded documents",checks.documents_present],
   ["NIC number ending format",checks.nic_format_valid],
   ["Legal name vs saved profile",checks.name_matches_profile],
   ["No duplicate NIC fingerprint alert",!checks.possible_duplicate_identity],
  ].map(([label,pass])=><div key={String(label)} className="flex items-center gap-2 rounded-lg border p-3 text-sm">{pass?<CheckCircle2 className="size-4 shrink-0 text-emerald-700"/>:<AlertTriangle className="size-4 shrink-0 text-amber-700"/>}<span>{label}: <strong>{pass?"PASS":"REVIEW"}</strong></span></div>)}
  {[["NIC number from image (OCR)","REVIEW"],["Face and NIC presence in selfie","REVIEW"],["NIC back readability / authenticity","REVIEW"],["Document tampering","REVIEW"]].map(([name,status])=><div key={name} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><AlertTriangle className="size-4 text-amber-700"/>{name}: <strong>{status}</strong></div>)}
  <p className="col-span-full rounded-lg bg-[#FFF5E7] p-3 text-xs text-[#79551F]">Only metadata and database consistency checks are automated. Face match, ID authenticity, image clarity and tampering are NOT verified by this button. Image contents are NOT identified or compared automatically. Never interpret a format PASS as evidence of a genuine NIC.</p></div>}
  {isOwn&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">You cannot review your own identity request. Another authorized admin must decide.</p>}
  {escalated&&!isOwner&&<p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900"><ShieldAlert className="mr-2 inline size-4"/>Escalated to Owner. Sub Admin decisions are disabled.</p>}
  {status==="pending"&&!isOwn&&(!escalated||isOwner)&&<div className="space-y-3">
   <label className="block text-sm font-bold">Reviewer reason / remarks<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} className="field-control mt-2 min-h-20" placeholder="Explain unclear images, concerns, or evidence checked"/></label>
   <fieldset className="rounded-xl border p-4"><legend className="px-2 text-sm font-bold">Manual photo review checklist</legend>{([ ["front","NIC front: readable number and photo"],["back","NIC back: readable document evidence"],["selfie","Selfie: human face holding a visible NIC"] ] as const).map(([key,label])=><label key={key} className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={seen[key]} onChange={e=>{setSeen(x=>({...x,[key]:e.target.checked}));setReviewed(false);}} className="mt-1 accent-[#B88746]"/>{label}</label>)}</fieldset>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={!Object.values(seen).every(Boolean)} checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1 accent-[#B88746]"/>I manually inspected NIC front/back, selfie with NIC and possible inconsistencies. This is not official document authentication.</label>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy||!reviewed||!Object.values(seen).every(Boolean)||!checks?.documents_present||checks?.possible_duplicate_identity===true} onClick={()=>decide("approved")} className="rounded-lg bg-[#2B6748] px-4 py-2 text-sm font-bold text-white disabled:opacity-45">Approve</button>
    <button type="button" disabled={busy} onClick={()=>decide("changes_requested")} className="rounded-lg border border-[#B88746] px-4 py-2 text-sm font-bold text-[#815920]">Request Changes</button>
    <button type="button" disabled={busy} onClick={()=>decide("rejected")} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700">Reject with Reason</button>
    {!isOwner&&<button type="button" disabled={busy} onClick={()=>decide("escalate")} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold"><ShieldAlert className="size-4"/>Escalate to Owner</button>}
   </div>
  </div>}
  {status==="approved"&&isOwner&&!isOwn&&<div className="space-y-3"><label className="block text-sm font-bold">Reason for revocation<textarea value={note} onChange={e=>setNote(e.target.value)} className="field-control mt-2" maxLength={500}/></label><button disabled={busy} onClick={()=>decide("revoke")} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700">Revoke Verified Status</button></div>}
  {status!=="pending"&&<p className="flex items-center gap-2 rounded-xl bg-stone-50 p-4 text-sm"><Clock3 className="size-4"/>Request status: <strong className="uppercase">{status.replaceAll("_"," ")}</strong></p>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
 </section>;
}
