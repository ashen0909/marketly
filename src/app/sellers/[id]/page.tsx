import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, ShieldQuestion, Store } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { getSellerActiveListings } from "@/lib/catalog";
import { ListingCard } from "@/components/market/listing-card";

export const metadata: Metadata = { title: "Seller profile" };
export const dynamic = "force-dynamic";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id) || !hasSupabaseConfig()) notFound();
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase.from("profiles")
    .select("display_name,identity_verified,created_at").eq("id", id).maybeSingle();
  if (!profile) notFound();
  const listings = await getSellerActiveListings(id);
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <div className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-[#FBFAF8] p-6">
      <span className="grid size-16 shrink-0 place-items-center rounded-full bg-[#EAD6B4] text-2xl font-bold text-[#75501B]"><Store className="size-8"/></span>
      <div><h1 className="text-2xl font-extrabold">{profile.display_name}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-stone-600">{profile.identity_verified ? <><BadgeCheck className="size-4 text-emerald-700"/> Identity verified</> : <><ShieldQuestion className="size-4"/> Identity not verified</>}</p>
        <p className="mt-1 text-xs text-stone-500">Member since {new Date(profile.created_at).toLocaleDateString("en-LK", { year: "numeric", month: "long" })} · Verification does not guarantee product quality</p>
      </div>
    </div>
    <h2 className="mt-9 text-xl font-bold">Active advertisements ({listings.length})</h2>
    {listings.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{listings.map(item => <ListingCard key={item.id} listing={item}/>)}</div> : <p className="mt-5 rounded-2xl border border-dashed p-8 text-stone-500">No active listings at the moment.</p>}
  </div>;
}
