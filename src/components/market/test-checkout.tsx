"use client";

import { useState } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, CreditCard, ImagePlus, Zap } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatLkr, marketlyConfig } from "@/lib/config";
import { quoteListingImages } from "@/lib/pricing";

type MyAd = { id: string; title: string };
type Props = { availableListings: MyAd[]; defaultListingId?: string };
type Mode = "boost" | "photos" | "business";

export function TestCheckout({ availableListings, defaultListingId }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("boost");
  const [listingId, setListingId] = useState(defaultListingId && availableListings.some(x => x.id === defaultListingId) ? defaultListingId : availableListings[0]?.id ?? "");
  const [plan, setPlan] = useState<(typeof marketlyConfig.boostPlans)[number]["id"]>("popular");
  const [photos, setPhotos] = useState(7);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const imageQuote = quoteListingImages(photos);
  const amount = mode === "boost" ? marketlyConfig.boostPlans.find(x => x.id === plan)!.priceLkr : mode === "photos" ? imageQuote.extraImageTotalLkr : 300;

  async function simulate() {
    setBusy(true);setError("");setResult("");
    try {
      if (mode === "boost" && !listingId) throw new Error("You need an active, admin-approved ad before testing a boost.");
      const db = createBrowserSupabase();
      const { data, error: dbError } = await db.rpc("marketly_create_test_order", {
        p_kind: mode,
        p_listing_id: mode === "boost" ? listingId : null,
        p_plan_id: mode === "boost" ? plan : null,
        p_photo_count: mode === "photos" ? photos : null,
        p_request_key: crypto.randomUUID(),
      });
      if (dbError) throw new Error(dbError.message);
      setResult(`Test order ${String(data).slice(0, 8)} created for ${formatLkr(amount)}. No money charged and NO paid benefit activated.`);
      router.refresh();
    } catch (e) {setError(userFacingError(e, "billing"));}
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-[#E6DCCD] bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"><AlertTriangle className="size-5 shrink-0"/>TEST MODE ONLY — no card details, real payment, boost activation, paid image upload or extra ad quota.</div>
    <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Choose test purchase type">
      {([{id:"boost",label:"Boost an ad",icon:Zap},{id:"photos",label:"Extra photos",icon:ImagePlus},{id:"business",label:"Business plan",icon:BadgeCheck}] as const).map(({id,label,icon:Icon}) =>
        <button type="button" key={id} aria-pressed={mode === id} onClick={()=>{setMode(id);setResult("");setError("");}} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition ${mode===id?"border-[#B88746] bg-[#FBF2E0] text-[#654417]":"border-stone-200 hover:border-[#B88746]"}`}><Icon className="size-4"/>{label}</button>)}
    </div>
    {mode === "boost" && <div className="mt-6 space-y-5"><div><label htmlFor="test-boost-listing" className="field-label">Your approved active ad</label><select id="test-boost-listing" className="field-control mt-2" value={listingId} onChange={e=>setListingId(e.target.value)} disabled={!availableListings.length}>{availableListings.length ? availableListings.map(a=><option key={a.id} value={a.id}>{a.title}</option>):<option value="">No approved active ads</option>}</select></div>
      <div className="grid gap-3 sm:grid-cols-3">{marketlyConfig.boostPlans.map(p=><button type="button" key={p.id} onClick={()=>setPlan(p.id)} aria-pressed={plan===p.id} className={`rounded-2xl border p-4 text-left ${plan===p.id?"border-[#B88746] bg-[#FFFBF3]":"border-stone-200"}`}><span className="block text-sm font-bold capitalize">{p.id}</span><span className="mt-2 block text-2xl font-black">{formatLkr(p.priceLkr)}</span><span className="block text-xs text-stone-600">{p.days} days — preview only</span></button>)}</div></div>}
    {mode === "photos" && <div className="mt-6 space-y-3"><label htmlFor="test-photo-count" className="field-label">Preview photo pricing (6–{marketlyConfig.maxImagesPerListing} images)</label><input className="w-full accent-[#B88746]" type="range" id="test-photo-count" min={6} max={marketlyConfig.maxImagesPerListing} step={1} value={photos} onChange={e=>setPhotos(Number(e.target.value))}/><p className="text-sm">{photos} images = 5 free + {imageQuote.extraImageCount} × {formatLkr(100)}. This creates a test quote only, not an upload permission.</p></div>}
    {mode === "business" && <div className="mt-6 rounded-xl bg-[#F8F5EE] p-4 text-sm"><p className="font-bold">Marketly Business — {formatLkr(300)} / month</p><p className="mt-2 text-stone-600">Preview 10 ads per month, storefront and analytics. No subscription or quota change occurs in test mode.</p></div>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5"><div><p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Simulated total</p><p className="text-3xl font-black text-[#916629]">{formatLkr(amount)}</p><p className="text-xs text-stone-500">Actual amount charged: Rs. 0</p></div><button type="button" disabled={busy || (mode === "boost" && !listingId)} onClick={()=>{void simulate();}} className="inline-flex items-center gap-2 rounded-xl bg-[#24272E] px-5 py-3 text-sm font-bold text-white hover:bg-[#383C45] disabled:cursor-not-allowed disabled:opacity-40"><CreditCard className="size-4"/>{busy ? "Creating test order..." : "Create TEST order"}</button></div>
    {result && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{result}</p>}
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</p>}
  </section>;
}
