"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
/** Passive connectivity hint; database requests still enforce real server errors. */
export function ConnectivityNotice() {
 const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const refresh=()=>setOffline(!navigator.onLine);
  refresh();window.addEventListener("online",refresh);window.addEventListener("offline",refresh);
  return ()=>{window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh);};
 },[]);
 if(!offline)return null;
 return <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950"><WifiOff className="size-4"/> You are offline. Saved changes and messages may need retrying when connected.</div>;
}
