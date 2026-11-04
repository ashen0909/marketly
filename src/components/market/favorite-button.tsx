"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/components/market/favorites-provider";

export function FavoriteButton({ listingId, compact = false, disabled = false }: { listingId: string; compact?: boolean; disabled?: boolean }) {
  const { favorites, busyId, toggle } = useFavorites();
  const saved = favorites.has(listingId);
  return <button
    type="button" disabled={disabled || busyId === listingId}
    aria-label={saved ? "Remove from saved items" : "Save item"}
    aria-pressed={saved}
    title={saved ? "Remove from favorites" : "Save to favorites"}
    onClick={(event) => { event.stopPropagation(); void toggle(listingId); }}
    className={compact ? "grid size-10 place-items-center rounded-full bg-white/95 text-[#24272E] shadow-md hover:bg-[#FFF2D8] disabled:opacity-50" : "inline-flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 font-semibold hover:bg-stone-50 disabled:opacity-50"}>
    <Heart className={`size-5 ${saved ? "fill-rose-500 text-rose-500" : "text-[#AA782C]"}`} />
    {!compact && <span>{saved ? "Saved" : "Save"}</span>}
  </button>;
}
