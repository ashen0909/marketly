"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CheckCircle2 } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { notificationRoute, type MarketlyNotice } from "@/lib/notification-route";

type Notification = MarketlyNotice & { id:string;title:string;created_at:string;read_at:string|null };
export function NotificationsList({initial}:{initial:Notification[]}) {
 const [items,setItems]=useState(initial);const [opening,setOpening]=useState<string|null>(null);
 const router=useRouter();
 async function open(item:Notification) {
  if(opening)return;setOpening(item.id);
  const dest=notificationRoute(item);
  if(!item.read_at){
   const {error}=await createBrowserSupabase().rpc("mark_notifications_read",{p_ids:[item.id]});
   if(!error){const now=new Date().toISOString();setItems(list=>list.map(n=>n.id===item.id?{...n,read_at:now}:n));window.dispatchEvent(new Event("marketly:notifications-updated"));}
  }
  router.push(dest);
  setOpening(null);
 }
 return <section className="space-y-3" aria-label="Notification list">{!items.length?<p className="rounded-2xl border p-10 text-center text-stone-500">No notifications yet.</p>:
 items.map(item=><button key={item.id} type="button" disabled={!!opening} onClick={()=>void open(item)} className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-[#C8A265] hover:bg-[#FFFCF6] focus-visible:outline-2 focus-visible:outline-[#D0A352] disabled:opacity-60 ${item.read_at?"bg-white":"border-[#DFC59A] bg-[#FFFBF4]"}`}>
   <span className="rounded-xl bg-[#F9F0E2] p-2"><Bell className="size-5 text-[#A57936]"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs text-stone-500">{new Date(item.created_at).toLocaleString("en-LK")}</span><span className="mt-2 block text-xs font-semibold text-[#85602A]">{opening===item.id?"Opening related details...":"Open related details"}</span></span>
   {item.read_at?<CheckCircle2 className="mt-1 size-4 shrink-0 text-stone-400"/>:<span className="mt-1 size-2 shrink-0 rounded-full bg-[#C69442]"/>}<ArrowRight className="mt-1 size-4 shrink-0 text-stone-400"/>
 </button>)}</section>;
}
