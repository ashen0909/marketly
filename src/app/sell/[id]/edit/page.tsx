import { redirect,notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getMyListings } from "@/lib/catalog";
import { EditListingForm } from "@/components/market/edit-listing-form";
export const dynamic="force-dynamic";
export default async function EditAdPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  // Only own ads are accepted, even if listing ID is guessed.
  const listings=await getMyListings(user.id);const listing=listings.find(item=>item.id===id);if(!listing)notFound();
  return <main className="bg-[#FBFAF8] px-4 py-10"><div className="mx-auto mb-6 max-w-3xl"><Link href="/dashboard" className="text-sm font-semibold text-[#A3722F]">← Back to dashboard</Link><h1 className="mt-4 text-3xl font-extrabold">Edit your advertisement</h1></div><EditListingForm listing={listing}/></main>;
}
