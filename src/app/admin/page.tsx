import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, BellRing, ClipboardList, Crown, Flag, ImageOff, ShieldCheck, ShoppingBag, Wallet, MessagesSquare, UsersRound, ArrowRight } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { ListingGallery } from "@/components/market/listing-gallery";
import { formatLkr } from "@/lib/config";
import { adminCan, normalizeAdminAccess } from "@/lib/admin-access";
export const dynamic = "force-dynamic";

type PendingAd = { id:string;title:string;description:string;seller_id:string;price_lkr:number;published_at:string;category:string;location:string;condition:string;is_negotiable:boolean };
type AdPhoto = { listing_id:string;storage_path:string;preview_storage_path:string|null;position:number };
function adImageUrl(path:string) { return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-images/${encodeURI(path)}`; }
function Stat({label,value,icon:Icon}:{label:string;value:number|string;icon:typeof ClipboardList}) {
 return <div className="rounded-2xl border border-[#E8DFD2] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-stone-600">{label}</p><Icon className="size-5 text-[#A3722F]"/></div><p className="mt-2 text-3xl font-extrabold text-[#24272E]">{value}</p></div>;
}
function QuickLink({href,label,detail,icon:Icon}:{href:string;label:string;detail:string;icon:typeof ClipboardList}) {
 return <Link href={href} className="group flex items-start gap-3 rounded-2xl border border-[#E5DACA] bg-white p-4 shadow-sm transition hover:border-[#C8A265] hover:bg-[#FFFCF6]"><span className="rounded-xl bg-[#F8F0E3] p-2 text-[#9B7136]"><Icon className="size-5"/></span><span className="min-w-0 flex-1"><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs text-stone-500">{detail}</span></span><ArrowRight className="size-4 text-stone-400 transition group-hover:translate-x-1"/></Link>;
}
export default async function AdminPage() {
 if(!hasSupabaseConfig()) redirect("/login");
 const db=await createServerSupabase();
 const {data:{user}}=await db.auth.getUser();if(!user) redirect("/login");
 const {data:rawAccess,error:accessError}=await db.rpc("marketly_admin_access");
 const access=normalizeAdminAccess(rawAccess);
 if(accessError || !access.isAdmin) redirect("/dashboard");
 const listings=adminCan(access,"listings"),reportsAllowed=adminCan(access,"reports"),chatAllowed=adminCan(access,"chat_reports");
 const verifyAllowed=adminCan(access,"verification"),billingAllowed=adminCan(access,"billing_view");
 const ads = listings ? await db.from("listings").select("id,title,description,seller_id,price_lkr,published_at,category,location,condition,is_negotiable")
   .eq("moderation_status","pending").eq("status","active").order("published_at",{ascending:false}).limit(100) : {data:[] as PendingAd[],error:null};
 const [reports,requests,logs,approved,simulated,sandbox,chatReports] = await Promise.all([
  reportsAllowed?db.from("listing_reports").select("id,listing_id,reason,details,status,created_at").eq("status","open").order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[] as {id:string;listing_id:string;reason:string;details:string;created_at:string}[],error:null}),
  verifyAllowed?db.from("seller_verification_requests").select("id,seller_id,kind,details,status,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[] as {id:string;seller_id:string;kind:string;details:string;created_at:string}[],error:null}),
  db.from("marketly_admin_log").select("id,action,note,created_at").order("created_at",{ascending:false}).limit(20),
  listings?db.from("listings").select("id",{head:true,count:"exact"}).eq("status","active").eq("moderation_status","approved"):Promise.resolve({count:0,error:null}),
  billingAllowed?db.from("marketly_test_orders").select("id,amount_lkr,created_at").order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[] as {amount_lkr:number}[],error:null}),
  billingAllowed?db.from("marketly_sandbox_payments").select("id,kind,status,amount_lkr,created_at").order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[] as {status:string}[],error:null}),
  chatAllowed?db.from("marketly_chat_reports").select("id",{head:true,count:"exact"}).eq("status","open"):Promise.resolve({count:0,error:null}),
 ]);
 const pending=(ads.data??[]) as PendingAd[];
 const photosResult=pending.length?await db.from("listing_images").select("listing_id,storage_path,preview_storage_path,position").in("listing_id",pending.map(x=>x.id)).order("position"):{data:[] as AdPhoto[],error:null};
 const sellerIds=[...new Set([...pending.map(x=>x.seller_id),...(requests.data??[]).map(x=>x.seller_id)])];
 const sellerResult=sellerIds.length?await db.from("profiles").select("id,display_name").in("id",sellerIds):{data:[] as {id:string;display_name:string}[],error:null};
 const sellerNames=new Map((sellerResult.data??[]).map(x=>[x.id,x.display_name]));
 const photoMap=new Map<string,AdPhoto[]>();for(const p of (photosResult.data??[]) as AdPhoto[]) photoMap.set(p.listing_id,[...(photoMap.get(p.listing_id)??[]),p]);
 const errors=[ads.error,reports.error,requests.error,logs.error,photosResult.error,sellerResult.error,approved.error,simulated.error,sandbox.error,chatReports.error].filter(Boolean);
 const testValue=(simulated.data??[]).reduce((total,order)=>total+Number(order.amount_lkr),0);
 return <main className="mx-auto max-w-7xl space-y-9 px-4 py-8 pb-20 sm:px-6">
  <header className="rounded-3xl bg-[#24272E] px-6 py-8 text-white sm:px-9">
   <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#E4BD76]">{access.role==="owner"?<Crown className="size-4"/>:<ShieldCheck className="size-4"/>}{access.role==="owner"?"Marketly Owner · Super Admin":"Marketly · Sub Admin"}</p>
    <h1 className="mt-3 text-3xl font-black sm:text-4xl">Administration center</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/75">{access.role==="owner"?"Manage your marketplace, assign safe team access and view every moderation queue.":"Your assigned moderation workspace. Only the sections permitted by the owner are available."}</p></div>
    <div className="rounded-xl bg-white/10 p-3"><ShieldCheck className="size-8 text-[#E4BD76]"/></div></div>
   <div className="mt-6 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/25 px-3 py-1.5">{access.role==="owner"?"Owner · Free marketplace benefits":"Permission-based access"}</span><span className="rounded-full border border-white/25 px-3 py-1.5">Actions logged</span><span className="rounded-full border border-[#D0A352]/50 bg-[#D0A352]/10 px-3 py-1.5 text-[#F6D59B]">Payments: SANDBOX only</span></div>
  </header>
  {errors.length>0&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">Some authorized information could not load. Please refresh and try again.</p>}
  <section aria-label="Admin quick navigation"><h2 className="mb-3 text-xl font-extrabold">Quick access</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   {listings&&<QuickLink href="#pending" icon={ClipboardList} label="Pending ads" detail="Open exact listing review pages"/>}
   {reportsAllowed&&<QuickLink href="#reports" icon={Flag} label="Listing reports" detail="Handle scams and reported ads"/>}
   {chatAllowed&&<QuickLink href="/admin/chat-reports" icon={MessagesSquare} label="Chat reports" detail={`${chatReports.count??0} open reports · privacy-safe view`}/>}
   {verifyAllowed&&<QuickLink href="#verification" icon={BadgeCheck} label="Seller verification" detail="Check requests, then record decisions"/>}
   {billingAllowed&&<QuickLink href="#billing" icon={Wallet} label="Billing (test only)" detail="Read-only sandbox event totals"/>}
   {access.role==="owner"&&<QuickLink href="/admin/sub-admins" icon={UsersRound} label="Manage Sub Admins" detail="Invite registered members and set permissions"/>}
   <QuickLink href="#activity" icon={BellRing} label="Activity log" detail="See your actions and available audit history"/>
  </div></section>
  <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Admin overview">
   {listings&&<Stat label="Pending reviews" value={pending.length} icon={ClipboardList}/>}
   {reportsAllowed&&<Stat label="Open listing reports" value={reports.data?.length??0} icon={Flag}/>}
   {verifyAllowed&&<Stat label="Verification requests" value={requests.data?.length??0} icon={BadgeCheck}/>}
   {listings&&<Stat label="Approved active ads" value={approved.count??0} icon={ShoppingBag}/>}
   {chatAllowed&&<Stat label="Open chat reports" value={chatReports.count??0} icon={MessagesSquare}/>}
   {billingAllowed&&<Stat label="Recent sandbox events" value={sandbox.data?.length??0} icon={Wallet}/>}
  </section>
  {billingAllowed&&<section id="billing" className="scroll-mt-24 rounded-2xl border border-[#E8D8B7] bg-[#FFFCF4] p-5"><h2 className="text-lg font-bold">Sandbox billing overview — read only</h2><p className="mt-2 text-sm text-stone-600">{formatLkr(testValue)} in simulated order quotes (last 100). Real revenue from sandbox: Rs. 0. {sandbox.data?.filter(x=>x.status==="simulated_success").length??0} simulated successes and {sandbox.data?.filter(x=>x.status==="simulated_failure").length??0} simulated failures. No actual paid entitlements.</p></section>}
  {listings&&<section id="pending" className="scroll-mt-24"><h2 className="mb-3 text-2xl font-extrabold">Advertisements awaiting review <span className="text-base font-medium text-[#9D7235]">({pending.length})</span></h2><p className="mb-4 text-sm text-stone-500">Inspect the complete description and image gallery. You cannot approve your own ads.</p>
   {!pending.length?<p className="rounded-2xl border border-dashed bg-white p-7 text-stone-500">No pending advertisements.</p>:<div className="grid gap-5 lg:grid-cols-2">{pending.map(ad=>{const imgs=photoMap.get(ad.id)??[];const first=imgs[0];return <article key={ad.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="grid sm:grid-cols-[190px_1fr]"><div className="relative min-h-[190px] bg-[#F7F4F0]">{first?<Image src={adImageUrl(first.preview_storage_path||first.storage_path)} alt={`${ad.title} preview`} fill unoptimized sizes="190px" className="object-cover"/>:<div className="grid h-full place-items-center text-stone-400"><ImageOff className="size-10"/></div>}</div><div className="space-y-2 p-4"><p className="text-xs font-semibold text-[#A3722F]">{ad.category} · {ad.condition} · {ad.location}</p><h3 className="text-lg font-extrabold">{ad.title}</h3><p className="font-black text-[#9A6A2C]">{formatLkr(Number(ad.price_lkr))}</p><p className="text-xs text-stone-600">Seller: {sellerNames.get(ad.seller_id)||"Marketly member"}</p><p className="text-xs text-stone-500">{new Date(ad.published_at).toLocaleString("en-LK")} · {imgs.length} photos</p><p className="line-clamp-2 text-sm">{ad.description}</p></div></div><div className="border-t p-4"><details className="rounded-xl border border-[#E8DFD2] bg-[#FFFCF7] p-4"><summary className="cursor-pointer font-bold text-[#80591E]">View details and gallery</summary><p className="mt-3 whitespace-pre-line text-sm">{ad.description}</p>{imgs.length>0&&<div className="mt-3"><ListingGallery title={ad.title} images={imgs.map(i=>adImageUrl(i.storage_path))}/></div>}<Link href={`/listings/${ad.id}`} className="mt-3 inline-block text-sm font-bold text-[#80591E] underline">Open full ad</Link></details>{ad.seller_id===user.id?<p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">You cannot review your own listing. Another authorized admin must review it.</p>:<Link href={`/admin/ads/${ad.id}`} className="mt-3 inline-flex rounded-lg bg-[#24272E] px-4 py-2 text-sm font-semibold text-white">Open full moderation →</Link>}</div></article>})}</div>}
  </section>}
  {reportsAllowed&&<section id="reports" className="scroll-mt-24"><h2 className="mb-4 flex items-center gap-2 text-2xl font-extrabold"><Flag className="size-6 text-[#A3722F]"/>Open listing reports ({reports.data?.length??0})</h2><div className="grid gap-4 sm:grid-cols-2">{(reports.data??[]).map(r=><article key={r.id} className="rounded-2xl border bg-white p-5"><p className="font-bold capitalize">{r.reason.replaceAll("_"," ")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{r.details||"No extra details"}</p><p className="mt-2 text-xs text-stone-500">{new Date(r.created_at).toLocaleString("en-LK")}</p><Link href={`/admin/reports/${r.id}`} className="mt-2 inline-block rounded-lg bg-[#24272E] px-4 py-2 text-sm font-semibold text-white">Open report review →</Link></article>)}</div>{!reports.data?.length&&<p className="rounded-xl border border-dashed p-5 text-sm text-stone-500">No open reports.</p>}</section>}
  {verifyAllowed&&<section id="verification" className="scroll-mt-24"><h2 className="mb-4 flex items-center gap-2 text-2xl font-extrabold"><BadgeCheck className="size-6 text-[#A3722F]"/>Seller verification ({requests.data?.length??0})</h2><p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Identity must be checked through an authorized process. Profile completion or payment alone is not proof of identity.</p><div className="grid gap-4 sm:grid-cols-2">{(requests.data??[]).map(r=><article key={r.id} className="rounded-2xl border bg-white p-5"><h3 className="font-bold capitalize">{r.kind} verification</h3><p className="mt-2 text-sm">Seller: {sellerNames.get(r.seller_id)||"Marketly member"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{r.details}</p><p className="mt-2 text-xs text-stone-500">{new Date(r.created_at).toLocaleString("en-LK")}</p>{r.seller_id===user.id?<p className="mt-2 text-xs text-amber-900">Your own request needs another reviewer.</p>:<Link href={`/admin/verification/${r.id}`} className="mt-3 inline-flex rounded-lg bg-[#24272E] px-4 py-2 text-sm font-semibold text-white">Review identity evidence →</Link>}</article>)}</div>{!requests.data?.length&&<p className="rounded-xl border border-dashed p-5 text-sm text-stone-500">No pending verification requests.</p>}</section>}
  <section id="activity" className="scroll-mt-24"><h2 className="mb-4 flex items-center gap-2 text-2xl font-extrabold"><BellRing className="size-6 text-[#A3722F]"/>Recent administration activity</h2><p className="mb-3 text-sm text-stone-500">{adminCan(access,"audit_view")?"Authorized audit overview":"Only your own actions"}</p><div className="divide-y overflow-hidden rounded-2xl border bg-white">{(logs.data??[]).map(log=><div key={log.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><span className="font-bold">{log.action.replaceAll("_"," ")}</span><time className="text-stone-500">{new Date(log.created_at).toLocaleString("en-LK")}</time>{log.note&&<p className="w-full text-xs text-stone-600">{log.note}</p>}</div>)}</div>{!logs.data?.length&&<p className="rounded-xl border p-5 text-sm text-stone-500">No admin actions yet.</p>}</section>
 </main>;
}
