import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, ShieldCheck } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { SandboxCheckout } from "@/components/market/sandbox-checkout";
import { formatLkr } from "@/lib/config";
export const metadata: Metadata = { title: "Billing test lab | Marketly" };
export const dynamic = "force-dynamic";
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  if (!hasSupabaseConfig()) redirect("/login");
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { listing } = await searchParams;
  const [adsResult, ordersResult, sandboxOrders, entitlements] = await Promise.all([
    db.from("listings").select("id,title").eq("seller_id", user.id).eq("status", "active").eq("moderation_status", "approved").order("published_at",{ascending:false}).limit(100),
    db.from("marketly_test_orders").select("id,kind,amount_lkr,plan_id,photo_count,created_at").eq("user_id", user.id).order("created_at",{ascending:false}).limit(10),
    db.from("marketly_sandbox_payments").select("id,kind,status,amount_lkr,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(30),
    db.from("marketly_sandbox_entitlements").select("id,kind,credits_total,credits_used,starts_at,ends_at,listing_id").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50),
  ]);
  return <main className="mx-auto max-w-5xl space-y-7 px-4 py-10 sm:px-6">
    <header><p className="font-semibold text-[#916629]">Marketly Phase 05B</p><h1 className="mt-2 text-3xl font-extrabold">Secure sandbox billing lab</h1><p className="mt-2 text-stone-600">Simulate gateway success/failure and record test-only credits, memberships and boosts. <strong>Real money, public ad priority and production posting quota are NOT changed.</strong></p></header>
    {adsResult.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm">Cannot load your ads: {adsResult.error.message}</p>}
    {ordersResult.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm">Cannot load test orders. Run SQL migration 005: {ordersResult.error.message}</p>}
    {sandboxOrders.error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm">Sandbox SQL 006 required: {sandboxOrders.error.message}</p>}
    <SandboxCheckout availableListings={adsResult.data ?? []} defaultListingId={listing} enabled={process.env.NODE_ENV==="development"&&process.env.MARKETLY_SANDBOX_ENABLED==="true"}/>
    <section className="rounded-2xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Sandbox credits &amp; benefits</h2><p className="mt-1 text-xs text-stone-500">These are isolated TEST entitlements. Validity is calculated at display time, so expired records automatically stop counting.</p>
      {!entitlements.data?.length?<p className="mt-4 text-sm text-stone-500">No sandbox entitlements yet.</p>:<div className="mt-4 divide-y">{entitlements.data.map(item=>{const active=new Date(item.ends_at).getTime()>Date.now();return <div key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><strong className="capitalize">{item.kind.replaceAll("_"," ")}</strong><p className="text-xs text-stone-500">Expires: {new Date(item.ends_at).toLocaleString("en-LK")} · {active?"Active sandbox preview":"Expired"}</p></div><span className="font-semibold">{item.credits_total?`${item.credits_total-item.credits_used}/${item.credits_total} test credits remaining`:"Test preview"}</span></div>})}</div>}
    </section>
    <section className="rounded-2xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Phase 05B simulated payment events</h2><p className="mt-1 text-xs text-stone-500">Only sandbox records. Never real revenue.</p>
      {!sandboxOrders.data?.length?<p className="mt-4 text-sm text-stone-500">No simulated payments yet.</p>:<div className="mt-4 divide-y">{sandboxOrders.data.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><p className="font-bold capitalize">{item.kind.replaceAll("_"," ")}</p><p className="text-xs text-stone-500">{item.status.replaceAll("_"," ")} · {new Date(item.created_at).toLocaleString("en-LK")}</p></div><strong>{formatLkr(Number(item.amount_lkr))}</strong></div>)}</div>}
    </section>
    <section className="rounded-2xl border bg-white p-5 sm:p-7"><div className="flex items-center gap-2"><CreditCard className="size-5 text-[#B88746]"/><h2 className="text-xl font-bold">Old Phase 05A test orders</h2></div><p className="mt-1 text-xs text-stone-500">These are older Phase 05A quotes; they do not represent payments or income.</p>
      {!ordersResult.data?.length ? <p className="mt-5 rounded-xl bg-stone-50 p-4 text-sm text-stone-500">No test orders recorded yet.</p> : <div className="mt-5 divide-y">{ordersResult.data.map(order=><div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold capitalize">{order.kind}{order.plan_id ? ` · ${order.plan_id}` : ""}{order.photo_count ? ` · ${order.photo_count} photos` : ""}</p><p className="text-xs text-stone-500">{new Date(order.created_at).toLocaleString("en-LK")} · TEST ONLY</p></div><span className="font-semibold">{formatLkr(Number(order.amount_lkr))}</span></div>)}</div>}
    </section><div className="flex items-center gap-2 text-xs text-stone-600"><ShieldCheck className="size-4"/> No card numbers or banking details are requested. <Link href="/dashboard" className="font-bold underline">Return to seller dashboard</Link></div>
  </main>;
}
