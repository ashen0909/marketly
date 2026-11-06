"use client";
/* eslint-disable @next/next/no-img-element -- Short-lived, private signed NIC links must not be proxied or cached by the optimizer. */
import { useState } from "react";
import { Eye, X, ZoomIn, ZoomOut } from "lucide-react";
const titles = ["NIC front", "NIC back", "Selfie holding NIC"];
export function DocumentCompare({ evidence }: { evidence: (string | null)[] }) {
 const [selected, setSelected] = useState<number | null>(null);
 const [zoom, setZoom] = useState(1);
 return <div className="space-y-3">
  <div className="grid gap-3 sm:grid-cols-3">{titles.map((title, i)=><div key={title} className="rounded-xl border bg-[#F7F2EA] p-2">
   <p className="mb-2 text-center text-xs font-bold">{title}</p>
   {evidence[i]?<button type="button" onClick={()=>{setSelected(i);setZoom(1);}} className="w-full focus-visible:outline-2 focus-visible:outline-amber-700"><img alt={`Restricted preview: ${title}`} src={evidence[i]!} referrerPolicy="no-referrer" className="h-44 w-full rounded-lg bg-white object-contain"/><span className="mt-2 flex items-center justify-center gap-1 text-xs font-bold text-[#8E6428]"><Eye className="size-4"/>Inspect / compare</span></button>:<p className="grid h-44 place-items-center rounded-lg border bg-white text-center text-xs text-red-700">Image unavailable</p>}
  </div>)}</div>
  {selected!==null&&<div role="dialog" aria-modal="true" aria-label="Restricted identity image comparison" className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3 text-white sm:p-8">
   <div className="mb-3 flex flex-wrap items-center gap-2"><strong className="mr-auto">Private comparison · {titles[selected]}</strong><button type="button" aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(1,z-.5))} className="rounded-lg border p-2"><ZoomOut className="size-4"/></button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(4,z+.5))} className="rounded-lg border p-2"><ZoomIn className="size-4"/></button><button type="button" onClick={()=>setSelected(null)} aria-label="Close comparison" className="rounded-lg border p-2"><X className="size-4"/></button></div>
   <div className="grid min-h-0 flex-1 gap-3 overflow-auto md:grid-cols-2">{[selected,selected===2?0:2].map((i,k)=><div key={k} className="min-h-64 overflow-auto rounded-xl border border-white/20 bg-neutral-900 p-3 text-center"><p className="mb-2 text-sm font-bold">{titles[i]}</p>{evidence[i]?<img src={evidence[i]!} alt={titles[i]} referrerPolicy="no-referrer" style={{width:`${zoom*100}%`,maxWidth:"none"}} className="mx-auto h-auto object-contain"/>:<p>Image unavailable</p>}</div>)}</div>
   <p className="mt-3 text-xs text-white/70">Temporary private links expire. Close the preview and reload the page when needed. Do not share screenshots.</p>
  </div>}
 </div>;
}
