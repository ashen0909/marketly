import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, BellRing, ClipboardList, Flag, ImageOff, ShieldCheck, ShoppingBag, Wallet } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { AdminActions } from "@/components/market/admin-actions";
import { ListingGallery } from "@/components/market/listing-gallery";
import { formatLkr } from "@/lib/config";
export const dynamic = "force-dynamic";

type PendingAd = { id:string; title:string; description:string; seller_id:string; price_lkr:number; published_at:string; moderation_status:string; status:string; category:string; location:string; condition:string; is_negotiable:boolean; };
type AdPhoto = { listing_id:string; storage_path:string; preview_storage_path:string|null; position:number };
function adImageUrl(path:string) { return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-images/${encodeURI(path)}`; }
function Stat({ label, value, icon:Icon }: {label:string;value:string|number;icon:typeof ClipboardList}) {
  return <div className="rounded-2xl border border-[#E8DFD2] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-stone-600">{label}</p><Icon className="size-5 text-[#A3722F]"/></div><p className="mt-2 text-3xl font-extrabold text-[#24272E]">{value}</p></div>;
}

export default async function AdminPage() {
  if (!hasSupabaseConfig()) redirect("/login");
  const db=await createServerSupabase();
  const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  const {data:isAdmin,error:authError}=await db.rpc("marketly_is_admin");
  if(authError||!isAdmin)redirect("/dashboard");

  const [ads, reports, requests, logs, approved, simulated, sandbox] = await Promise.all([
    db.from("listings").select("id,title,description,seller_id,price_lkr,published_at,moderation_status,status,category,location,condition,is_negotiable").eq("moderation_status","pending").eq("status","active").order("published_at",{ascending:false}).limit(100),
    db.from("listing_reports").select("id,listing_id,reason,details,status,created_at").eq("status","open").order("created_at",{ascending:false}).limit(100),
    db.from("seller_verification_requests").select("id,seller_id,kind,details,status,created_at").eq("status","pending").order("created_at",{ascending:false}).limit(100),
    db.from("marketly_admin_log").select("id,action,note,created_at").order("created_at",{ascending:false}).limit(20),
    db.from("listings").select("id",{head:true,count:"exact"}).eq("status","active").eq("moderation_status","approved"),
    db.from("marketly_test_orders").select("id,amount_lkr,created_at").order("created_at",{ascending:false}).limit(100),
    db.from("marketly_sandbox_payments").select("id,kind,status,amount_lkr,created_at").order("created_at",{ascending:false}).limit(100),
  ]);
  const pending=(ads.data??[]) as PendingAd[];
  const photosResult=pending.length ? await db.from("listing_images").select("listing_id,storage_path,preview_storage_path,position").in("listing_id",pending.map(x=>x.id)).order("position") : {data:[] as AdPhoto[],error:null};
  const sellerIds=[...new Set([...pending.map(x=>x.seller_id),...(requests.data??[]).map(x=>x.seller_id)])];
  const sellerResult=sellerIds.length ? await db.from("profiles").select("id,display_name").in("id",sellerIds) : {data:[] as {id:string;display_name:string}[],error:null};
  const sellerNames=new Map((sellerResult.data??[]).map(x=>[x.id,x.display_name]));
  const photoMap=new Map<string,AdPhoto[]>();
  for (const p of (photosResult.data??[]) as AdPhoto[]) photoMap.set(p.listing_id,[...(photoMap.get(p.listing_id)??[]),p]);
  const errors=[ads.error,reports.error,requests.error,logs.error,photosResult.error,sellerResult.error].filter(Boolean);
  const testValue=(simulated.data??[]).reduce((total,order)=>total+Number(order.amount_lkr),0);

  return <main className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
    <header className="rounded-3xl bg-[#24272E] px-6 py-8 text-white sm:px-9"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#E0BB7D]">Administration · Marketly</p><h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Marketplace control center</h1><p className="mt-2 max-w-2xl text-sm text-white/70">Review new ads with actual product photos, respond to reports and manage seller trust.</p></div><div className="rounded-xl bg-white/10 p-3"><ShieldCheck className="size-9 text-[#E0BB7D]"/></div></div>
    <div className="mt-6 flex flex-wrap gap-3 text-xs"><span className="rounded-full border border-white/20 px-3 py-1">Admin-only area</span><span className="rounded-full border border-white/20 px-3 py-1">Actions recorded in audit log</span><span className="rounded-full border border-amber-300/30 bg-amber-200/10 px-3 py-1 text-amber-100">Billing TEST MODE</span></div></header>
    {errors.length>0 && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-900">Some admin information could not load. Check Supabase RLS and SQL migrations 004/005. {errors.map(e=>e?.message).join(" · ")}</p>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Admin overview"><Stat label="Pending reviews" value={pending.length} icon={ClipboardList}/><Stat label="Open reports" value={reports.data?.length??0} icon={Flag}/><Stat label="Verification requests" value={requests.data?.length??0} icon={BadgeCheck}/><Stat label="Approved active ads" value={approved.count??0} icon={ShoppingBag}/><Stat label="Sandbox events (last 100)" value={sandbox.data?.length??0} icon={Wallet}/></section>
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Billing test mode:</strong> {formatLkr(testValue)} in simulated orders (latest 100). <strong>Real revenue: Rs. 0 from this test system.</strong> 05A legacy records stay separate. Phase 05B sandbox success/failure records have NO real monetary value or production entitlement.</div>

    <section className="rounded-2xl border border-amber-200 bg-white p-5"><h2 className="text-lg font-bold">Phase 05B sandbox billing overview</h2><p className="mt-1 text-sm text-stone-600">Sandbox only; not business revenue. {sandbox.data?.filter(x=>x.status==="simulated_success").length??0} simulated successes, {sandbox.data?.filter(x=>x.status==="simulated_failure").length??0} simulated failures (last 100).</p>{sandbox.error&&<p role="alert" className="mt-2 text-sm text-red-700">Apply SQL 006: {sandbox.error.message}</p>}</section>
    <section id="pending" className="scroll-mt-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">Ads waiting for review</h2><p className="mt-1 text-sm text-stone-500">Open full details before approving. Buyer visibility starts only after approval.</p></div><span className="rounded-full bg-[#F7EEDC] px-4 py-2 text-sm font-bold text-[#815A22]">{pending.length} pending</span></div>
      {!pending.length ? <p className="rounded-2xl border border-dashed bg-white p-9 text-center text-stone-500">All caught up — no pending ads.</p> : <div className="grid gap-5 lg:grid-cols-2">{pending.map(ad=>{const imgs=photoMap.get(ad.id)??[];const first=imgs[0];return <article key={ad.id} className="overflow-hidden rounded-2xl border border-[#E6DFD5] bg-white shadow-sm"><div className="grid gap-0 sm:grid-cols-[190px_1fr]"><div className="relative min-h-[210px] bg-[#F7F4F0]">{first ? <Image src={adImageUrl(first.preview_storage_path||first.storage_path)} alt={`${ad.title} preview`} fill unoptimized sizes="190px" className="object-cover"/> : <div className="grid size-full place-items-center text-stone-400"><ImageOff className="size-10"/></div>}<span className="absolute left-3 top-3 rounded-full bg-[#24272E] px-3 py-1 text-xs font-bold text-white">Awaiting review</span></div>
        <div className="space-y-2 p-5"><p className="text-xs font-semibold text-[#996B29]">{ad.category} · {ad.condition} · {ad.location}</p><h3 className="text-xl font-extrabold leading-snug">{ad.title}</h3><p className="text-xl font-black text-[#946926]">{formatLkr(Number(ad.price_lkr))}</p><p className="text-sm text-stone-600">Seller: <strong>{sellerNames.get(ad.seller_id)||"Marketly member"}</strong></p><p className="text-xs text-stone-500">{new Date(ad.published_at).toLocaleString("en-LK")} · {imgs.length} photo(s) · {ad.is_negotiable?"Negotiable":"Fixed price"}</p><p className="line-clamp-2 text-sm text-stone-600">{ad.description}</p></div></div>
        <div className="border-t px-5 py-4"><details className="group rounded-xl border border-[#E8DFD2] bg-[#FFFCF7] p-4"><summary className="cursor-pointer font-bold text-[#80591E]">View complete ad &amp; photo gallery <span className="text-xs text-stone-500">(expand)</span></summary><p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-stone-700">{ad.description}</p>{imgs.length>0 && <div className="mt-4"><ListingGallery title={ad.title} images={imgs.map(i=>adImageUrl(i.storage_path))}/></div>}<Link href={`/listings/${ad.id}`} className="mt-3 inline-block text-sm font-bold text-[#80591E] underline">Open listing detail page</Link></details><AdminActions kind="listing" id={ad.id}/></div>
      </article>})}</div>}
    </section>
    <section id="reports"><h2 className="mb-4 flex items-center gap-2 text-2xl font-bold"><Flag className="size-6 text-[#A3722F]"/>Open user reports ({reports.data?.length??0})</h2><div className="grid gap-4 sm:grid-cols-2">{(reports.data??[]).map(report=><article key={report.id} className="rounded-2xl border bg-white p-5"><p className="font-bold capitalize">{report.reason.replaceAll("_"," ")}</p><p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{report.details||"No extra details"}</p><p className="mt-2 text-xs text-stone-500">{new Date(report.created_at).toLocaleString("en-LK")}</p><Link href={`/listings/${report.listing_id}`} className="mt-2 inline-block text-sm font-semibold text-[#946926] underline">Review reported ad</Link><AdminActions kind="report" id={report.id}/></article>)}</div>{!reports.data?.length&&<p className="rounded-xl border border-dashed p-5 text-sm text-stone-500">No open reports.</p>}</section>
    <section id="verification"><h2 className="mb-4 flex items-center gap-2 text-2xl font-bold"><BadgeCheck className="size-6 text-[#A3722F]"/>Seller verification ({requests.data?.length??0})</h2><p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Verify identity through a documented and secure process outside this prototype. Do not collect NIC images through product image storage or public chat.</p><div className="grid gap-4 sm:grid-cols-2">{(requests.data??[]).map(req=><div key={req.id} className="rounded-2xl border bg-white p-5"><h3 className="font-bold capitalize">{req.kind} verification</h3><p className="mt-1 text-sm">Seller: {sellerNames.get(req.seller_id)||"Marketly member"}</p><p className="mt-2 text-sm text-stone-600">{req.details}</p><p className="mt-2 text-xs text-stone-500">{new Date(req.created_at).toLocaleString("en-LK")}</p><AdminActions kind="verification" id={req.id}/></div>)}</div>{!requests.data?.length&&<p className="rounded-xl border border-dashed p-5 text-sm text-stone-500">No verification requests.</p>}</section>
    <section><h2 className="mb-4 flex items-center gap-2 text-2xl font-bold"><BellRing className="size-6 text-[#A3722F]"/>Recent administrative actions</h2><div className="divide-y overflow-hidden rounded-2xl border bg-white">{(logs.data??[]).map(log=><div key={log.id} className="flex flex-wrap justify-between gap-2 px-5 py-4 text-sm"><span className="font-bold">{log.action.replaceAll("_"," ")}</span><span className="text-stone-500">{new Date(log.created_at).toLocaleString("en-LK")}</span>{log.note&&<p className="w-full text-xs text-stone-600">{log.note}</p>}</div>)}</div>{!logs.data?.length&&<p className="text-sm text-stone-500">No audit events yet.</p>}</section>
  </main>;
}
