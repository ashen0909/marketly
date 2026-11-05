import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, CheckCircle2, MapPin, Search, ShieldCheck, Sparkles, Tag, Users, Zap } from "lucide-react";
import { categories } from "@/data/catalog";
import { getListings } from "@/lib/catalog";
import { ListingCard } from "@/components/market/listing-card";
import { CategoryIcon } from "@/components/market/category-icon";
import { buttonVariants } from "@/components/ui/button";
import { RecentlyViewedSection } from "@/components/market/smart-listing-actions";

export default async function HomePage() {
  const { listings, sample, error } = await getListings();
  return <>
    <section className="hero-bg overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-7 px-5 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.15fr_.85fr] lg:py-16">
        <div className="relative z-10">
          <h1 className="hero-text max-w-2xl text-4xl font-extrabold leading-[1.1] text-[#24272E] sm:text-5xl lg:text-[3.6rem]">Buy better. <span className="text-[#AD7B32]">Sell easier.</span></h1>
          <p className="mb-6 mt-4 text-base text-[#4E5560] sm:text-lg">Discover great deals across Sri Lanka.</p>
          <form action="/listings" method="get" role="search" className="flex w-full max-w-[720px] flex-col gap-2 rounded-2xl border border-[#E2DBD0] bg-white p-2 shadow-[0_8px_24px_rgba(50,35,12,.07)] sm:flex-row sm:items-center">
            <label htmlFor="hero-search" className="sr-only">Search products</label>
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3"><Search className="size-5 shrink-0 text-[#AE7A31]"/><input id="hero-search" name="q" placeholder="What are you looking for?" className="h-11 w-full min-w-0 text-sm outline-none" /></div>
            <button className={buttonVariants({ size: "lg" })} type="submit">Search <ArrowRight className="size-4"/></button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">Popular:</span>{["iPhone", "Laptops", "Bikes", "Cars", "Furniture"].map((term) => <Link key={term} href={`/listings?q=${encodeURIComponent(term)}`} className="rounded-full border border-[#DFCDB5] bg-white/60 px-3 py-1.5 hover:bg-white">{term}</Link>)}</div>
        </div>
        <div className="relative hidden h-[255px] lg:block"><Image src="/images/hero.webp" alt="Furniture, laptop and consumer products" fill sizes="480px" className="object-contain" priority/></div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-extrabold tracking-tight">Explore categories</h2><Link href="/listings" className="flex items-center gap-1 text-sm font-semibold text-[#A3722F]">See all <ArrowRight className="size-4" /></Link></div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 lg:grid-cols-8 sm:gap-3">
        {categories.map((category) => <Link key={category.id} href={`/listings?category=${encodeURIComponent(category.id)}`} className="flex min-h-[105px] flex-col items-center justify-center gap-2 rounded-2xl bg-[#F8F7F5] p-2 text-center transition-colors hover:bg-[#F0E6D6]">
          <CategoryIcon icon={category.icon}/><span className="text-xs font-semibold sm:text-sm">{category.name}</span>
        </Link>)}
      </div>
      <div className="mt-8 grid gap-4 rounded-2xl border border-[#ECE7E1] bg-[#FBFAF8] px-6 py-5 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3"><ShieldCheck className="size-7 shrink-0 text-[#AA782C]"/><span><strong className="block text-sm">Safer trading</strong><span className="text-[#6B7280]">Report suspicious listings</span></span></div>
        <div className="flex items-center gap-3"><Zap className="size-7 shrink-0 text-[#AA782C]"/><span><strong className="block text-sm">Boost your ad</strong><span className="text-[#6B7280]">From Rs.100 — coming soon</span></span></div>
        <div className="flex items-center gap-3"><Tag className="size-7 shrink-0 text-[#AA782C]"/><span><strong className="block text-sm">3 free ads / month</strong><span className="text-[#6B7280]">5 free product photos each</span></span></div>
        <div className="flex items-center gap-3"><Users className="size-7 shrink-0 text-[#AA782C]"/><span><strong className="block text-sm">Direct connections</strong><span className="text-[#6B7280]">No product-sale commission</span></span></div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-extrabold tracking-tight">Fresh listings</h2><Link href="/listings" className="flex items-center gap-1 text-sm font-semibold text-[#A3722F]">View all <ArrowRight className="size-4"/></Link></div>
      {sample && <p className="mb-4 rounded-xl bg-[#FFF7EA] px-4 py-3 text-sm text-[#745022]"><Sparkles className="mr-2 inline size-4"/> Sample products are for UI preview only — not real sale offers.</p>}
      {error && <p className="error-text mb-4">{error}</p>}
      {listings.length ? <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{listings.slice(0, 8).map((listing) => <ListingCard key={listing.id} listing={listing} returnTo="/"/>)}</div> : <div className="rounded-2xl border border-dashed p-8 text-center text-[#68707C]">No published listings yet. Be the first seller!</div>}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-[#68707C]"><BadgeCheck className="size-4" /> Clear pricing <CheckCircle2 className="size-4" /> No hidden seller commission <MapPin className="size-4" /> Across Sri Lanka</div>
    </section>
    <RecentlyViewedSection />
  </>;
}
