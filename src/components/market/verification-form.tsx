"use client";
/* eslint-disable @next/next/no-img-element -- Browser blob URLs from private identity photos cannot use next/image optimization. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, FileCheck2, IdCard, LoaderCircle, ShieldCheck } from "lucide-react";

type Key = "front" | "back" | "selfie";
type CheckResponse = { uploaded: boolean; nicFormat: boolean; profileNameMatches: boolean; faceComparison: string; identityAuthenticity: string };
const photoFields: { key: Key; label: string; help: string }[] = [
 { key: "front", label: "NIC front", help: "Full card visible, details easy to read" },
 { key: "back", label: "NIC back", help: "Include the full back of the card" },
 { key: "selfie", label: "Selfie holding your NIC", help: "Your face and the NIC must both be visible" },
];
export function VerificationForm({ suggestedName = "" }: { suggestedName?: string }) {
 const router = useRouter();
 const [files, setFiles] = useState<Partial<Record<Key, File>>>({});
 const [previews, setPreviews] = useState<Partial<Record<Key, string>>>({});
 const [legalName, setLegalName] = useState(suggestedName);
 const [nic, setNic] = useState("");
 const [comment, setComment] = useState("");
 const [agreed, setAgreed] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [result, setResult] = useState<CheckResponse | null>(null);
 const [submitted, setSubmitted] = useState(false);
 const previewUrls = useRef<Partial<Record<Key, string>>>({});
 useEffect(() => () => {
  for (const value of Object.values(previewUrls.current)) URL.revokeObjectURL(value);
  previewUrls.current = {};
 }, []);
 function selectFile(key: Key, file?: File) {
  const previous = previewUrls.current[key];
  if (previous) URL.revokeObjectURL(previous);
  const nextUrl = file ? URL.createObjectURL(file) : undefined;
  if (nextUrl) previewUrls.current[key] = nextUrl;
  else delete previewUrls.current[key];
  setPreviews(current => ({ ...current, [key]: nextUrl }));
  setFiles(current => ({ ...current, [key]: file }));
  setError("");
 }
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (busy || submitted) return;
  if (!agreed) { setError("Please read and accept the identity document privacy notice."); return; }
  if (!photoFields.every(field => files[field.key])) { setError("Upload all three identity photos."); return; }
  const form = new FormData();
  form.set("legal_name", legalName); form.set("nic_number", nic); form.set("comment", comment);
  for (const field of photoFields) form.set(field.key, files[field.key]!);
  setBusy(true); setError(""); setResult(null);
  try {
    const response = await fetch("/api/verification/submit", { method: "POST", body: form, credentials: "same-origin", cache: "no-store" });
    const payload = await response.json() as { message?: string; precheck?: CheckResponse };
    if (!response.ok) throw new Error(payload.message || "Verification submission failed.");
    setResult(payload.precheck || null); setSubmitted(true); setNic("");
    router.refresh();
  } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
  finally { setBusy(false); }
 }
 return <form onSubmit={submit} className="space-y-6 rounded-2xl border border-[#E4D9C8] bg-white p-5 shadow-sm sm:p-7">
  <div className="flex items-start gap-3"><ShieldCheck className="mt-1 size-6 text-[#AD7B32]"/><div><h2 className="text-xl font-extrabold">Verify your seller identity</h2><p className="mt-1 text-sm text-stone-600">We review your documents privately. This is not a government identity certification.</p></div></div>
  <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-semibold">Full legal name (on NIC)<input required minLength={3} maxLength={120} autoComplete="name" className="field-control mt-2" value={legalName} onChange={e=>setLegalName(e.target.value)} disabled={busy||submitted}/></label>
    <label className="text-sm font-semibold">Sri Lankan NIC number<input required maxLength={16} className="field-control mt-2" value={nic} onChange={e=>setNic(e.target.value)} placeholder="Old or new NIC format" autoComplete="off" disabled={busy||submitted}/><span className="mt-1 block text-xs font-normal text-stone-500">Stored as a masked ending + protected fingerprint, not plaintext.</span></label>
  </div>
  <div className="grid gap-3 sm:grid-cols-3">{photoFields.map(field=><label key={field.key} className="block rounded-xl border border-dashed border-[#CDAF7F] bg-[#FFFCF7] p-3 text-sm">
    <span className="flex items-center gap-2 font-bold"><Camera className="size-4 text-[#A57936]"/>{field.label}</span>
    <span className="mt-2 block min-h-10 text-xs text-stone-600">{field.help}</span>
    {previews[field.key]?<img alt={`Local preview of ${field.label}`} src={previews[field.key]} className="mt-3 h-32 w-full rounded-lg border bg-white object-contain"/>:<div className="mt-3 grid h-32 place-items-center rounded-lg bg-[#F0E9DE] text-stone-500"><IdCard className="size-9"/></div>}
    <input aria-label={`Upload ${field.label}`} type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy||submitted} className="mt-3 w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-[#EFE3CD] file:px-3 file:py-2" onChange={e=>selectFile(field.key,e.target.files?.[0])}/>
    <span className="mt-2 block text-xs text-stone-500">JPEG / PNG / WebP · up to 4 MB</span>
  </label>)}</div>
  <label className="block text-sm font-semibold">Extra message (optional)<textarea maxLength={400} value={comment} onChange={e=>setComment(e.target.value)} disabled={busy||submitted} className="field-control mt-2 min-h-20" placeholder="Notes for the reviewer. Do not enter private numbers here."/></label>
  <label className="flex items-start gap-3 rounded-xl border border-[#E8D8B7] bg-[#FFFBF4] p-4 text-sm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} disabled={busy||submitted} className="mt-1 size-4 accent-[#B88746]"/><span><strong>Identity document privacy notice:</strong> Your NIC number, private front/back photos and selfie are used only for seller identity review and fraud investigation under authorized access. Reviewers can see your documents. They are never shown on public listings. Evidence becomes eligible for deletion 90 days after a final decision. The site operator must run a secure cleanup job; deletion is not automatic until that job is configured. Submitting does not guarantee approval.</span></label>
  {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {busy&&<div role="status" className="flex items-center gap-3 rounded-xl bg-[#F8F0E3] p-4 text-sm font-semibold text-[#66502A]"><LoaderCircle className="size-5 animate-spin"/>Checking details and securely uploading documents... Please do not close this page.</div>}
  {submitted&&<div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-5"/>Submitted for manual review</p>
    <p>Document upload: {result?.uploaded?"Complete":"Saved"} · NIC format: {result?.nicFormat?"Valid format":"Check"} · Profile name: {result?.profileNameMatches?"Matches":"Admin review needed"}</p>
    <p className="font-semibold">Face comparison and NIC authenticity: pending authorized human review.</p></div>}
  <button type="submit" disabled={busy||submitted} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#24272E] px-5 py-3 font-bold text-white transition hover:bg-[#363A43] disabled:opacity-60"><FileCheck2 className="size-5"/>{submitted?"Request submitted":busy?"Submitting safely...":"Submit identity verification"}</button>
 </form>;
}
