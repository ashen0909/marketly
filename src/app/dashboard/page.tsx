import { sriLankaBillingMonth } from "@/lib/billing-month";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Plus, Settings, Store, Zap } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { getMyListingsPage } from "@/lib/catalog";
import { PaginationControls } from "@/components/market/pagination-controls";
import { readPage, totalPages, pageRange } from "@/lib/pagination";
import { ListingCard } from "@/components/market/listing-card";
import { SellerListingActions } from "@/components/market/dashboard-actions";
import { DraftActions } from "@/components/market/draft-actions";
import { OwnerBoost } from "@/components/market/owner-boost";
import { buttonVariants } from "@/components/ui/button";
import { marketlyConfig } from "@/lib/config";
import { publicListingImageUrl, type SavedDraft } from "@/lib/listing-drafts";
export const dynamic="force-dynamic";
const tabs=[
 {id:"all",label:"All ads"},{id:"approved",label:"Approved"},{id:"pending",label:"Pending"},
 {id:"rejected",label:"Rejected"},{id:"paused",label:"Paused"},{id:"sold",label:"Sold"},
 {id:"drafts",label:"Drafts"},{id:"deleted",label:"Deleted"},
];
export default async function DashboardPage({searchParams}:{searchParams:Promise<{page?:string;status?:string;q?:string}>}){
 const params=await searchParams;
 const status=tabs.some(t=>t.id===params.status)?params.status! : "all";
 const search=(params.q??"").slice(0,80).trim();const page=readPage(params.page);
 if(!hasSupabaseConfig())return <div className="mx-auto max-w-3xl px-6 py-16"><Store/> Connect Supabase first.</div>;
 const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const [ads,{count:used},{count:pendingCount},{count:draftCount},ownerAccess]=await Promise.all([
   status==="drafts"?Promise.resolve({listings:[],total:0}):getMyListingsPage(user.id,page,status,search),
   db.from("listing_post_ledger").select("id",{count:"exact",head:true}).eq("seller_id",user.id).eq("billing_month",sriLankaBillingMonth()),
   db.from("listings").select("id",{count:"exact",head:true}).eq("seller_id",user.id).eq("status","active").eq("moderation_status","pending"),
   db.from("marketly_listing_drafts").select("id",{count:"exact",head:true}).eq("seller_id",user.id),
   db.rpc("marketly_admin_access"),
 ]);
 let drafts:SavedDraft[]=[];let draftTotal=0;
 if(status==="drafts"){
  const {from,to}=pageRange(page);
  let query=db.from("marketly_listing_drafts").select("id,title,description,price_lkr,category,location,condition,is_negotiable,image_paths,preview_paths,updated_at",{count:"exact"}).eq("seller_id",user.id);
  if(search)query=query.ilike("title",`%${search.replaceAll("%","").replaceAll("_","")}%`);
  const response=await query.order("updated_at",{ascending:false}).range(from,to);
  drafts=(response.data??[]) as SavedDraft[];draftTotal=response.count??0;
 }
 const ownerBenefits=ownerAccess.data?.ownerBenefits === true;
 const remaining=ownerBenefits?Number.MAX_SAFE_INTEGER:Math.max(0,marketlyConfig.freeAdsPerCalendarMonth-(used??0));
 const count=status==="drafts"?draftTotal:ads.total;
 const linkFor=(target:string)=>`/dashboard?${new URLSearchParams({status:target,...(search?{q:search}:{})}).toString()}`;
 const dashboardReturn=`/dashboard?${new URLSearchParams({status,...(search?{q:search}:{}),page:String(page)}).toString()}`;
 return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold text-[#A3722F]">Seller workspace</p><h1 className="mt-2 text-3xl font-extrabold">Manage your advertisements</h1><p className="mt-2 text-stone-500">Filter listings, fix rejected ads and resume unfinished drafts.</p></div>
   <div className="flex flex-wrap gap-2"><Link href="/profile" className="rounded-xl border px-3 py-2 text-sm"><Settings className="mr-1 inline size-4"/> Profile</Link><Link href="/billing" className="inline-flex min-h-11 items-center rounded-xl border border-[#B9DDC8] bg-[#EAF8EF] px-3 py-2 text-sm font-semibold text-[#206442] hover:bg-[#DEF3E5]"><Zap className="mr-1 inline size-4"/> Sandbox billing</Link><Link href="/sell/new" className={buttonVariants()}><Plus className="size-4"/> New ad</Link></div></div>
  {ownerBenefits&&<div className="mt-6 rounded-xl border border-[#DFC99B] bg-[#FFFAF0] p-4 text-sm font-semibold text-[#795622]">Owner benefits: unlimited ad submissions, up to 12 photos per ad, free owner boosts and automatic free business-level access when those features launch. All ads still need independent review.</div>}
  <div className="mt-8 grid gap-3 sm:grid-cols-3">
    <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">{ownerBenefits?"Owner free ads":"Free ads remaining"}</p><p className="mt-1 text-3xl font-bold">{ownerBenefits?"Unlimited":remaining}</p></div>
    <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">Saved drafts</p><p className="mt-1 text-3xl font-bold">{draftCount??0}</p></div>
    <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">Awaiting review</p><p className="mt-1 text-3xl font-bold">{pendingCount??0}</p></div>
  </div>
  <nav aria-label="Seller inventory status" className="mt-8 flex flex-wrap gap-2">{tabs.map(tab=><Link key={tab.id} href={linkFor(tab.id)} aria-current={status===tab.id?"page":undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${status===tab.id?"border-[#B88746] bg-[#24272E] text-white":"bg-white hover:bg-amber-50"}`}>{tab.label}</Link>)}</nav>
  <form action="/dashboard" method="get" className="mt-4 flex gap-2"><input name="status" type="hidden" value={status}/><input type="search" name="q" defaultValue={search} aria-label="Search my advertisements" placeholder="Search your ad titles..." className="h-11 w-full max-w-lg rounded-xl border border-stone-300 px-4 text-sm"/><button className="rounded-xl bg-[#24272E] px-5 text-sm font-semibold text-white" type="submit">Search</button></form>
  <h2 className="mt-7 text-xl font-bold">{tabs.find(t=>t.id===status)?.label} <span className="text-sm font-normal text-stone-500">({count})</span></h2>
  {status==="drafts"?(
   drafts.length?<div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{drafts.map(draft=><article key={draft.id} className="overflow-hidden rounded-2xl border bg-white">
     {draft.preview_paths.length>0&&<div className="relative aspect-[1.5]"><Image src={publicListingImageUrl(draft.preview_paths[0])} alt="Saved draft cover" fill unoptimized className="object-cover"/></div>}
     <div className="space-y-3 p-4"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">DRAFT · not public</span><h3 className="font-bold">{draft.title||"Untitled draft"}</h3><p className="text-xs text-stone-500">Last saved {new Date(draft.updated_at).toLocaleString("en-LK")}</p>
      <DraftActions id={draft.id}/></div></article>)}</div>
   :<p className="mt-5 rounded-2xl border border-dashed p-10">No drafts found. <Link href="/sell/new" className="font-semibold underline">Start an ad</Link> and click Save as draft.</p>
  ):(
   ads.listings.length?<div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{ads.listings.map(l=><div key={l.id} className="rounded-2xl border bg-white p-2"><ListingCard listing={l} showFavorite={false} returnTo={dashboardReturn}/>
    <div className="space-y-3 p-3"><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-stone-100 px-3 py-1">{l.status==="active"?"Available":l.status==="sold"?"Sold":l.status==="deleted"?"Deleted":"Paused"}</span><span className={`rounded-full px-3 py-1 ${l.moderation_status==="approved"?"bg-emerald-100 text-emerald-800":l.moderation_status==="rejected"?"bg-red-100 text-red-800":"bg-amber-100 text-amber-900"}`}>{l.moderation_status||"Pending"}</span></div>
    {l.moderation_status==="rejected"&&<div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-sm font-bold text-red-800">Changes requested by admin</p><p className="mt-1 text-xs text-red-800">{l.moderation_note||"Check your listing details and submit corrections."}</p><p className="mt-2 text-xs text-red-800">Correcting this same ad does not use another posting credit.</p></div>}
    {l.moderation_status!=="rejected"&&l.moderation_note&&<p className="text-xs text-red-700">Admin note: {l.moderation_note}</p>}
    <SellerListingActions listingId={l.id} status={l.status} moderationStatus={l.moderation_status}/>
    {ownerBenefits&&l.status==="active"&&l.moderation_status==="approved"&&<OwnerBoost listingId={l.id}/>}</div></div>)}</div>
   :<p className="mt-5 rounded-2xl border border-dashed p-10">No advertisements found for this filter.</p>
  )}
  <PaginationControls path="/dashboard" page={page} pages={totalPages(count)} query={{status,q:search}}/>
 </main>;
}
