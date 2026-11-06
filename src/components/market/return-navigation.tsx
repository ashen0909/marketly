"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { safeListingReturn } from "@/lib/listing-return";

const BROWSE_KEY = "marketly:recent-browse";
const POSITION_KEY = "marketly:recent-browse-scroll";
const RESTORE_KEY = "marketly:restore-browse";
const DETAIL_SOURCE_KEY = "marketly:listing-return";

function safePath(path: string | null): string | null {
  if (!path || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) return null;
  if (!/^(?:\/$|\/(?:listings|favorites|dashboard|sellers|messages)(?:[/?]|$))/.test(path)) return null;
  return path;
}
function savedBrowse(): string {
  try {
    const value = sessionStorage.getItem(BROWSE_KEY);
    return value && /^\/listings(?:\?|$)/.test(value) && safePath(value) ? value : "/listings";
  } catch { return "/listings"; }
}

function MemoryTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const previous = useRef<string>("");
  useEffect(() => {
    const path = pathname + (query ? `?${query}` : "");
    const previousPath = previous.current;
    // This is the route the shopper actually came from (home, saved ads,
    // search filters, seller page, etc.) instead of always resetting to browse.
    if (/^\/listings\/[^/]+$/.test(pathname)) {
      try {
        if (previousPath && previousPath !== path && safePath(previousPath)) sessionStorage.setItem(DETAIL_SOURCE_KEY, previousPath);
        else sessionStorage.removeItem(DETAIL_SOURCE_KEY); // Direct links should not reuse a stale previous location.
      } catch { /* storage blocked */ }
    }
    previous.current = path;
    if (pathname !== "/listings") return;
    try {
      sessionStorage.setItem(BROWSE_KEY, path);
      const restored = sessionStorage.getItem(RESTORE_KEY) === path;
      sessionStorage.removeItem(RESTORE_KEY);
      if (restored) {
        const y = Number(sessionStorage.getItem(POSITION_KEY) || 0);
        if (Number.isFinite(y) && y > 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
      }
      let frame = 0;
      const track = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          sessionStorage.setItem(POSITION_KEY, String(Math.max(0, window.scrollY)));
        });
      };
      window.addEventListener("scroll", track, { passive: true });
      return () => { window.removeEventListener("scroll", track); if (frame) cancelAnimationFrame(frame); };
    } catch { /* storage can be unavailable */ }
  }, [pathname, query]);
  return null;
}

/** Search-parameter-aware tracker, isolated in Suspense for Next.js static pages. */
export function BrowsePositionMemory() {
  return <Suspense fallback={null}><MemoryTracker /></Suspense>;
}

export function BackToBrowse({ isOwner = false, returnTo = null }: { isOwner?: boolean; returnTo?: string | null }) {
  const explicit = safeListingReturn(returnTo);
  const [href, setHref] = useState(explicit ?? (isOwner ? "/dashboard" : "/listings"));
  useEffect(() => {
    let active = true;
    // Explicit ?from wins; fall back to remembered navigation when available.
    let next = explicit ?? (isOwner ? "/dashboard" : "/listings");
    if (!explicit) {
      try {
        const previous = safePath(sessionStorage.getItem(DETAIL_SOURCE_KEY));
        next = previous ?? (isOwner ? "/dashboard" : savedBrowse());
      } catch { /* session storage blocked */ }
    }
    queueMicrotask(() => { if (active) setHref(next); });
    return () => { active = false; };
  }, [explicit, isOwner]);
  const label = href.startsWith("/dashboard") ? "Back to my ads" :
    href.startsWith("/favorites") ? "Back to saved items" :
    href.startsWith("/sellers") ? "Back to seller" :
    href.startsWith("/messages") ? "Back to chats" : href === "/" ? "Back to home" : "Back to results";
  return <Link href={href} onClick={() => {
    if (href.startsWith("/listings") && !href.startsWith("/listings/")) {
      try { sessionStorage.setItem(RESTORE_KEY, href); } catch { /* no-op */ }
    }
  }} className="marketly-back-link inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D8B77C] bg-[#FFFAEF] px-4 py-2 text-sm font-bold text-[#65461B] shadow-sm hover:border-[#B88746] hover:bg-[#FFF3D9] focus-visible:outline-offset-2">
    <ArrowLeft className="size-4" aria-hidden="true" />{label}
  </Link>;
}

/** Context-aware back navigation on account and billing pages. */
export function GoBackLink({ fallback = "/dashboard", label = "Go back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return <button type="button" onClick={() => {
    const referrer = document.referrer;
    if (referrer && new URL(referrer).origin === window.location.origin && window.history.length > 1) router.back();
    else router.push(fallback);
  }} className="marketly-back-link inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E9DFCE] bg-white px-4 py-2 text-sm font-semibold text-[#795825] hover:bg-[#FFFAF1]">
    <ArrowLeft className="size-4" aria-hidden="true" />{label}
  </button>;
}
