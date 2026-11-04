import { sriLankaBillingMonth } from "@/lib/billing-month";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus,Settings,Store,ShieldCheck,Zap } from "lucide-react";
import { createServerSupabase,hasSupabaseConfig } from "@/lib/supabase/server";
import { getMyListings } from "@/lib/catalog";
import { ListingCard } from "@/components/market/listing-card";
import { SignOutButton,SellerListingActions } from "@/components/market/dashboard-actions";
import { buttonVariants } from "@/components/ui/button";
import { marketlyConfig } from "@/lib/config";
export const dynamic="force-dynamic";
export default async function DashboardPage(){
  if(!hasSupabaseConfig())return <div className="mx-auto max-w-3xl px-6 py-16"><Store/> Connect Supabase first.</div>;
  const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  const [listings,{count:used}]=await Promise.all([getMyListings(user.id),
    db.from("listing_post_ledger").select("id",{count:"exact",head:true}).eq("seller_id",user.id).eq("billing_month",sriLankaBillingMonth())]);
  const remaining=Math.max(0,marketlyConfig.freeAdsPerCalendarMonth-(used??0));
  const visibleListings=listings.filter(x=>x.status!=="deleted");
  const deletedCount=listings.length-visibleListings.length;
  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold text-[#A3722F]">Seller workspace</p><h1 className="mt-2 text-3xl font-extrabold">Manage your advertisements</h1><p className="mt-2 text-stone-500">Your own ads are managed here, not mixed into public browsing.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/profile" className="rounded-xl border px-3 py-2 text-sm"><Settings className="mr-1 inline size-4"/> Profile</Link><Link href="/verification" className="rounded-xl border px-3 py-2 text-sm"><ShieldCheck className="mr-1 inline size-4"/> Verification</Link><Link href="/billing" className="rounded-xl border border-[#B88746] bg-[#FFFBF3] px-3 py-2 text-sm font-semibold"><Zap className="mr-1 inline size-4"/>Test boosts</Link><SignOutButton/><Link href="/sell/new" className={buttonVariants()}><Plus className="size-4"/>Post Ad</Link></div></div>
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">Free ads remaining</p><p className="mt-1 text-3xl font-bold">{remaining}</p></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">My advertisements</p><p className="mt-1 text-3xl font-bold">{visibleListings.length}</p></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">Awaiting review</p><p className="mt-1 text-3xl font-bold">{visibleListings.filter(x=>x.moderation_status==="pending" && x.status==="active").length}</p></div>
    </div>
    <h2 className="mt-10 text-xl font-bold">Your inventory</h2>
    {visibleListings.length?<div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {visibleListings.map(l=><div key={l.id} className="rounded-2xl border bg-white p-2"><ListingCard listing={l} showFavorite={false}/>
        <div className="space-y-3 p-3"><div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-stone-100 px-3 py-1">{l.status==="active"?"Available":l.status==="sold"?"Sold":"Paused"}</span>
          <span className={`rounded-full px-3 py-1 ${l.moderation_status==="approved"?"bg-emerald-100 text-emerald-800":l.moderation_status==="rejected"?"bg-red-100 text-red-800":"bg-amber-100 text-amber-900"}`}>{l.moderation_status||"Pending"}</span>
        </div>{l.moderation_note&&<p className="text-xs text-red-700">Admin note: {l.moderation_note}</p>}
        <SellerListingActions listingId={l.id} status={l.status} moderationStatus={l.moderation_status}/></div></div>)}</div>
      :<p className="mt-5 rounded-2xl border border-dashed p-10">No ads yet. <Link href="/sell/new" className="font-semibold underline">Create your first ad</Link>.</p>}
  <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-4 text-sm text-stone-600"><strong>{deletedCount}</strong> deleted/archived ad(s). Hidden from public browse; their chat, report and quota records remain for safety. Deleting does not refund a free posting slot.</div>
  </main>;
}
