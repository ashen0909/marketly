import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, CreditCard, FlaskConical, History, ShieldCheck, Wallet } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { SandboxCheckout } from "@/components/market/sandbox-checkout";
import { formatLkr } from "@/lib/config";
import { GoBackLink } from "@/components/market/return-navigation";

export const metadata: Metadata = { title: "Sandbox billing | Marketly" };
export const dynamic = "force-dynamic";

function BillingLoadError({ label }: { label: string }) {
  return <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{label} couldn&apos;t load right now. Refresh this page or try again later.</p>;
}
function simulatedStatus(status: string) {
  return status === "simulated_success" ? "Test success" : status === "simulated_failure" ? "Test failure" : "Test pending";
}
function readableKind(kind: string) {
  const names: Record<string,string> = { extra_ad: "Extra ad credit", boost: "Boost", business: "Business membership", photos: "Extra images", business_membership: "Business membership" };
  return names[kind] ?? "Sandbox service";
}

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
  const sandboxEnabled = process.env.NODE_ENV === "development" && process.env.MARKETLY_SANDBOX_ENABLED === "true";
  const sandboxCount = sandboxOrders.data?.length ?? 0;
  const activeCredits = (entitlements.data ?? []).filter(item => new Date(item.ends_at).getTime() > Date.now()).reduce((sum,item) => sum + Math.max(0,(item.credits_total ?? 0)-(item.credits_used ?? 0)),0);
  return <main className="marketly-billing-page mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
    <GoBackLink fallback="/dashboard" label="Back to seller dashboard"/>
    <header className="relative mt-5 overflow-hidden rounded-3xl border border-[#E5D8C2] bg-gradient-to-br from-[#FFFCF5] via-white to-[#F7ECD8] p-6 sm:p-8">
      <div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full bg-[#F6E9CF] px-3 py-1.5 text-xs font-bold text-[#795623]"><FlaskConical className="size-4"/> Phase 05B · Test mode</span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#24272E] sm:text-4xl">Billing made simple</h1><p className="mt-3 text-sm leading-6 text-[#626871]">Try Marketly service prices and see simulated payments, credits and expiry. <strong>No real money is charged and no paid features are activated.</strong></p>
        <Link href="/membership" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#A4752A] hover:underline">Review all membership prices</Link>
      </div>
    </header>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="marketly-surface-card flex items-center gap-3 p-4"><div className="rounded-xl bg-[#F7EAD1] p-2.5 text-[#A4752A]"><Wallet className="size-5"/></div><div><p className="text-xs text-stone-500">Sandbox credits left</p><p className="text-xl font-black text-[#A4752A]">{activeCredits}</p></div></div>
      <div className="marketly-surface-card flex items-center gap-3 p-4"><div className="rounded-xl bg-[#F8EFDA] p-2.5 text-[#9D7235]"><History className="size-5"/></div><div><p className="text-xs text-stone-500">Test payment events</p><p className="text-xl font-black">{sandboxCount}</p></div></div>
      <div className="marketly-surface-card flex items-center gap-3 p-4"><div className="rounded-xl bg-[#F7EAD1] p-2.5 text-[#A4752A]"><ShieldCheck className="size-5"/></div><div><p className="text-xs text-stone-500">Real money collected</p><p className="text-xl font-black text-[#A4752A]">Rs. 0</p></div></div>
    </div>
    {(adsResult.error || ordersResult.error || sandboxOrders.error || entitlements.error) && <div className="mt-4 space-y-2">
      {adsResult.error && <BillingLoadError label="Approved ads"/>}
      {ordersResult.error && <BillingLoadError label="Old test orders"/>}
      {sandboxOrders.error && <BillingLoadError label="Sandbox payment history"/>}
      {entitlements.error && <BillingLoadError label="Sandbox credits"/>}
    </div>}
    <div className="mt-6"><SandboxCheckout availableListings={adsResult.data ?? []} defaultListingId={listing} enabled={sandboxEnabled}/></div>
    <section className="marketly-surface-card mt-6 p-5 sm:p-7"><div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-[#A4752A]"/><h2 className="text-xl font-bold">Sandbox credits & benefits</h2></div><p className="mt-2 text-sm text-stone-500">These are TEST records. Expired balances are not counted.</p>
      {!entitlements.data?.length?<p className="marketly-empty-state mt-4">No test credits yet. Try a simulated payment above.</p>:<div className="mt-4 divide-y divide-[#EEE8DC]">{entitlements.data.map(item=>{const active=new Date(item.ends_at).getTime()>Date.now();return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><strong>{readableKind(item.kind)}</strong><p className="mt-1 text-xs text-stone-500">Expires: {new Date(item.ends_at).toLocaleDateString("en-LK")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${active?"bg-emerald-50 text-emerald-800":"bg-stone-100 text-stone-500"}`}>{active?(item.credits_total?`${Math.max(0,item.credits_total-item.credits_used)}/${item.credits_total} credits left`:"Test active"):"Expired"}</span></div>})}</div>}
    </section>
    <section className="marketly-surface-card mt-5 p-5 sm:p-7"><div className="flex items-center gap-2"><CreditCard className="size-5 text-[#A4752A]"/><h2 className="text-xl font-bold">Simulated payment history</h2></div><p className="mt-1 text-sm text-stone-500">For testing only — not business revenue.</p>
      {!sandboxOrders.data?.length?<p className="marketly-empty-state mt-4">No test payments yet.</p>:<div className="mt-4 divide-y divide-[#EEE8DC]">{sandboxOrders.data.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">{readableKind(item.kind)}</p><p className="mt-1 text-xs text-stone-500">{new Date(item.created_at).toLocaleString("en-LK")} · {simulatedStatus(item.status)}</p></div><strong className="text-[#23764C]">{formatLkr(Number(item.amount_lkr))}</strong></div>)}</div>}
    </section>
    <section className="marketly-surface-card mt-5 p-5 sm:p-7"><h2 className="text-lg font-bold">Earlier test quotes</h2><p className="mt-1 text-sm text-stone-500">Old Phase 05A quotes are not payments or income.</p>
      {!ordersResult.data?.length?<p className="marketly-empty-state mt-4">No earlier test quotes.</p>:<div className="mt-4 divide-y divide-[#EEE8DC]">{ordersResult.data.map(order=><div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><strong>{readableKind(order.kind)}</strong><p className="text-xs text-stone-500">{new Date(order.created_at).toLocaleString("en-LK")} · TEST ONLY</p></div><strong>{formatLkr(Number(order.amount_lkr))}</strong></div>)}</div>}
    </section>
    <p className="mt-5 flex items-center gap-2 text-xs text-stone-600"><ShieldCheck className="size-4 shrink-0 text-[#A4752A]"/> No card details are requested. <Link href="/dashboard" className="font-bold text-[#A4752A] underline">Return to your ads</Link></p>
  </main>;
}
