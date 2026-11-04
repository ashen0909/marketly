"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();const [busy,setBusy] = useState(false);
  return <Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await createBrowserSupabase().auth.signOut();router.push("/");router.refresh();}finally{setBusy(false);}}}>{busy?"Signing out...":"Sign out"}</Button>;
}
export function SellerListingActions({listingId,status,moderationStatus}:{listingId:string;status:string;moderationStatus?:string}) {
  const [busy,setBusy]=useState("");const [error,setError]=useState("");const router=useRouter();
  async function update(action:"sold"|"pause"|"relist"|"delete"){
    if(action==="relist"&&!window.confirm("Relisting sends this ad to admin review. Continue?"))return;
    if(action==="delete"&&!window.confirm("Delete this ad from Marketly? It will disappear from public search. Chat and posting records are retained for safety and support. This cannot be undone from your dashboard."))return;
    setBusy(action);setError("");
    try {const response=await fetch(`/api/listings/${listingId}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:action})});
      const json=await response.json();if(!response.ok)throw new Error(json.message||"Update failed");router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Update failed");}finally{setBusy("");}
  }
  return <div className="flex flex-wrap items-center gap-2">
    {status!=="deleted"&&<Link className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-stone-50" href={`/sell/${listingId}/edit`}>Edit</Link>}
    {status==="active" ? <>
      {moderationStatus==="approved"&&<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>update("sold")}>{busy==="sold"?"Saving...":"Mark Sold"}</Button>}
      <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>update("pause")}>Pause</Button>
    </> : status!=="deleted"?<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>update("relist")}>{busy==="relist"?"Saving...":"Relist for review"}</Button>:null}
    {status!=="deleted"&&<Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={!!busy} onClick={()=>update("delete")}>{busy==="delete"?"Deleting...":"Delete ad"}</Button>}
    {error&&<p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </div>;
}
