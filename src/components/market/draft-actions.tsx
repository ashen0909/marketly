"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {useMarketlyUi} from "@/components/market/marketly-ui-provider";
export function DraftActions({id}:{id:string}) {
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();const {confirm,toast}=useMarketlyUi();
 async function remove() {
  if(!await confirm({title:"Delete unfinished draft?",description:"The draft and its stored photos will be removed. This cannot be undone.",confirmLabel:"Delete draft",destructive:true}))return;
  setBusy(true);setError("");try{
   const res=await fetch(`/api/listing-drafts/${id}`,{method:"DELETE"});const data=await res.json();
   if(!res.ok)throw new Error(data.message||"Unable to delete draft");toast("Draft deleted","success");router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to delete draft");}finally{setBusy(false);}
 }
 return <div className="flex flex-wrap items-center gap-2">
  <Link href={`/sell/new?draft=${id}`} className="rounded-lg bg-[#B88746] px-3 py-2 text-sm font-bold text-white">Continue editing</Link>
  <button type="button" onClick={remove} disabled={busy} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-800 disabled:opacity-50">{busy?"Deleting...":"Delete draft"}</button>
  {error&&<p role="alert" className="w-full text-xs text-red-700">{error}</p>}
 </div>;
}
