import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Heart } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { ListingCard } from "@/components/market/listing-card";
import { getFavoriteListings } from "@/lib/catalog";
import { PaginationControls } from "@/components/market/pagination-controls";
import { readPage, totalPages } from "@/lib/pagination";

export const metadata: Metadata = { title: "Saved items" };
export const dynamic = "force-dynamic";
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = readPage((await searchParams).page);
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { listings, error, total } = await getFavoriteListings(user.id, page);
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <h1 className="flex items-center gap-3 text-3xl font-extrabold"><Heart className="size-8 text-[#B88746]"/>Saved items</h1>
    <p className="mt-2 text-sm text-stone-500">Keep track of products you want to revisit.</p>
    {error && <p className="error-text mt-5">Could not load saved items. Apply database migration 003 first.</p>}
    <p className="mt-3 text-sm text-stone-500">{total} saved items</p>
    {!error && listings.length ? <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{listings.map(item => <ListingCard key={item.id} listing={item}/>)}</div> : !error && <div className="mt-8 rounded-2xl border border-dashed p-10 text-center"><p>No saved products yet.</p><Link href="/listings" className="mt-3 inline-block font-semibold text-[#946926] underline">Explore listings</Link></div>}
    <PaginationControls path="/favorites" page={page} pages={totalPages(total)} />
  </div>;
}
