"use client";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImagePlus, CheckCircle2, LockKeyhole, Trash2, Info, ShieldAlert, Camera } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categories, locations } from "@/data/catalog";
import { formatLkr, marketlyConfig } from "@/lib/config";
import { quoteListingImages } from "@/lib/pricing";
import { PriceField } from "@/components/market/price-field";

export function SellForm({ canPublish, quotaUsed }: { canPublish: boolean; quotaUsed: number }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const quote = useMemo(() => quoteListingImages(files.length), [files.length]);
  const remaining = Math.max(0, marketlyConfig.freeAdsPerCalendarMonth - quotaUsed);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setImageUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const f of incoming) {
      if (!(marketlyConfig.imageMimeTypes as readonly string[]).includes(f.type)) { setError("Only JPG, PNG or WEBP images are allowed."); return; }
      if (f.size > marketlyConfig.maxImageBytes) { setError("Each photo must be 5 MB or smaller."); return; }
    }
    setFiles(current => {
      const next = [...current, ...incoming];
      if (next.length > marketlyConfig.maxImagesPerListing) { setError(`Maximum ${marketlyConfig.maxImagesPerListing} photos per ad.`); return current; }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setError("");
    if (!canPublish) { setError("Sign in and connect Supabase before publishing."); return; }
    if (remaining < 1) { setError("Your 3 free ads have been used this calendar month."); return; }
    if (!files.length) { setError("Please add at least one product image."); return; }
    if (!quote.canPublishWithoutPayment) { setError("Extra photos cost Rs.100 each, but Phase 05A checkout is only a simulation and cannot unlock uploads. Select up to five photos to publish."); return; }
    setIsSaving(true);
    try {
      const data = new FormData(event.currentTarget);
      files.forEach(f=>data.append("images",f));
      const response = await fetch("/api/listings", { method: "POST", body: data, credentials: "same-origin" });
      const json: { message?: string; id?: string } = await response.json();
      if (!response.ok) throw new Error(json.message || "Could not publish this listing.");
      router.push("/dashboard?published=1");router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error."); }
    finally { setIsSaving(false); }
  }

  return <div className="grid gap-6 lg:grid-cols-[1fr_310px]">
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
      <h2 className="text-xl font-bold">Product details</h2>
      <div><label htmlFor="title" className="field-label">What are you selling? *</label><Input id="title" name="title" placeholder="e.g. Samsung Galaxy S23 – 256GB" minLength={5} maxLength={90} required /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="category" className="field-label">Category *</label><select id="category" name="category" required defaultValue="" className="field-control"><option value="" disabled>Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label htmlFor="condition" className="field-label">Condition *</label><select id="condition" name="condition" required defaultValue="" className="field-control"><option value="" disabled>Choose condition</option><option>New</option><option>Used</option><option>Refurbished</option></select></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><PriceField /><div><label htmlFor="location" className="field-label">District / area *</label><select id="location" name="location" required defaultValue="" className="field-control"><option value="" disabled>Select location</option>{locations.map(c=><option key={c}>{c}</option>)}</select></div></div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="is_negotiable" value="true" className="size-4 accent-[#B88746]" /> Price is negotiable</label>
      <div><label htmlFor="description" className="field-label">Description *</label><textarea id="description" name="description" className="field-control min-h-[135px]" minLength={20} maxLength={2500} placeholder="Describe condition, accessories, issues, and other important details." required /></div>
      <div className="space-y-3">
        <div><h3 className="font-semibold">Product photos</h3><p className="field-help">First 5 FREE · Each additional photo Rs.10 · Up to 12 total · Marketly watermark added on publish</p></div>
        <label htmlFor="image-picker" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#DCD2C3] bg-[#FBFAF8] p-7 text-center hover:bg-[#F8F3EB]"><ImagePlus className="size-8 text-[#A3722F]"/><span className="font-semibold">Choose product photos</span><span className="text-xs text-[#68707C]">JPG / PNG / WEBP · 5 MB max per photo</span></label>
        <input id="image-picker" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} className="sr-only" aria-label="Choose product photos" />
        {files.length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{files.map((file,i)=><div key={`${file.name}-${i}-${file.lastModified}`} className="group relative aspect-square overflow-hidden rounded-xl border"><img src={imageUrls[i]} alt={`Selected photo ${i+1}`} className="size-full object-cover"/><span aria-hidden="true" className="pointer-events-none absolute bottom-1 right-1 rounded bg-[#24272E]/65 px-1 py-0.5 text-[9px] font-bold text-white">Marketly</span><button type="button" onClick={()=>setFiles(old=>old.filter((_,j)=>j!==i))} aria-label={`Remove photo ${i+1}`} className="absolute right-1 top-1 rounded-lg bg-white/95 p-1.5 text-red-700 shadow"><Trash2 className="size-4"/></button><span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{i+1}</span></div>)}</div>}
        <div className="rounded-xl border border-[#EADCC9] bg-[#FFFAF3] p-4" aria-live="polite"><div className="flex justify-between text-sm"><span>Selected photos</span><strong>{quote.imageCount}/{marketlyConfig.maxImagesPerListing}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Free photos</span><strong>{quote.freeImageCount}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Extra photos × Rs.100</span><strong>{quote.extraImageCount}</strong></div><hr className="my-3 border-[#E7D6BE]"/><div className="flex justify-between font-extrabold"><span>Photo upload charge</span><span className="text-[#A3722F]">{formatLkr(quote.extraImageTotalLkr)}</span></div></div>
        {quote.extraImageCount > 0 && <p role="status" className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><LockKeyhole className="size-5 shrink-0"/> Additional photo checkout is pending payment gateway approval. Your photos are not charged or uploaded until checkout is enabled. For now, remove paid photos to publish.</p>}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!canPublish && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Connect Supabase and <Link href="/login" className="font-bold underline">sign in</Link> before publishing. You can still preview photo pricing.</p>}
      <Button type="submit" className="w-full" disabled={isSaving || !canPublish || remaining < 1 || !quote.canPublishWithoutPayment}>{isSaving ? "Publishing securely..." : quote.extraImageCount > 0 ? "Extra photo checkout (test mode only)" : "Submit for admin review"}</Button>
      <p className="field-help">Ads become public only after admin approval. Extra photos cost Rs.100 each after the first five; test orders do not unlock paid uploads or boosts.</p>
    </form>
    <aside className="space-y-5"><div className="rounded-2xl border border-stone-200 bg-white p-5"><h3 className="font-bold">Free ad allowance</h3><div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-[#B88746]" style={{width:`${Math.min(100,quotaUsed/3*100)}%`}}/></div><div className="mt-3 text-3xl font-extrabold">{remaining}<span className="ml-1 text-sm font-normal text-stone-500">ads left this month</span></div><p className="mt-3 text-xs leading-relaxed text-[#68707C]">Three free ads per calendar month. Additional ads cost Rs.100 each; Phase 05B sandbox credits are for testing only and do not unlock real posting. Deleting an ad does not refund a slot.</p></div>
    <div className="rounded-2xl bg-[#F8F5EE] p-5"><h3 className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-5 text-[#A3722F]"/> Make your ad stand out</h3><ul className="mt-4 space-y-3 text-sm text-[#5D626B]"><li className="flex gap-2"><Camera className="size-4 shrink-0"/>Use your own clear photos</li><li className="flex gap-2"><Info className="size-4 shrink-0"/>Describe any defects honestly</li><li className="flex gap-2"><ShieldAlert className="size-4 shrink-0"/>Never share OTP or card PIN</li></ul></div>
    <Link href="/membership" className={`${buttonVariants({ variant: "outline" })} w-full`}>See transparent pricing</Link></aside>
  </div>;
}
