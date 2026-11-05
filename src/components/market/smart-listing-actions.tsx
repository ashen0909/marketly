"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Share2, Clock3 } from "lucide-react";
import type { Listing } from "@/data/catalog";
import { formatLkr } from "@/lib/config";

export type SavedListing = {
  id: string; title: string; price_lkr: number; condition: string;
  category: string; location: string; image_url?: string; saved_at: number;
};
const RECENT = "marketly:recent:v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function read(key: string): SavedListing[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((v): v is SavedListing => !!v && typeof v === "object" && UUID.test(v.id)
      && typeof v.title === "string" && typeof v.price_lkr === "number"
      && typeof v.category === "string" && typeof v.location === "string"
      && typeof v.condition === "string");
  } catch { return []; }
}
function save(key: string, records: SavedListing[]) {
  try { localStorage.setItem(key, JSON.stringify(records)); window.dispatchEvent(new Event("marketly:saved-listings")); }
  catch { /* Private browser storage can be unavailable; viewing remains functional. */ }
}
export function toSavedListing(listing: Listing): SavedListing {
  return { id: listing.id, title: listing.title, price_lkr: listing.price_lkr,
    category: listing.category, location: listing.location, condition: listing.condition,
    image_url: listing.preview_urls?.[0] || listing.image_urls[0], saved_at: Date.now() };
}
export function RecentlyViewedTracker({ listing }: { listing: Listing }) {
  useEffect(() => {
    if (!UUID.test(listing.id)) return;
    const item = toSavedListing(listing);
    save(RECENT, [item, ...read(RECENT).filter(x=>x.id!==listing.id)].slice(0, 16));
  }, [listing]);
  return null;
}
export function RecentlyViewedSection() {
  const [items,setItems] = useState<SavedListing[]>([]);
  useEffect(() => { const update = () => setItems(read(RECENT)); update();
    window.addEventListener("storage",update);window.addEventListener("marketly:saved-listings",update);
    return ()=>{window.removeEventListener("storage",update);window.removeEventListener("marketly:saved-listings",update);};
  },[]);
  if (!items.length) return null;
  return <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
    <h2 className="mb-4 flex items-center gap-2 text-xl font-extrabold"><Clock3 className="size-5 text-[#B88746]"/>Recently viewed</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items.slice(0, 4).map(item=><Link key={item.id} href={`/listings/${item.id}`} className="rounded-xl border bg-white p-4 hover:border-[#CFA764]"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#A3722F]">{formatLkr(item.price_lkr)}</p></Link>)}</div>
    <p className="mt-2 text-xs text-stone-500">Saved only on this device. Prices or availability may have changed.</p>
  </section>;
}
export function ShareListing({ listingId }: { listingId: string }) {
  const [message,setMessage]=useState("");
  async function share() {
    const url=`${window.location.origin}/listings/${listingId}`;
    try {
      if (navigator.share) await navigator.share({ title: "Marketly listing", url });
      else {await navigator.clipboard.writeText(url);setMessage("Link copied");}
    } catch(e) {if(e instanceof Error && e.name!=="AbortError") setMessage("Could not share this link");}
  }
  return <div className="flex items-center gap-2"><button type="button" onClick={()=>{void share();}} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-amber-50"><Share2 className="size-4"/>Share ad</button>{message&&<span role="status" className="text-xs text-stone-600">{message}</span>}</div>;
}
