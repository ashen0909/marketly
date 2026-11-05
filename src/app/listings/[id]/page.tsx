import Link from "next/link";
import {notFound} from "next/navigation";
import {BadgeCheck,MapPin,ShieldAlert} from "lucide-react";
import {FavoriteButton} from "@/components/market/favorite-button";
import {StartChatButton} from "@/components/market/start-chat-button";
import {ListingGallery} from "@/components/market/listing-gallery";
import {ReportListing} from "@/components/market/report-listing";
import {RecentlyViewedTracker,ShareListing} from "@/components/market/smart-listing-actions";
import {getListing} from "@/lib/catalog";
import {createServerSupabase,hasSupabaseConfig} from "@/lib/supabase/server";
import {formatLkr} from "@/lib/config";
import {buttonVariants} from "@/components/ui/button";
import {BackToBrowse} from "@/components/market/return-navigation";
import {safeListingReturn} from "@/lib/listing-return";
export const dynamic="force-dynamic";
export default async function ListingDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{from?:string}>}){
  const {id}=await params;
  const from=safeListingReturn((await searchParams).from);const listing=await getListing(id);if(!listing)notFound();
  let userId:string|undefined;let verified=false;
  if(hasSupabaseConfig()){
    const db=await createServerSupabase();const [{data:{user}},{data:profile}]=await Promise.all([
      db.auth.getUser(),listing.seller_id?db.from("profiles").select("identity_verified").eq("id",listing.seller_id).maybeSingle():Promise.resolve({data:null})
    ]);userId=user?.id;verified=!!profile?.identity_verified;
  }
  const isOwner=!!userId&&listing.seller_id===userId;
  const available=listing.status==="active" && listing.moderation_status!=="rejected" && listing.moderation_status!=="pending";
  return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{available&&!isOwner&&<RecentlyViewedTracker listing={listing}/>}<nav aria-label="Return to previous page" className="mb-5 flex flex-wrap items-center gap-3"><BackToBrowse isOwner={isOwner} returnTo={from}/><span className="text-xs text-stone-500">Keep your search and filters when you go back.</span></nav>
    {listing.sample&&<p className="mb-5 rounded-xl bg-amber-50 p-4">Sample listing only.</p>}
    {isOwner&&<div className="mb-5 rounded-xl border border-[#D9B781] bg-amber-50 p-4 text-sm">Your ad · <strong>{listing.status}</strong> · Review: <strong>{listing.moderation_status}</strong>. {listing.moderation_note&&`Admin note: ${listing.moderation_note}`} <Link href={`/sell/${id}/edit`} className="ml-3 font-bold underline">Edit ad</Link></div>}
    <div className="grid gap-8 lg:grid-cols-[1.3fr_.7fr]"><div className="space-y-4"><ListingGallery images={listing.image_urls} title={listing.title}/>
      <article className="rounded-2xl border bg-white p-6"><h2 className="font-bold">Description</h2><p className="mt-3 whitespace-pre-line text-sm text-stone-600">{listing.description}</p></article></div>
    <aside><div className="rounded-2xl border bg-white p-6 shadow-sm"><p className="text-sm text-stone-500">{listing.category} · {listing.condition}</p>
      <h1 className="mt-2 text-2xl font-extrabold">{listing.title}</h1><p className="mt-4 text-3xl font-extrabold text-[#A3722F]">{formatLkr(listing.price_lkr)}</p>
      {listing.is_negotiable&&<p className="mt-1 text-sm font-bold text-emerald-700">Negotiable</p>}
      {!available&&<p className="mt-2 rounded-lg bg-stone-100 p-2 text-sm font-bold">{listing.status==="sold"?"Sold":listing.status==="removed"?"Paused":"Not approved for public browsing"}</p>}
      <p className="mt-4 flex items-center gap-2 text-sm text-stone-500"><MapPin className="size-4"/>{listing.location}</p><hr className="my-5"/>
      <p className="font-semibold">Seller</p><p className="mt-1 text-sm">{listing.seller_id?<Link href={`/sellers/${listing.seller_id}`} className="text-[#986E30] underline">{listing.seller_name}</Link>:listing.seller_name}</p>
      <p className="mt-2 flex items-center gap-1 text-xs"><BadgeCheck className="size-4"/>{verified?"Identity checked by Marketly":"Identity not verified"}</p>
      {available&&!isOwner&&<div className="mt-5 space-y-3"><StartChatButton listingId={listing.id} sellerId={listing.seller_id} sample={listing.sample}/><FavoriteButton listingId={listing.id} disabled={!!listing.sample}/><ReportListing listingId={listing.id}/></div>}
      {available&&<div className="mt-4 flex flex-wrap items-center gap-2"><ShareListing listingId={listing.id}/></div>}
      {isOwner&&<Link href={`/sell/${id}/edit`} className={`${buttonVariants()} mt-5 w-full`}>Edit this ad</Link>}
      <p className="mt-4 text-xs text-stone-500">Marketly is a classifieds platform, not a payment escrow service.</p></div>
      <div className="mt-5 rounded-xl bg-amber-50 p-4 text-xs text-amber-900"><ShieldAlert className="mb-2 size-5"/>Verify the item and seller before paying. Never share OTPs.</div>
      <div className="mt-5 flex flex-col gap-3"><BackToBrowse isOwner={isOwner} returnTo={from}/><Link href="/listings" className={`${buttonVariants({variant:"outline"})} w-full`}>Browse more products</Link></div></aside></div>
  </main>;
}
