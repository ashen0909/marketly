import { sampleListings, type Listing } from "@/data/catalog";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export type ListingFilters = { q?: string; category?: string; location?: string };

type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };
type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

// Keep the main listing request independent of PostgREST relationship embedding.
// One broken profile/image relationship must not hide every public advertisement.
const LISTING_COLUMNS = "id,title,description,price_lkr,category,location,condition,status,moderation_status,moderation_note,is_negotiable,seller_id,published_at";

function reportDbError(operation: string, error: DbError): void {
  // Server logs only: never print API keys, user cookies or private chat content.
  console.error(`[Marketly][catalog] ${operation}`, {
    code: error.code ?? "unknown",
    message: error.message ?? "unknown",
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

function filtered(items: Listing[], filters: ListingFilters): Listing[] {
  const query = (filters.q ?? "").trim().toLowerCase();
  return items.filter((listing) =>
    (!query || [listing.title, listing.description, listing.category].some((f) => f.toLowerCase().includes(query))) &&
    (!filters.category || filters.category === "All" || listing.category === filters.category) &&
    (!filters.location || filters.location === "All Sri Lanka" || listing.location === filters.location),
  );
}

// Kept exported for components using the existing row-to-card conversion.
export function toListing(row: Record<string, unknown>, baseUrl: string): Listing {
  const images = [...((row.listing_images as Array<{ storage_path: string; preview_storage_path?: string | null; position: number }> | undefined) ?? [])];
  images.sort((a, b) => a.position - b.position);
  const seller = row.profiles as { display_name?: string } | null;
  return {
    id: String(row.id), title: String(row.title), description: String(row.description), price_lkr: Number(row.price_lkr),
    category: String(row.category), location: String(row.location), condition: row.condition as Listing["condition"],
    seller_id: String(row.seller_id), seller_name: seller?.display_name ?? "Marketly Seller", status: row.status as Listing["status"],
    image_urls: images.map((im) => `${baseUrl}/storage/v1/object/public/listing-images/${encodeURI(im.storage_path)}`),
    published_at: String(row.published_at),
    is_negotiable: Boolean(row.is_negotiable), moderation_status: (row.moderation_status ?? "approved") as Listing["moderation_status"],
    moderation_note: typeof row.moderation_note === "string" ? row.moderation_note : null,
    preview_urls: images.map((im) => `${baseUrl}/storage/v1/object/public/listing-images/${encodeURI(im.preview_storage_path || im.storage_path)}`),
  };
}

async function attachPublicDetails(supabase: ServerSupabase, rows: Array<Record<string, unknown>>): Promise<Listing[]> {
  if (rows.length === 0) return [];
  const listingIds = rows.map((row) => String(row.id));
  const sellerIds = [...new Set(rows.map((row) => String(row.seller_id)))];

  // Both queries respect the existing RLS policies. No server-secret key is used.
  const [imagesResponse, profilesResponse] = await Promise.all([
    supabase.from("listing_images").select("listing_id,storage_path,preview_storage_path,position").in("listing_id", listingIds).order("position", { ascending: true }),
    supabase.from("profiles").select("id,display_name").in("id", sellerIds),
  ]);

  if (imagesResponse.error) reportDbError("load public listing images", imagesResponse.error);
  if (profilesResponse.error) reportDbError("load public seller names", profilesResponse.error);

  const imagesByListing = new Map<string, Array<{ storage_path: string; preview_storage_path?: string | null; position: number }>>();
  for (const image of imagesResponse.data ?? []) {
    const key = String(image.listing_id);
    const collection = imagesByListing.get(key) ?? [];
    collection.push({ storage_path: image.storage_path, preview_storage_path: image.preview_storage_path, position: image.position });
    imagesByListing.set(key, collection);
  }
  const namesBySeller = new Map((profilesResponse.data ?? []).map((profile) => [String(profile.id), profile.display_name]));
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return rows.map((row) => {
    const sellerName = namesBySeller.get(String(row.seller_id));
    return toListing({
      ...row,
      listing_images: imagesByListing.get(String(row.id)) ?? [],
      profiles: sellerName ? { display_name: sellerName } : null,
    }, baseUrl);
  });
}

export async function getListings(filters: ListingFilters = {}): Promise<{ listings: Listing[]; sample: boolean; error?: string }> {
  if (!hasSupabaseConfig()) return { listings: filtered(sampleListings, filters), sample: true };
  const supabase = await createServerSupabase();
  const {data:{user}} = await supabase.auth.getUser();
  let query = supabase.from("listings").select(LISTING_COLUMNS)
    .eq("status", "active").eq("moderation_status", "approved").order("published_at", { ascending: false }).limit(48);
  if (user) query = query.neq("seller_id", user.id); // seller manages own ads in dashboard
  if (filters.category && filters.category !== "All") query = query.eq("category", filters.category);
  if (filters.location && filters.location !== "All Sri Lanka") query = query.eq("location", filters.location);
  if (filters.q?.trim()) query = query.ilike("title", `%${filters.q.trim().replaceAll("%", "").replaceAll("_", "")}%`);
  const { data, error } = await query;
  if (error) {
    reportDbError("load active listings", error);
    return { listings: [], sample: false, error: "Could not load listings. Check the Next.js terminal for the specific database error." };
  }
  return { listings: await attachPublicDetails(supabase, (data ?? []) as Array<Record<string, unknown>>), sample: false };
}

export async function getListing(id: string): Promise<Listing | null> {
  if (!hasSupabaseConfig()) return sampleListings.find((listing) => listing.id === id) ?? null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("listings").select(LISTING_COLUMNS)
    .eq("id", id).maybeSingle(); // RLS shows nonpublic ads only to their owner/admin
  if (error) { reportDbError("load listing details", error); return null; }
  const items = data ? await attachPublicDetails(supabase, [data as Record<string, unknown>]) : [];
  return items[0] ?? null;
}

export async function getMyListings(userId: string): Promise<Listing[]> {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("listings").select(LISTING_COLUMNS)
    .eq("seller_id", userId).order("published_at", { ascending: false });
  if (error) { reportDbError("load my listings", error); return []; }
  return attachPublicDetails(supabase, (data ?? []) as Array<Record<string, unknown>>);
}

export async function getSellerActiveListings(sellerId: string): Promise<Listing[]> {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("listings").select(LISTING_COLUMNS)
    .eq("seller_id", sellerId).eq("status", "active").eq("moderation_status", "approved")
    .order("published_at", { ascending: false }).limit(100);
  if (error) { reportDbError("load seller's public listings", error); return []; }
  return attachPublicDetails(supabase, (data ?? []) as Array<Record<string, unknown>>);
}

export async function getFavoriteListings(userId: string): Promise<{ listings: Listing[]; error?: string }> {
  if (!hasSupabaseConfig()) return { listings: [] };
  const supabase = await createServerSupabase();
  const { data: rows, error } = await supabase.from("favorites")
    .select("listing_id,created_at").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(100);
  if (error) { reportDbError("load favorites", error); return { listings: [], error: "Cannot load favorites" }; }
  const ids = (rows ?? []).map((row) => row.listing_id);
  if (!ids.length) return { listings: [] };
  const { data, error: listingError } = await supabase.from("listings").select(LISTING_COLUMNS)
    .in("id", ids).eq("status", "active").eq("moderation_status", "approved");
  if (listingError) { reportDbError("load favorite listings", listingError); return { listings: [], error: "Cannot load favorite listings" }; }
  const sorted = new Map(ids.map((id, i) => [id, i]));
  return { listings: (await attachPublicDetails(supabase, (data ?? []) as Array<Record<string, unknown>>))
    .sort((a, b) => (sorted.get(a.id) ?? 0) - (sorted.get(b.id) ?? 0)) };
}
