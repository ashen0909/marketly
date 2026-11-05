"use client";
import { useState } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useMarketlyUi } from "@/components/market/marketly-ui-provider";

export function SignOutButton() {
  const router = useRouter();const [busy,setBusy] = useState(false);
  return <Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await createBrowserSupabase().auth.signOut();router.push("/");router.refresh();}finally{setBusy(false);}}}>{busy?"Signing out...":"Sign out"}</Button>;
}
export function SellerListingActions({listingId,status,moderationStatus}:{listingId:string;status:string;moderationStatus?:string}) {
  const [busy,setBusy]=useState("");const [error,setError]=useState("");const router=useRouter();const {confirm,toast}=useMarketlyUi();
  async function update(action:"sold"|"pause"|"relist"|"delete"){
    if(action==="relist"&&!await confirm({title:"Relist advertisement?",description:"This ad will return to Pending Review. Chat stays locked until admin approval.",confirmLabel:"Send for review"}))return;
    if(action==="delete"&&!await confirm({title:"Delete advertisement?",description:"The ad will disappear from public listings. Chat and posting records are retained. This cannot be undone from your dashboard.",confirmLabel:"Delete ad",destructive:true}))return;
    setBusy(action);setError("");
    try {const response=await fetch(`/api/listings/${listingId}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:action})});
      const json=await response.json();if(!response.ok)throw new Error(userFacingError(json.message, "save"));toast(action==="sold"?"Ad marked sold; chats are now locked":action==="delete"?"Ad removed from public listings":action==="pause"?"Ad paused":"Ad sent for review","success");router.refresh();
    }catch(e){setError(userFacingError(e, "save"));}finally{setBusy("");}
  }
  return <div className="flex flex-wrap items-center gap-2">
    {status!=="deleted"&&<Link className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-stone-50" href={`/sell/${listingId}/edit`}>{moderationStatus==="rejected"?"Fix & resubmit":"Edit"}</Link>}
    {status==="active" ? <>
      {moderationStatus==="approved"&&<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>update("sold")}>{busy==="sold"?"Saving...":"Mark Sold"}</Button>}
      <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>update("pause")}>Pause</Button>
    </> : status!=="deleted"?<Button size="sm" variant="outline" disabled={!!busy} onClick={()=>update("relist")}>{busy==="relist"?"Saving...":"Relist for review"}</Button>:null}
    {status!=="deleted"&&<Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={!!busy} onClick={()=>update("delete")}>{busy==="delete"?"Deleting...":"Delete ad"}</Button>}
    {error&&<p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </div>;
}
