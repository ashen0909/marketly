import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCircle2, CircleHelp, Crown, ImagePlus, LockKeyhole, ShieldCheck, Store, TrendingUp, Wallet, Zap } from "lucide-react";
import { formatLkr, marketlyConfig } from "@/lib/config";
import { buttonVariants } from "@/components/ui/button";
import { GoBackLink } from "@/components/market/return-navigation";
import { createServerSupabase,hasSupabaseConfig } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pricing & memberships" };

const freeBenefits = ["3 free advertisements each calendar month", "First 5 photos included on every ad", "Buyer–seller chat, offers and favourites", "No product-sale commission"];
const businessBenefits = ["3 bonus advertisement credits for 30 days", "Keep your regular 3 free monthly ads", "Business storefront & analytics planned", "No paid identity-verification badge"];

export default async function MembershipPage() {
  let ownerBenefits=false;
  if(hasSupabaseConfig()) {const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(user){const {data}=await db.rpc("marketly_is_owner");ownerBenefits=!!data;}}
  return <main className="marketly-pricing-page mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
    <div className="mb-5"><GoBackLink fallback="/" label="Back"/></div>
    {ownerBenefits&&<div className="mb-5 rounded-2xl border border-[#DFC99B] bg-[#FFFAF0] p-5 text-sm text-[#795622]"><strong>Owner / Super Admin — Free benefits enabled.</strong> Unlimited ad postings and up to 12 photos per listing are free. Owner can promote approved own ads from Seller Dashboard at no cost. Business membership is an owner-level entitlement; actual business storefront and analytics are not launched yet.</div>}
    <section className="relative overflow-hidden rounded-[2rem] border border-[#E3DFD4] bg-gradient-to-br from-[#FFFEFA] via-[#FDF7E9] to-[#F6E8D0] px-5 py-9 shadow-[0_18px_60px_rgba(72,50,20,.07)] sm:px-10 sm:py-12">
      <div className="pointer-events-none absolute -right-12 -top-20 size-60 rounded-full bg-[#F3E3C7]/50 blur-3xl" aria-hidden="true"/>
      <div className="pointer-events-none absolute -bottom-20 left-1/4 size-48 rounded-full bg-[#F2D79F]/40 blur-3xl" aria-hidden="true"/>
      <div className="relative max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#E8D6BA] bg-white/80 px-3 py-1.5 text-xs font-bold text-[#896326]"><ShieldCheck className="size-4"/> Fair & transparent pricing</span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-[#24272E] sm:text-5xl">Start free. <span className="text-[#A4752A]">Grow when you&apos;re ready.</span></h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#56615A] sm:text-base">Buy and sell directly in Sri Lanka. No commission on the sale of goods. Optional seller services have simple, upfront prices.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link className="marketly-primary-cta" href="/sell/new">Post a free ad <ArrowRight className="size-4"/></Link><Link className={buttonVariants({variant:"outline"})} href="/billing">Try sandbox billing</Link></div>
        <p className="mt-4 flex items-start gap-2 text-xs font-medium text-[#6F6050]"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#A4752A]"/> Real payments are not enabled. The billing area is a simulated checkout for testing.</p>
      </div>
    </section>

    <section className="mt-10" aria-labelledby="membership-plans">
      <div className="mb-5"><span className="text-xs font-extrabold uppercase tracking-[.14em] text-[#A4752A]">Choose your starting point</span><h2 id="membership-plans" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Plans that make sense</h2></div>
      <div className="grid gap-5 md:grid-cols-2">
        <article className="marketly-surface-card relative p-6 sm:p-8">
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-bold text-[#755B2F]"><Store className="size-5"/> Every buyer & seller</span><span className="rounded-full bg-[#F4F2EA] px-3 py-1 text-xs font-semibold">Always free</span></div>
          <h3 className="mt-6 text-3xl font-black tracking-tight">Free <span className="text-base font-medium text-stone-500">forever</span></h3>
          <p className="mt-2 text-sm text-stone-600">Everything you need to begin buying and selling.</p>
          <ul className="mt-6 space-y-3">{freeBenefits.map(item=><li key={item} className="flex items-start gap-2.5 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#AB813C]"/>{item}</li>)}</ul>
          <Link href="/sell/new" className={`${buttonVariants({variant:"outline"})} mt-8 w-full`}>Start selling for free <ArrowRight className="size-4"/></Link>
        </article>
        <article className="marketly-surface-card relative border-[#DFC291] bg-gradient-to-br from-[#FFFCF5] via-white to-[#FFF8E9] p-6 shadow-[0_15px_55px_rgba(161,120,50,.08)] sm:p-8">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-bold text-[#805B28]"><Crown className="size-5"/> Marketly Business</span><span className="rounded-full bg-[#F7E9CD] px-3 py-1 text-xs font-bold text-[#805B28]">Extra flexibility</span></div>
          <h3 className="mt-6 text-3xl font-black tracking-tight text-[#805B28]">{formatLkr(300)} <span className="text-base font-medium text-stone-500">/ 30 days</span></h3>
          <p className="mt-2 text-sm text-stone-600">Pay once for three bonus posting credits and planned business tools.</p>
          <ul className="mt-6 space-y-3">{businessBenefits.map(item=><li key={item} className="flex items-start gap-2.5 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#AB813C]"/>{item}</li>)}</ul>
          <Link href="/billing" className="marketly-primary-cta mt-8 w-full">Explore test membership <ArrowRight className="size-4"/></Link>
          <p className="mt-3 text-center text-xs text-[#776953]">Sandbox only · No real membership activation</p>
        </article>
      </div>
    </section>

    <section className="mt-12" aria-labelledby="extra-services"><h2 id="extra-services" className="text-2xl font-extrabold">Only pay for what you need</h2><p className="mt-2 text-sm text-stone-600">Clear, independent prices. No confusing bundles or hidden seller commission.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="marketly-surface-card p-5"><div className="flex items-center gap-2 text-[#A57832]"><Wallet className="size-5"/><h3 className="font-bold text-[#24272E]">Extra advertisement</h3></div><p className="mt-4 text-2xl font-black">{formatLkr(100)} <span className="text-sm font-medium text-stone-500">per extra ad</span></p><p className="mt-2 text-sm text-stone-600">After using your three monthly free slots.</p></div>
        <div className="marketly-surface-card p-5"><div className="flex items-center gap-2 text-[#A57832]"><ImagePlus className="size-5"/><h3 className="font-bold text-[#24272E]">Additional photos</h3></div><p className="mt-4 text-2xl font-black">{formatLkr(marketlyConfig.extraImagePriceLkr)} <span className="text-sm font-medium text-stone-500">per extra photo</span></p><p className="mt-2 text-sm text-stone-600">Your first {marketlyConfig.freeImagesPerListing} images are free. Paid image publishing is not live yet.</p></div>
        <div className="marketly-surface-card p-5 sm:col-span-2 lg:col-span-1"><div className="flex items-center gap-2 text-[#A57832]"><Zap className="size-5"/><h3 className="font-bold text-[#24272E]">Featured boost</h3></div><p className="mt-4 text-2xl font-black">From {formatLkr(100)}</p><p className="mt-2 text-sm text-stone-600">Choose a 7, 14 or 30-day promotion. No guaranteed sales.</p></div>
      </div>
    </section>

    <section className="mt-12 rounded-3xl border border-[#EADFCB] bg-[#FFFCF6] p-6 sm:p-8" aria-labelledby="boost-plans"><div className="flex items-center gap-2"><TrendingUp className="size-6 text-[#A4752A]"/><h2 id="boost-plans" className="text-xl font-extrabold sm:text-2xl">Simple boost packages</h2></div><p className="mt-2 text-sm text-stone-600">All packages use the same planned sponsored placement; only the duration changes.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{marketlyConfig.boostPlans.map(plan=><div key={plan.id} className="rounded-2xl border border-[#E8E3D8] bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#8D6A35]">{plan.days} days</p><p className="mt-2 text-2xl font-extrabold text-[#A4752A]">{formatLkr(plan.priceLkr)}</p><p className="mt-1 text-xs text-stone-500">{plan.id === "popular" ? "A balanced duration" : plan.id === "premium" ? "Longer visibility window" : "Try a short promotion"}</p></div>)}</div>
      <Link href="/billing" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#805B28] hover:underline">Preview packages in sandbox <ArrowRight className="size-4"/></Link>
    </section>

    <div className="mt-10 grid gap-4 rounded-2xl border border-[#E6E4DA] bg-white p-5 text-sm text-stone-600 sm:grid-cols-2 sm:p-6"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 size-5 shrink-0 text-[#A4752A]"/><p><strong className="text-stone-900">Verification is separate.</strong> A membership never purchases an identity-verified badge.</p></div><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-[#A4752A]"/><p><strong className="text-stone-900">Test mode only.</strong> No card details are collected, no real money charged or paid entitlements activated.</p></div></div>
    <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-stone-500"><CircleHelp className="size-4"/> Questions? Visit your <Link href="/profile" className="font-bold text-[#A4752A] underline">profile</Link> for your account details.</div>
  </main>;
}
