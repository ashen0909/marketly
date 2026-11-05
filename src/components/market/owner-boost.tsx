"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { userFacingError } from "@/lib/user-facing-error";
import { useMarketlyUi } from "@/components/market/marketly-ui-provider";
import { Zap } from "lucide-react";
export function OwnerBoost({listingId}:{listingId:string}){
 const {toast,confirm}=useMarketlyUi();const router=useRouter();const [days,setDays]=useState<7|14|30>(7);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function apply(){if(busy)return;
  if(!await confirm({title:`Promote your listing for ${days} days?`,description:"Owner benefit: this promotion is free, recorded in the admin audit log, and labelled Promoted in search results.",confirmLabel:"Apply free promotion"}))return;
  setBusy(true);setError("");try{const {error}=await createBrowserSupabase().rpc("marketly_owner_boost_listing",{p_listing_id:listingId,p_days:days});if(error)throw error;toast("Owner promotion activated","success");router.refresh();}catch(e){setError(userFacingError(e,"general"));}finally{setBusy(false);}
 }
 return <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#D8BD89] bg-[#FFFBF3] p-3 text-sm"><Zap className="size-4 text-[#A3722F]"/><label htmlFor={`boost-${listingId}`} className="text-xs font-bold">Owner free boost</label><select id={`boost-${listingId}`} className="rounded-lg border bg-white p-1.5 text-xs" value={days} onChange={e=>setDays(Number(e.target.value) as 7|14|30)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select><button type="button" onClick={()=>void apply()} disabled={busy} className="rounded-lg bg-[#24272E] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy?"Applying...":"Promote free"}</button>{error&&<p role="alert" className="w-full text-xs text-red-700">{error}</p>}</div>;
}
