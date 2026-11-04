"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase, hasSupabaseConfig } from "@/lib/supabase/browser";

type FavoritesContextValue = {
  favorites: ReadonlySet<string>;
  signedIn: boolean;
  busyId: string | null;
  toggle: (listingId: string) => Promise<void>;
  refresh: () => Promise<void>;
};
const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    setSignedIn(!!user);
    if (!user) { setFavorites(new Set()); return; }
    const { data, error } = await supabase.from("favorites").select("listing_id").eq("user_id", user.id).limit(1000);
    if (!error) setFavorites(new Set((data ?? []).map((row) => String(row.listing_id))));
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    const supabase = createBrowserSupabase();
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { setFavorites(new Set()); setSignedIn(false); }
      if (event === "SIGNED_IN") { queueMicrotask(() => { void refresh(); }); }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const toggle = useCallback(async (listingId: string) => {
    if (!hasSupabaseConfig()) return;
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`); return; }
    setBusyId(listingId);
    try {
      const { data, error } = await createBrowserSupabase().rpc("toggle_favorite", { p_listing_id: listingId });
      if (error) throw error;
      setFavorites((previous) => {
        const next = new Set(previous);
        if (data === true) next.add(listingId); else next.delete(listingId);
        return next;
      });
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not save this listing.");
    } finally { setBusyId(null); }
  }, [router, signedIn]);

  const value = useMemo(() => ({ favorites, signedIn, busyId, toggle, refresh }), [favorites, signedIn, busyId, toggle, refresh]);
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("FavoritesProvider is missing");
  return value;
}
