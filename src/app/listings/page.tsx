import type { Metadata } from "next";
import { categories, locations } from "@/data/catalog";
import { getListings } from "@/lib/catalog";
import { ListingCard } from "@/components/market/listing-card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Browse listings" };
export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; location?: string }> }) {
  const filters = await searchParams;
  const { listings, sample, error } = await getListings(filters);
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-extrabold">Browse listings</h1><p className="mb-7 mt-2 text-[#6B7280]">Discover local offers with simple filters.</p>
    <form action="/listings" className="mb-8 grid gap-3 rounded-2xl border border-stone-200 bg-[#FBFAF8] p-4 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
      <label className="sr-only" htmlFor="q">Search listings</label><input id="q" name="q" defaultValue={filters.q ?? ""} placeholder="Search listings..." className="field-control"/>
      <label className="sr-only" htmlFor="category">Category</label><select id="category" name="category" defaultValue={filters.category ?? "All"} className="field-control"><option>All</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <label className="sr-only" htmlFor="location">Location</label><select id="location" name="location" defaultValue={filters.location ?? "All Sri Lanka"} className="field-control"><option>All Sri Lanka</option>{locations.map(c=><option key={c}>{c}</option>)}</select>
      <button className={buttonVariants()} type="submit">Apply filters</button>
    </form>
    {sample && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Development mode: these are sample items, not real sale offers.</p>}
    {error && <p className="error-text mb-4">{error}</p>}
    <p className="mb-4 text-sm text-[#6B7280]">{listings.length} listings</p>
    {listings.length ? <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{listings.map(item=><ListingCard key={item.id} listing={item}/>)}</div> : <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center">No products found. Try a different search or category.</div>}
  </div>;
}
