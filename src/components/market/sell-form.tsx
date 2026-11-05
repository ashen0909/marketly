"use client";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, ImagePlus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriceField } from "@/components/market/price-field";
import { categories, locations } from "@/data/catalog";
import { marketlyConfig } from "@/lib/config";
import { firstInvalidListingField, listingFieldIssues, sameTitle, type ListingFieldName } from "@/lib/listing-quality";
import { ListingFieldFeedback } from "@/components/market/listing-field-feedback";
import { publicListingImageUrl, type SavedDraft } from "@/lib/listing-drafts";

type Existing = { kind: "existing"; path: string; src: string; id: string };
type Fresh = { kind: "new"; file: File; src: string; id: string };
type Photo = Existing | Fresh;

export function SellForm({ canPublish, quotaUsed, draft, existingTitles = [] }: {
  canPublish: boolean; quotaUsed: number; draft?: SavedDraft | null; existingTitles?: string[];
}) {
  const router = useRouter();
  const savedSnapshot = useRef<string>(JSON.stringify({title:draft?.title??"",description:draft?.description??"",price:draft?.price_lkr??0,category:draft?.category??"",location:draft?.location??"",condition:draft?.condition??"",negotiable:!!draft?.is_negotiable,photoIds:draft?.image_paths??[]}));
  const formRef = useRef<HTMLFormElement>(null);
  const urlsRef = useRef<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>(() => (draft?.image_paths ?? []).map((path, index) => ({
    kind: "existing", id: path, path, src: publicListingImageUrl(draft!.preview_paths[index] || path),
  })));
  const [draftId, setDraftId] = useState(draft?.id ?? "");
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [price, setPrice] = useState(draft?.price_lkr ?? 0);
  const [category, setCategory] = useState(draft?.category ?? "");
  const [location, setLocation] = useState(draft?.location ?? "");
  const [condition, setCondition] = useState(draft?.condition ?? "");
  const [negotiable, setNegotiable] = useState(!!draft?.is_negotiable);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<ListingFieldName, boolean>>>({});
  const [preview, setPreview] = useState(false);
  const currentSnapshot = JSON.stringify({title,description,price,category,location,condition,negotiable,photoIds:photos.map(item=>item.kind==="existing"?item.path:item.id)});
  useEffect(()=>{
    if(currentSnapshot===savedSnapshot.current)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[currentSnapshot]);
  const remaining = Math.max(0, marketlyConfig.freeAdsPerCalendarMonth - quotaUsed);
  const duplicate = useMemo(() => existingTitles.some(item => sameTitle(item, title)), [existingTitles, title]);
  const issues = useMemo(() => listingFieldIssues({
    title, description, price, category, location, condition, photoCount: photos.length, duplicate,
  }), [title, description, price, category, location, condition, photos.length, duplicate]);
  const markTouched = (field: ListingFieldName) => setTouched(previous => ({ ...previous, [field]: true }));
  const visibleIssue = (field: ListingFieldName) =>
    attempted || touched[field] || issues[field]?.severity === "warning" ? issues[field] : undefined;
  const currentPhotoIssue = photoError ? { message: photoError, severity: "error" as const } : visibleIssue("photos");
  useEffect(() => () => { for (const url of urlsRef.current) URL.revokeObjectURL(url); }, []);

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    setError(""); setSaved(""); setPhotoError(""); markTouched("photos");
    const next = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (photos.length + next.length > 5) { setPhotoError("Maximum five photos until real paid uploads are available. Remove a photo first."); return; }
    for (const file of next) {
      if (!(marketlyConfig.imageMimeTypes as readonly string[]).includes(file.type) ||
          file.size < 1 || file.size > marketlyConfig.maxImageBytes) {
        setPhotoError("Use JPG, PNG or WEBP photos up to 5 MB each."); return;
      }
    }
    const added: Fresh[] = next.map(file => { const src = URL.createObjectURL(file); urlsRef.current.push(src);
      return { kind: "new", file, id: crypto.randomUUID(), src }; });
    setPhotos(old => [...old, ...added]);
  }
  function removePhoto(id: string) {
    setSaved("");setPhotoError("");setPhotos(old => old.filter(p => p.id !== id));
  }
  function movePhoto(index: number, step: number) {
    const next = index + step; if (next < 0 || next >= photos.length) return;
    setPhotos(old => { const sorted = [...old]; [sorted[index], sorted[next]] = [sorted[next], sorted[index]]; return sorted; });
    setSaved("");
  }
  function draftPayload(): FormData {
    if (!formRef.current) throw new Error("Form not ready");
    const data = new FormData(formRef.current);
    if (draftId) data.set("draft_id", draftId);
    const fresh = photos.filter((p): p is Fresh => p.kind === "new");
    for (const item of fresh) data.append("images", item.file);
    data.set("photo_order", JSON.stringify(photos.map(item => item.kind === "existing" ?
      { kind: "existing", path: item.path } : { kind: "new", index: fresh.findIndex(p => p.id === item.id) })));
    return data;
  }
  async function saveDraft(): Promise<string> {
    if (!canPublish) throw new Error("Sign in to save your draft");
    const res = await fetch("/api/listing-drafts", { method: "POST", body: draftPayload(), credentials: "same-origin" });
    const result: { id?: string; message?: string } = await res.json();
    if (!res.ok || !result.id) throw new Error(result.message || "Draft could not be saved");
    setDraftId(result.id);
    return result.id;
  }
  async function handleSave() {
    if (busy) return;
    setBusy("save");setError("");setSaved("");
    try {
      const id = await saveDraft();
      savedSnapshot.current=currentSnapshot;
      setSaved("Draft saved with selected photos. No posting quota used.");
      router.replace(`/sell/new?draft=${id}`, { scroll: false });router.refresh();
    } catch (e) { setError(userFacingError(e, "save")); }
    finally { setBusy(""); }
  }
  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setError("");setSaved("");setAttempted(true);
    if (!canPublish) {setError("Sign in before posting an ad.");return;}
    if (remaining < 1) {setError("Your three free posting slots are used this month. Real paid slots are not enabled yet.");return;}
    const invalid = firstInvalidListingField(issues);
    if (invalid || photoError) {
      setError("Correct the highlighted field(s) above before submitting.");
      const selector = invalid === "price" ? "marketly-price" : invalid === "photos" ? "photo-picker" : invalid;
      if (selector) formRef.current?.querySelector<HTMLElement>(`#${selector}`)?.focus();
      return;
    }
    setBusy("publish");
    try {
      // Save draft, files and photo order first, then publish in one DB transaction.
      const id = await saveDraft();
      const response = await fetch(`/api/listing-drafts/${id}/publish`, { method: "POST", credentials: "same-origin" });
      const result: { message?: string } = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not submit ad");
      router.push("/dashboard?published=1");router.refresh();
    } catch (e) { setError(userFacingError(e, "save")); }
    finally {setBusy("");}
  }
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <form ref={formRef} onSubmit={handlePublish} noValidate className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Product details</h2>
        {draftId && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">Saved draft</span>}</div>
      <div><label htmlFor="title" className="field-label">What are you selling? *</label><Input id="title" name="title" value={title} onChange={e=>{setTitle(e.target.value);setSaved("");}} onBlur={()=>markTouched("title")}
        aria-invalid={visibleIssue("title")?.severity==="error"} aria-describedby={visibleIssue("title")?"title-feedback":undefined}
        placeholder="e.g. Samsung Galaxy S23 256GB" minLength={5} maxLength={90} required/>
        <ListingFieldFeedback id="title-feedback" issue={visibleIssue("title")}/></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="category" className="field-label">Category *</label><select id="category" name="category" value={category} onChange={e=>setCategory(e.target.value)} onBlur={()=>markTouched("category")}
          aria-invalid={visibleIssue("category")?.severity==="error"} aria-describedby={visibleIssue("category")?"category-feedback":undefined}
          required className="field-control"><option value="" disabled>Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <ListingFieldFeedback id="category-feedback" issue={visibleIssue("category")}/></div>
        <div><label htmlFor="condition" className="field-label">Condition *</label><select id="condition" name="condition" value={condition} onChange={e=>setCondition(e.target.value)} onBlur={()=>markTouched("condition")}
          aria-invalid={visibleIssue("condition")?.severity==="error"} aria-describedby={visibleIssue("condition")?"condition-feedback":undefined}
          required className="field-control"><option value="" disabled>Choose condition</option>{["New","Used","Refurbished"].map(c=><option key={c}>{c}</option>)}</select>
          <ListingFieldFeedback id="condition-feedback" issue={visibleIssue("condition")}/></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><PriceField initialValue={draft?.price_lkr ?? 0} onValueChange={setPrice} onBlur={()=>markTouched("price")} issue={visibleIssue("price")}/><div><label htmlFor="location" className="field-label">District / area *</label><select id="location" name="location" value={location} onChange={e=>setLocation(e.target.value)} onBlur={()=>markTouched("location")}
        aria-invalid={visibleIssue("location")?.severity==="error"} aria-describedby={visibleIssue("location")?"location-feedback":undefined}
        required className="field-control"><option value="" disabled>Select location</option>{locations.map(c=><option key={c}>{c}</option>)}</select>
        <ListingFieldFeedback id="location-feedback" issue={visibleIssue("location")}/></div></div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="is_negotiable" value="true" checked={negotiable} onChange={e=>setNegotiable(e.target.checked)} className="size-4 accent-[#B88746]"/> Price negotiable</label>
      <div><label htmlFor="description" className="field-label">Description *</label><textarea id="description" name="description" value={description} onChange={e=>setDescription(e.target.value)} onBlur={()=>markTouched("description")}
        aria-invalid={visibleIssue("description")?.severity==="error"} aria-describedby={visibleIssue("description")?"description-feedback":undefined}
        className="field-control min-h-[145px]" minLength={20} maxLength={2500} placeholder="Condition, known defects, accessories, pickup and delivery details" required/>
        <ListingFieldFeedback id="description-feedback" issue={visibleIssue("description")}/></div>
      <section className="space-y-3"><div><h3 className="font-bold">Product photos</h3><p className="text-xs text-stone-500">Up to 5 free photos now · Rs.100 for each extra photo after real payments launch · The first image is the cover.</p></div>
        <label htmlFor="photo-picker" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#DCD2C3] bg-[#FBFAF8] p-6 hover:bg-[#F8F3EB]"><ImagePlus className="size-7 text-[#A3722F]"/><strong>Add photos</strong><span className="text-xs text-stone-500">JPG / PNG / WEBP · 5 MB each · {photos.length}/5</span></label>
        <input id="photo-picker" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} className="sr-only" aria-label="Add product photos"
          aria-invalid={currentPhotoIssue?.severity==="error"} aria-describedby={currentPhotoIssue?"photos-feedback":undefined}/>
        <ListingFieldFeedback id="photos-feedback" issue={currentPhotoIssue}/>
        {photos.length>0&&<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo,index)=><div key={photo.id} className="overflow-hidden rounded-xl border border-stone-200 bg-[#FBFAF8]"><div className="relative aspect-square"><Image src={photo.src} alt={`Photo ${index+1}`} fill unoptimized className="object-cover"/>{index===0&&<span className="absolute left-2 top-2 rounded bg-[#B88746] px-2 py-1 text-[10px] font-bold text-white">COVER</span>}</div>
          <div className="flex items-center justify-center gap-1 p-1.5"><button type="button" aria-label={`Move photo ${index+1} left`} onClick={()=>movePhoto(index,-1)} disabled={index===0} className="rounded border p-1.5 disabled:opacity-30"><ArrowUp className="size-4"/></button><button type="button" aria-label={`Move photo ${index+1} right`} onClick={()=>movePhoto(index,1)} disabled={index===photos.length-1} className="rounded border p-1.5 disabled:opacity-30"><ArrowDown className="size-4"/></button><button type="button" aria-label={`Remove photo ${index+1}`} onClick={()=>removePhoto(photo.id)} className="rounded border border-red-200 p-1.5 text-red-700"><Trash2 className="size-4"/></button></div></div>)}</div>}
        <p className="text-xs text-stone-500">Move photos with arrows. Cover photo = first position. Saved drafts keep uploaded photos; published photos use existing Marketly watermarks.</p>
      </section>
      <p className="text-xs text-stone-500">Field warnings appear next to the relevant input. Admin moderation still applies.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{saved}</p>}
      {!canPublish && <p className="text-sm text-amber-900">Please <Link href="/login" className="underline">sign in</Link> to save or submit.</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={handleSave} disabled={!!busy||!canPublish}><Save className="size-4"/>{busy==="save"?"Saving draft...":"Save as draft"}</Button>
        <Button type="button" variant="outline" onClick={()=>setPreview(x=>!x)}><Eye className="size-4"/>{preview?"Close preview":"Preview as buyer"}</Button>
        <Button type="submit" disabled={!!busy||!canPublish||remaining<1} className="flex-1">{busy==="publish"?"Submitting...":"Submit for admin review"}</Button></div>
      <p className="text-xs text-stone-500">Saving a draft never uses a posting credit. On submission, a free credit is used once; resubmitting a rejected ad does not use another.</p>
    </form>
    <aside className="space-y-4">
      <div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Your posting allowance</h3><p className="mt-2 text-3xl font-extrabold">{remaining} <span className="text-sm font-normal text-stone-500">free ads remaining</span></p><p className="mt-2 text-xs text-stone-500">Three free ads each calendar month (Asia/Colombo). Real paid credits remain disabled.</p></div>
      <div className="rounded-2xl bg-[#F8F5EE] p-5"><h3 className="flex items-center gap-2 font-bold"><ShieldAlert className="size-5 text-[#A3722F]"/> Seller safety</h3><p className="mt-2 text-sm text-stone-600">Use genuine photos, disclose defects and never share OTP, card PIN or banking passwords.</p></div>
      {preview&&<section className="overflow-hidden rounded-2xl border bg-white" aria-label="Buyer preview"><div className="bg-[#24272E] p-3 text-xs font-bold text-white">PREVIEW ONLY — not publicly listed</div>
        {photos.length>0&&<div className="relative aspect-[1.5]"><Image src={photos[0].src} alt="Preview cover" fill unoptimized className="object-cover"/></div>}
        <div className="space-y-2 p-4"><h3 className="font-bold">{title||"Your product title"}</h3><p className="text-xl font-bold text-[#A3722F]">Rs. {price.toLocaleString("en-LK")}</p><p className="text-xs text-stone-500">{location||"Location"} · {condition||"Condition"} · {category||"Category"}</p><p className="whitespace-pre-wrap text-sm text-stone-700">{description||"Your description will appear here."}</p>{negotiable&&<p className="text-sm font-semibold">Negotiable</p>}</div>
      </section>}
    </aside>
  </div>;
}
