"use client";

import Link from "next/link";
import { ChevronDown, Heart, LayoutDashboard, LogOut, MessageCircle, Settings, UserRound, CreditCard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type AccountMenuProps = { displayName: string; email: string };
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "M";
}

export function AccountMenu({ displayName, email }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function onOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function onFocus(event: FocusEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onOutside);document.removeEventListener("focusin", onFocus);document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function signOut() {
    setBusy(true);setError("");
    try {
      const { error: authError } = await createBrowserSupabase().auth.signOut();
      if (authError) throw authError;
      setOpen(false);router.replace("/");router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not sign out."); }
    finally { setBusy(false); }
  }
  const itemClass = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-[#F8F5EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B88746]";
  const close = () => setOpen(false);
  return <div className="relative" ref={root} data-testid="account-menu">
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="true" aria-label={`Account menu for ${displayName}`}
      className="flex max-w-[100px] items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1.5 pl-1.5 pr-2.5 text-sm hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D0A352] sm:max-w-40">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#D0A352] text-xs font-extrabold text-[#24272E]" aria-hidden="true">{initials(displayName)}</span>
      <span className="hidden min-w-0 truncate font-semibold min-[470px]:inline">{displayName}</span>
      <ChevronDown className={`size-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#EAE2D8] bg-white p-2 text-[#24272E] shadow-[0_14px_50px_rgba(0,0,0,.22)]">
      <div className="border-b border-stone-100 px-3 py-3"><p className="truncate text-sm font-bold">{displayName}</p><p className="truncate text-xs text-[#68707C]">{email}</p></div>
      <Link onClick={close} href="/profile" className={itemClass}><UserRound className="size-4"/>My profile</Link>
      <Link onClick={close} href="/profile" className={itemClass}><Settings className="size-4"/>Profile settings</Link>
      <Link onClick={close} href="/dashboard" className={itemClass}><LayoutDashboard className="size-4"/>My ads / Dashboard</Link>
      <Link onClick={close} href="/billing" className={itemClass}><CreditCard className="size-4"/>Test checkout / Billing</Link>
      <Link onClick={close} href="/messages" className={itemClass}><MessageCircle className="size-4"/>Messages / Offers</Link>
      <Link onClick={close} href="/favorites" className={itemClass}><Heart className="size-4"/>Saved items</Link>
      <button type="button" disabled={busy} onClick={signOut} className={`${itemClass} w-full text-left text-red-700 hover:bg-red-50 disabled:opacity-50`}><LogOut className="size-4"/>{busy ? "Signing out..." : "Sign out"}</button>
      {error && <p className="px-3 pb-2 text-xs text-red-700" role="alert">{error}</p>}
    </div>}
  </div>;
}
