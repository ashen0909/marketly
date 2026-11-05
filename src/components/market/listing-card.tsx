import Image from "next/image";
import Link from "next/link";
import { MapPin, ImageOff } from "lucide-react";
import type { Listing } from "@/data/catalog";
import { formatLkr } from "@/lib/config";
import { FavoriteButton } from "@/components/market/favorite-button";
import { listingDetailHref } from "@/lib/listing-return";

export function ListingCard({ listing, showFavorite = true, returnTo }: { listing: Listing; showFavorite?: boolean; returnTo?: string }) {
  return <div className="marketly-card-motion group relative overflow-hidden rounded-2xl border border-[#ECE8E3] bg-white shadow-[0_6px_15px_rgba(0,0,0,.04)] transition hover:-translate-y-1 hover:shadow-lg">
    <Link href={listingDetailHref(listing.id, returnTo)} className="block" aria-label={`View ${listing.title}`}>
    <div className="relative aspect-[1.5] overflow-hidden bg-[#F5F2EE]">
      {(listing.preview_urls?.[0] || listing.image_urls[0]) ? <Image src={listing.preview_urls?.[0] || listing.image_urls[0]} alt={listing.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" loading="lazy" unoptimized/> : <div className="grid size-full place-items-center text-stone-400"><ImageOff aria-hidden="true" /></div>}

      {listing.sample && <span className="absolute left-3 top-3 rounded-full bg-[#24272E]/90 px-2.5 py-1 text-[11px] font-medium text-white">Sample listing</span>}
    </div>
    <div className="space-y-1.5 px-4 py-3.5">
      <p className="truncate font-semibold text-[#24272E]">{listing.title}</p>
      <p className="text-lg font-bold text-[#A3722F]">{formatLkr(listing.price_lkr)}</p>{listing.is_negotiable && <p className="text-xs font-semibold text-emerald-700">Negotiable</p>}
      <div className="flex items-center gap-1.5 text-xs text-[#68707C]"><MapPin className="size-3.5" /> {listing.location} <span className="px-1">·</span> {listing.condition}</div>
    </div>
    </Link>
    {showFavorite && <div className="absolute right-3 top-3 z-10"><FavoriteButton listingId={listing.id} compact disabled={!!listing.sample} /></div>}
  </div>;
}
