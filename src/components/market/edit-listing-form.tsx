"use client";
import { useState,type FormEvent,type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { categories,locations,type Listing } from "@/data/catalog";
import { PriceField } from "@/components/market/price-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditListingForm({listing}:{listing:Listing}){
  const router=useRouter();const [files,setFiles]=useState<File[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  function selectFiles(e:ChangeEvent<HTMLInputElement>){setError("");const selected=Array.from(e.target.files||[]);setFiles(selected);
    if(selected.length>5)setError("Five photos are free; each extra photo costs Rs.100, but checkout is TEST ONLY and cannot unlock uploads yet.");}
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(files.length>5)return;
    setBusy(true);setError("");try{const data=new FormData(e.currentTarget);files.forEach(f=>data.append("images",f));
      const res=await fetch(`/api/listings/${listing.id}`,{method:"PATCH",body:data});const result=await res.json();
      if(!res.ok)throw new Error(result.message||"Could not edit ad");router.push("/dashboard?edited=1");router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Unexpected error");}finally{setBusy(false);}}
  return <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5 rounded-2xl border bg-white p-6">
    <div><label className="field-label" htmlFor="edit-title">Title</label><Input id="edit-title" name="title" defaultValue={listing.title} minLength={5} maxLength={90} required/></div>
    <div className="grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="edit-category">Category</label><select id="edit-category" name="category" defaultValue={listing.category} className="field-control">{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <div><label className="field-label" htmlFor="edit-condition">Condition</label><select id="edit-condition" name="condition" defaultValue={listing.condition} className="field-control">{["New","Used","Refurbished"].map(c=><option key={c}>{c}</option>)}</select></div></div>
    <div className="grid gap-4 sm:grid-cols-2"><PriceField initialValue={listing.price_lkr}/><div><label className="field-label" htmlFor="edit-location">Location</label><select id="edit-location" name="location" defaultValue={listing.location} className="field-control">{locations.map(c=><option key={c}>{c}</option>)}</select></div></div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="is_negotiable" value="true" defaultChecked={!!listing.is_negotiable} className="size-4 accent-[#B88746]"/>Price negotiable</label>
    <div><label className="field-label" htmlFor="edit-description">Description</label><textarea id="edit-description" name="description" defaultValue={listing.description} minLength={20} maxLength={2500} required className="field-control min-h-36"/></div>
    <section><h2 className="font-semibold">Current photos</h2><div className="mt-2 grid grid-cols-5 gap-2">{(listing.preview_urls||listing.image_urls).map((src,i)=><div key={i} className="relative aspect-square overflow-hidden rounded-lg border"><Image src={src} alt={`Current photo ${i+1}`} fill className="object-cover" unoptimized/></div>)}</div>
      <label className="field-label mt-4 block" htmlFor="replacement-photos">Replace all photos (optional)</label><input id="replacement-photos" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectFiles} className="w-full text-sm"/>
      <p className="mt-2 text-xs text-stone-500">Leave empty to keep current photos. Select 1–5 to replace all. Additional photos are Rs.100 each, but not enabled for real upload until payments are verified.</p>
      {files.length>0&&<p className="mt-2 text-xs font-semibold">{files.length} new photo(s) selected. No paid image checkout yet.</p>}
    </section><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Saving changes sends the ad back to Pending Review. If it is Sold, it stays Sold until you select Relist.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<Button type="submit" disabled={busy||files.length>5} className="w-full">{busy?"Saving...":"Save changes for review"}</Button>
  </form>;
}
