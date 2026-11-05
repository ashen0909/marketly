export type SavedDraft = {
  id: string;
  title: string;
  description: string;
  price_lkr: number | null;
  category: string | null;
  location: string | null;
  condition: string | null;
  is_negotiable: boolean;
  image_paths: string[];
  preview_paths: string[];
  updated_at: string;
};
export function publicListingImageUrl(path: string): string {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${origin}/storage/v1/object/public/listing-images/${encodeURI(path)}`;
}
