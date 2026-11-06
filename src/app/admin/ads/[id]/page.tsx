import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminActions } from "@/components/market/admin-actions";
import { ListingGallery } from "@/components/market/listing-gallery";
import { formatLkr } from "@/lib/config";
export const dynamic = "force-dynamic";
export default async function AdminAdDetail({ params }: { params: Promise<{ id: string }> }) {
 const {id}=await params;if (!/^[a-f\d-]{36}$/i.test(id)) notFound();
 const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {data:allowed}=await db.rpc("marketly_admin_has_permission",{p_permission:"listings"});if(!allowed)notFound();
 const {data:listing}=await db.from("listings").select("id,seller_id,title,description,price_lkr,category,location,moderation_status,condition,status,created_at").eq("id",id).maybeSingle();
 if(!listing)notFound();
 const {data:photos}=await db.from("listing_images").select("storage_path,position").eq("listing_id",id).order("position");
 const url=(path:string)=>`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-images/${encodeURI(path)}`;
 return <main className="mx-auto max-w-4xl space-y-5 px-4 py-9 sm:px-6"><Link href="/admin#pending" className="text-sm font-bold text-[#8E6428]">← Admin dashboard</Link>
 <h1 className="text-3xl font-extrabold">Advertisement review</h1>
 <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-[#906A33]">{listing.category} · {listing.condition} · {listing.location}</p>
 <h2 className="mt-2 text-2xl font-extrabold">{listing.title}</h2><p className="mt-1 font-extrabold">{formatLkr(Number(listing.price_lkr))}</p>
 <p className="mt-3 whitespace-pre-wrap text-sm">{listing.description}</p>
 {!!photos?.length&&<div className="mt-4"><ListingGallery title={listing.title} images={photos.map(x=>url(x.storage_path))}/></div>}
 <p className="mt-4 text-xs text-stone-500">Status: {listing.moderation_status} · Seller ID: {listing.seller_id}</p>
 {listing.moderation_status==="pending"?(listing.seller_id===user.id?<p className="rounded-lg bg-amber-50 p-3 text-sm">Another admin must review your own listing.</p>:<AdminActions kind="listing" id={id}/>):<p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm">This listing has already been reviewed.</p>}
 </div><Link href="/notifications" className="text-sm font-semibold text-[#8E6428] underline">Back to notifications</Link></main>;
}
