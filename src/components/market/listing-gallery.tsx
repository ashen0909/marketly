"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from "lucide-react";

type GalleryProps = {
  images: string[];
  title: string;
};

/** Visible for all photos (including older listings uploaded before watermark-on-upload). */
function WatermarkOverlay({ large = false }: { large?: boolean }) {
  return <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
    <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[25deg] whitespace-nowrap font-black uppercase tracking-[.22em] text-white/25 [text-shadow:0_1px_5px_rgba(0,0,0,.3)] ${large ? "text-2xl sm:text-5xl" : "text-2xl sm:text-4xl"}`}>Marketly</span>
    <span className="absolute bottom-3 right-3 rounded-md bg-[#24272E]/65 px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-white/90">Marketly</span>
  </div>;
}

export function ListingGallery({ images, title }: GalleryProps) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const swiped = useRef(false);
  const length = images.length;
  const current = images[active];

  function select(index: number) {
    if (length === 0) return;
    setActive((index + length) % length);
  }
  function swipeStart(event: TouchEvent<HTMLElement>) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
    swiped.current = false;
  }
  function swipeEnd(event: TouchEvent<HTMLElement>) {
    const previousX = touchStartX.current;
    touchStartX.current = null;
    const endingX = event.changedTouches[0]?.clientX;
    if (previousX === null || endingX === undefined) return;
    const delta = endingX - previousX;
    if (Math.abs(delta) > 45) { swiped.current = true; select(active + (delta < 0 ? 1 : -1)); }
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") setActive((i) => (i + 1) % length);
      if (event.key === "ArrowLeft") setActive((i) => (i - 1 + length) % length);
    }
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [open, length]);

  if (length < 1) return <div className="grid aspect-[1.4] place-items-center rounded-2xl border bg-[#F8F6F2] text-stone-400"><ImageOff className="size-8"/><p>No photos available</p></div>;

  return <div className="space-y-3" aria-label={`${title} photos`}>
    <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#E6DED3] bg-[#F8F6F2] sm:aspect-[1.4]" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
      <button type="button" className="relative block size-full cursor-zoom-in" onClick={() => { if (swiped.current) { swiped.current = false; return; } setOpen(true); }} aria-label={`View photo ${active + 1} fullscreen`}>
        <Image src={current} alt={`${title} photo ${active + 1} of ${length}`} fill sizes="(max-width: 1024px) 100vw, 65vw" className="object-contain" unoptimized priority={active === 0}/>

        <span className="absolute right-3 top-3 rounded-full bg-[#24272E]/75 p-2 text-white opacity-90"><Expand className="size-4"/></span>
      </button>
      {length > 1 && <>
        <button type="button" onClick={() => select(active - 1)} aria-label="Previous product photo" className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/95 p-2.5 text-[#24272E] shadow-md hover:bg-white"><ChevronLeft className="size-5"/></button>
        <button type="button" onClick={() => select(active + 1)} aria-label="Next product photo" className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/95 p-2.5 text-[#24272E] shadow-md hover:bg-white"><ChevronRight className="size-5"/></button>
      </>}
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-[#24272E]/80 px-3 py-1 text-xs font-bold text-white">{active + 1} / {length}</span>
    </div>
    {length > 1 && <div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Choose a product photo">
      {images.map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => select(index)} aria-pressed={index === active} aria-label={`Show photo ${index + 1}`} className={`relative aspect-square size-[76px] shrink-0 overflow-hidden rounded-xl border-2 transition sm:size-[92px] ${index === active ? "border-[#A3722F] ring-2 ring-[#D9B781]/40" : "border-[#E7E1D9] hover:border-[#B88746]"}`}>
        <Image src={url} alt="" fill sizes="92px" className="object-cover" unoptimized/>

      </button>)}
    </div>}
    <p className="text-xs text-[#68707C]">Tap a thumbnail to switch photos. Use arrows or swipe left/right; tap the large photo for full screen.</p>

    {open && <div className="fixed inset-0 z-[100] flex flex-col bg-[#111419]/95 p-3 text-white sm:p-6" role="dialog" aria-modal="true" aria-label={`${title} photo viewer`}>
      <div className="mb-3 flex items-center justify-between gap-3"><p className="truncate text-sm font-bold">{title} · {active + 1} / {length}</p><button autoFocus type="button" onClick={() => setOpen(false)} aria-label="Close photo viewer" className="rounded-full bg-white/15 p-2 hover:bg-white/25"><X className="size-5"/></button></div>
      <div className="relative min-h-0 flex-1" onTouchStart={swipeStart} onTouchEnd={swipeEnd}>
        <Image src={current} alt={`${title}, photo ${active + 1}`} fill sizes="100vw" className="object-contain" unoptimized/>
        <WatermarkOverlay large />
        {length > 1 && <>
          <button type="button" onClick={() => select(active - 1)} aria-label="Previous fullscreen photo" className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 hover:bg-white/30"><ChevronLeft className="size-6"/></button>
          <button type="button" onClick={() => select(active + 1)} aria-label="Next fullscreen photo" className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-2 hover:bg-white/30"><ChevronRight className="size-6"/></button>
        </>}
      </div>
      <p className="mt-3 text-center text-xs text-white/60">Swipe to view other photos · Esc to close</p>
    </div>}
  </div>;
}
