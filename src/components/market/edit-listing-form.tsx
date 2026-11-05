"use client";
import {useEffect,useRef,useState,type FormEvent,type ChangeEvent} from "react";
import {useRouter} from "next/navigation";
import Image from "next/image";
import {ArrowLeft,ArrowRight,Eye,Save,Trash2} from "lucide-react";
import {categories,locations,type Listing} from "@/data/catalog";
import {PriceField} from "@/components/market/price-field";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {firstInvalidListingField,listingFieldIssues,sameTitle,type ListingFieldName} from "@/lib/listing-quality";
import {ListingFieldFeedback} from "@/components/market/listing-field-feedback";
import {publicListingImageUrl} from "@/lib/listing-drafts";

type OldPhoto={storage_path:string;preview_storage_path:string|null};
export function EditListingForm({listing,oldPhotos,existingTitles=[]}:{listing:Listing;oldPhotos:OldPhoto[];existingTitles?:string[]}){
 const router=useRouter();const [files,setFiles]=useState<File[]>([]);
 const savedSnapshot=useRef("");
 const formRef=useRef<HTMLFormElement>(null);
 const [attempted,setAttempted]=useState(false);
 const [touched,setTouched]=useState<Partial<Record<ListingFieldName,boolean>>>({});
 const [photoError,setPhotoError]=useState("");
 const [photos,setPhotos]=useState(oldPhotos);
 const [error,setError]=useState("");const [saved,setSaved]=useState("");const [busy,setBusy]=useState("");
 const [preview,setPreview]=useState(false);
 const [title,setTitle]=useState(listing.title);const [description,setDescription]=useState(listing.description);
 const [price,setPrice]=useState(listing.price_lkr);
 const [location,setLocation]=useState(listing.location);const [category,setCategory]=useState(listing.category);
 const [condition,setCondition]=useState(listing.condition);
 const currentSnapshot=JSON.stringify({title,description,price,location,category,condition,photos:photos.map(p=>p.storage_path),files:files.map(f=>f.name+":"+f.size)});
 useEffect(()=>{
   if(!savedSnapshot.current){savedSnapshot.current=currentSnapshot;return;}
   if(savedSnapshot.current===currentSnapshot)return;
   const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
   window.addEventListener("beforeunload",warn);
   return ()=>window.removeEventListener("beforeunload",warn);
 },[currentSnapshot]);
 const duplicate=existingTitles.some(t=>sameTitle(t,title));
 const photoChanged=JSON.stringify(photos.map(p=>p.storage_path))!==JSON.stringify(oldPhotos.map(p=>p.storage_path));
 const issues=listingFieldIssues({title,description,price,category,condition,location,photoCount:files.length||photos.length,duplicate});
 const markTouched=(field:ListingFieldName)=>setTouched(old=>({...old,[field]:true}));
 const visibleIssue=(field:ListingFieldName)=>attempted||touched[field]||issues[field]?.severity==="warning"?issues[field]:undefined;
 const currentPhotoIssue=photoError?{message:photoError,severity:"error" as const}:visibleIssue("photos");
 function selectFiles(e:ChangeEvent<HTMLInputElement>){setError("");setPhotoError("");markTouched("photos");const selected=Array.from(e.target.files||[]);e.target.value="";
  if(selected.length>5||selected.some(f=>!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size>5*1024*1024||f.size<1)){
   setPhotoError("Choose 1–5 JPG/PNG/WEBP replacement photos, each no larger than 5 MB.");return;
  }setFiles(selected);
 }
 function move(index:number,step:number){const other=index+step;if(other<0||other>=photos.length)return;
  setPhotos(current=>{const copy=[...current];[copy[index],copy[other]]=[copy[other],copy[index]];return copy;});setSaved("");}
 async function savePhotoOrder(){if(!photos.length){markTouched("photos");setPhotoError("Keep at least one photo.");return;}
  setBusy("photos");setError("");setSaved("");try{
   const response=await fetch(`/api/listings/${listing.id}/photos`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({paths:photos.map(p=>p.storage_path)})});
   const result:{message?:string;reviewRequired?:boolean}=await response.json();if(!response.ok)throw new Error(result.message||"Unable to save photo order");
   savedSnapshot.current=currentSnapshot;setSaved(result.reviewRequired?"Photos updated. Ad sent for admin review.":"Cover and photo order saved.");router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Photo save failed");}finally{setBusy("");}}
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setAttempted(true);
  const invalid=firstInvalidListingField(issues);
  if(invalid||photoError){
   setError("Correct the highlighted field(s) above before resubmitting.");
   const selector=invalid==="price"?"marketly-price":invalid==="photos"?"replacement-photos":invalid?`edit-${invalid}`:undefined;
   if(selector)formRef.current?.querySelector<HTMLElement>(`#${selector}`)?.focus();
   return;
  }
  setBusy("details");setError("");setSaved("");try{
   const data=new FormData(e.currentTarget);files.forEach(f=>data.append("images",f));
   const res=await fetch(`/api/listings/${listing.id}`,{method:"PATCH",body:data});const result=await res.json();
   if(!res.ok)throw new Error(result.message||"Could not edit ad");router.push("/dashboard?status=pending");router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unexpected error");}finally{setBusy("");}}
 return <div className="mx-auto max-w-3xl space-y-5">
  {listing.moderation_status==="rejected"&&<div className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-bold text-red-900">Admin requested changes</h2><p className="mt-2 text-sm text-red-800">{listing.moderation_note||"Review your details and correct the advertisement."}</p><p className="mt-2 text-xs text-red-700">Editing and resubmitting this ad does not consume a new posting slot.</p></div>}
  <form ref={formRef} onSubmit={submit} noValidate className="space-y-5 rounded-2xl border bg-white p-6">
   <div><label className="field-label" htmlFor="edit-title">Title</label><Input id="edit-title" name="title" value={title} onChange={e=>setTitle(e.target.value)} onBlur={()=>markTouched("title")}
    aria-invalid={visibleIssue("title")?.severity==="error"} aria-describedby={visibleIssue("title")?"edit-title-feedback":undefined}
    minLength={5} maxLength={90} required/>
    <ListingFieldFeedback id="edit-title-feedback" issue={visibleIssue("title")}/></div>
   <div className="grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="edit-category">Category</label><select id="edit-category" name="category" value={category} onChange={e=>setCategory(e.target.value)} onBlur={()=>markTouched("category")}
     aria-invalid={visibleIssue("category")?.severity==="error"} aria-describedby={visibleIssue("category")?"edit-category-feedback":undefined}
     className="field-control">{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><ListingFieldFeedback id="edit-category-feedback" issue={visibleIssue("category")}/></div>
    <div><label className="field-label" htmlFor="edit-condition">Condition</label><select id="edit-condition" name="condition" value={condition} onChange={e=>setCondition(e.target.value as Listing["condition"])} onBlur={()=>markTouched("condition")}
     aria-invalid={visibleIssue("condition")?.severity==="error"} aria-describedby={visibleIssue("condition")?"edit-condition-feedback":undefined}
     className="field-control">{["New","Used","Refurbished"].map(c=><option key={c}>{c}</option>)}</select><ListingFieldFeedback id="edit-condition-feedback" issue={visibleIssue("condition")}/></div></div>
   <div className="grid gap-4 sm:grid-cols-2"><PriceField initialValue={listing.price_lkr} onValueChange={setPrice} onBlur={()=>markTouched("price")} issue={visibleIssue("price")}/><div><label className="field-label" htmlFor="edit-location">Location</label><select id="edit-location" name="location" value={location} onChange={e=>setLocation(e.target.value)} onBlur={()=>markTouched("location")}
     aria-invalid={visibleIssue("location")?.severity==="error"} aria-describedby={visibleIssue("location")?"edit-location-feedback":undefined}
     className="field-control">{locations.map(c=><option key={c}>{c}</option>)}</select><ListingFieldFeedback id="edit-location-feedback" issue={visibleIssue("location")}/></div></div>
   <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="is_negotiable" value="true" defaultChecked={!!listing.is_negotiable} className="size-4 accent-[#B88746]"/>Price negotiable</label>
   <div><label className="field-label" htmlFor="edit-description">Description</label><textarea id="edit-description" name="description" value={description} onChange={e=>setDescription(e.target.value)} onBlur={()=>markTouched("description")}
    aria-invalid={visibleIssue("description")?.severity==="error"} aria-describedby={visibleIssue("description")?"edit-description-feedback":undefined}
    minLength={20} maxLength={2500} required className="field-control min-h-36"/><ListingFieldFeedback id="edit-description-feedback" issue={visibleIssue("description")}/></div>
   <section className="space-y-3"><h2 className="font-bold">Current photos · choose the cover</h2><p className="text-xs text-stone-600">Move photos left/right. The FIRST image becomes the listing thumbnail. Remove unwanted photos, then click Save photo changes below.</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{photos.map((photo,i)=><div key={photo.storage_path} className="overflow-hidden rounded-xl border"><div className="relative aspect-square"><Image src={publicListingImageUrl(photo.preview_storage_path||photo.storage_path)} alt={`Photo ${i+1}`} fill unoptimized className="object-cover"/>{i===0&&<span className="absolute left-1 top-1 rounded bg-[#B88746] px-2 py-1 text-[10px] font-bold text-white">COVER</span>}</div>
     <div className="flex justify-center gap-2 p-2"><button type="button" aria-label={`Move photo ${i+1} left`} disabled={i===0} onClick={()=>move(i,-1)} className="rounded border p-1.5 disabled:opacity-30"><ArrowLeft className="size-4"/></button><button type="button" aria-label={`Move photo ${i+1} right`} disabled={i===photos.length-1} onClick={()=>move(i,1)} className="rounded border p-1.5 disabled:opacity-30"><ArrowRight className="size-4"/></button><button type="button" aria-label={`Remove photo ${i+1}`} disabled={photos.length===1} onClick={()=>{setPhotos(x=>x.filter(p=>p.storage_path!==photo.storage_path));setSaved("");}} className="rounded border border-red-200 p-1.5 text-red-700 disabled:opacity-30"><Trash2 className="size-4"/></button></div></div>)}</div>
    <Button type="button" variant="outline" onClick={savePhotoOrder} disabled={!!busy||!photoChanged||photos.length<1}><Save className="size-4"/>{busy==="photos"?"Saving photos...":"Save cover / photo changes"}</Button>
    {photoChanged&&<p className="text-xs text-amber-800">Unsaved photo changes. Removing an existing photo sends the ad for admin re-review; reordering alone does not.</p>}
    <div><label className="field-label mt-4 block" htmlFor="replacement-photos">Or replace ALL photos (optional)</label><input id="replacement-photos" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectFiles} className="w-full text-sm"
     aria-invalid={currentPhotoIssue?.severity==="error"} aria-describedby={currentPhotoIssue?"edit-photos-feedback":undefined}/>
     <ListingFieldFeedback id="edit-photos-feedback" issue={currentPhotoIssue}/><p className="mt-2 text-xs text-stone-500">Leave empty to keep photos. Upload 1–5 replacement photos when you save listing details. Additional paid photos are not enabled yet.</p>{files.length>0&&<p className="mt-2 text-xs font-semibold">{files.length} replacement photo(s) selected.</p>}</div>
   </section>
   <p className="text-xs text-stone-500">Any listing-quality warnings appear beside the relevant field.</p>
   <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Saving details sends this advertisement to Pending Review. Sold items remain Sold until you manually Relist and get admin approval.</p>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{saved&&<p role="status" className="text-sm text-emerald-700">{saved}</p>}
   <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>setPreview(x=>!x)}><Eye className="size-4"/>{preview?"Close preview":"Preview"}</Button><Button type="submit" disabled={!!busy} className="flex-1">{busy==="details"?"Saving...":listing.moderation_status==="rejected"?"Fix and resubmit for review":"Save changes for review"}</Button></div>
  </form>
  {preview&&<div className="rounded-2xl border bg-white p-5"><p className="font-bold text-amber-800">PREVIEW ONLY</p><h3 className="mt-2 text-xl font-bold">{title}</h3><p className="text-lg font-extrabold text-[#A3722F]">Rs. {price.toLocaleString("en-LK")}</p><p className="text-xs text-stone-500">{category} · {location} · {condition}</p><p className="mt-3 whitespace-pre-wrap text-sm">{description}</p></div>}
 </div>;
}
