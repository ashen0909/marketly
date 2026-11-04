"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, Zap, ImagePlus, Store, PlusSquare } from "lucide-react";
import { marketlyConfig, formatLkr } from "@/lib/config";
import { quoteSandboxOrder, type SandboxKind } from "@/lib/sandbox-pricing";

type MyAd = { id: string; title: string };
export function SandboxCheckout({ availableListings, defaultListingId, enabled }: {
  availableListings: MyAd[]; defaultListingId?: string; enabled: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<SandboxKind>("extra_ad");
  const [listingId, setListingId] = useState(defaultListingId && availableListings.some(a => a.id === defaultListingId)
    ? defaultListingId : (availableListings[0]?.id ?? ""));
  const [planId, setPlanId] = useState<"starter" | "popular" | "premium">("popular");
  const [photoCount, setPhotoCount] = useState(7);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const amount = quoteSandboxOrder({ kind, planId, photoCount });

  async function perform(outcome: "success" | "failure") {
    setError(""); setResult(""); setBusy(true);
    try {
      if (kind === "boost" && !listingId) throw new Error("You need an approved active listing to test a boost.");
      const res = await fetch("/api/billing/sandbox", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ action: "checkout", kind,
          listingId: kind === "boost" ? listingId : null, planId: kind === "boost" ? planId : null,
          photoCount: kind === "photos" ? photoCount : null, requestKey: crypto.randomUUID(), outcome }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sandbox checkout failed");
      setResult(`${data.status === "simulated_success" ? "Simulated SUCCESS" : "Simulated FAILURE"} · ${formatLkr(Number(data.amountLkr))} · Order ${String(data.id).slice(0, 8)}. Real money charged: Rs.0. Real benefits: NONE.`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Sandbox error"); }
    finally { setBusy(false); }
  }
  async function consume() {
    setError(""); setResult(""); setBusy(true);
    try {
      const res = await fetch("/api/billing/sandbox", { method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ action: "consume_credit" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Cannot simulate credit use");
      setResult(data.used ? "One SANDBOX posting credit consumed in test ledger. No real advertisement was posted." : "No active sandbox credits left. No real changes made.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Sandbox error"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-[#E6DCCD] bg-white p-5 shadow-sm sm:p-7">
    <p className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950"><AlertTriangle className="mt-0.5 size-5 shrink-0"/>PHASE 05B SANDBOX — A fake gateway result is simulated on your local dev server. No card details, real charges, real listing slots, actual extra-image uploads, public sponsored ranking or live business access.</p>
    {!enabled&&<p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm">Sandbox disabled. To enable local testing, set MARKETLY_SANDBOX_ENABLED=true in .env.local and restart npm run dev.</p>}
    <div role="group" aria-label="Choose sandbox service" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {([{id:"extra_ad",label:"Extra Ad",icon:PlusSquare},{id:"boost",label:"Boost",icon:Zap},{id:"photos",label:"Photos",icon:ImagePlus},{id:"business",label:"Business",icon:Store}] as const).map(({id,label,icon:Icon}) =>
        <button key={id} type="button" onClick={()=>{setKind(id);setResult("");setError("");}} aria-pressed={kind===id}
          className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${kind===id?"border-[#B88746] bg-[#FAF1E0]":"border-stone-200"}`}><Icon className="size-4"/>{label}</button>)}
    </div>
    {kind==="boost"&&<div className="mt-6 space-y-3"><label htmlFor="sandbox-ad" className="field-label">Approved active advertisement</label><select id="sandbox-ad" className="field-control" value={listingId} onChange={e=>setListingId(e.target.value)}>{availableListings.length?availableListings.map(a=><option key={a.id} value={a.id}>{a.title}</option>):<option value="">No approved ads</option>}</select>
      <div className="grid gap-3 sm:grid-cols-3">{marketlyConfig.boostPlans.map(plan=><button key={plan.id} type="button" onClick={()=>setPlanId(plan.id)} aria-pressed={planId===plan.id} className={`rounded-xl border p-4 text-left ${planId===plan.id?"border-[#B88746] bg-[#FAF1E0]":""}`}><strong className="capitalize">{plan.id}</strong><p className="mt-2 text-xl font-extrabold">{formatLkr(plan.priceLkr)}</p><p className="text-xs text-stone-500">{plan.days} days (sandbox preview)</p></button>)}</div></div>}
    {kind==="photos"&&<div className="mt-6"><label htmlFor="sandbox-photos" className="field-label">Total photos (first five free)</label><input id="sandbox-photos" type="range" className="mt-3 w-full accent-[#B88746]" min="6" max="12" value={photoCount} onChange={e=>setPhotoCount(Number(e.target.value))}/><p className="text-sm">{photoCount} images = {photoCount-5} extra × Rs.100. Quote only; publishing remains restricted to five unpaid photos.</p></div>}
    {kind==="business"&&<p className="mt-6 rounded-xl bg-stone-50 p-4 text-sm">Rs.300 / 30 days = 3 bonus SANDBOX posting credits + storefront/analytics pricing preview. Your three regular monthly free slots remain separate. No verified badge is included.</p>}
    {kind==="extra_ad"&&<p className="mt-6 rounded-xl bg-stone-50 p-4 text-sm">One additional posting credit = Rs.100. Sandbox credit expires 30 days after simulated payment. Real posting quota is unchanged.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5"><div><p className="text-xs font-bold uppercase tracking-widest text-stone-500">Simulated amount</p><p className="text-3xl font-black text-[#916629]">{formatLkr(amount)}</p><p className="text-xs text-stone-500">Real amount charged: Rs.0</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!enabled||busy||(kind==="boost"&&!listingId)} onClick={()=>void perform("success")} className="inline-flex items-center gap-2 rounded-xl bg-[#24272E] px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><CreditCard className="size-4"/>{busy?"Processing...":"Simulate success"}</button><button type="button" disabled={!enabled||busy||(kind==="boost"&&!listingId)} onClick={()=>void perform("failure")} className="rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-40">Simulate failure</button></div></div>
    <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-4"><p className="text-sm font-bold">Test only: consume one sandbox posting credit</p><p className="mt-1 text-xs text-stone-600">Useful to test the 3-credit business quota and extra-ad credit balance. This does NOT publish a real advertisement.</p><button type="button" disabled={!enabled||busy} onClick={()=>void consume()} className="mt-3 rounded-lg border border-[#B88746] px-3 py-2 text-sm font-semibold disabled:opacity-40">Consume sandbox credit</button></div>
    {result&&<p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">{result}</p>}
    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p>}
  </section>;
}
