import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadListingPhotoPairs, validateImageFiles } from "@/lib/images/upload-listing-photos";
import { createAdminStorage } from "@/lib/supabase/storage-admin";
import { categories, locations } from "@/data/catalog";
export const runtime = "nodejs";

const fail = (message: string, status = 400) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (data: FormData, name: string) => { const item=data.get(name); return typeof item === "string" ? item.trim() : ""; };
type PhotoOrderItem = { kind: "existing"; path: string } | { kind: "new"; index: number };
type StoredDraft = { image_paths: string[]; preview_paths: string[] };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Cross-origin request blocked", 403);
  if (Number(request.headers.get("content-length") || 0) > 65 * 1024 * 1024) return fail("Upload too large", 413);
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in before saving drafts", 401);
  const form = await request.formData().catch(() => null);
  if (!form) return fail("Invalid draft form");
  const draftId = field(form, "draft_id") || null;
  if (draftId && !uuid.test(draftId)) return fail("Invalid draft ID");
  const title = field(form, "title"); const description = field(form, "description");
  const priceRaw = field(form, "price"); const price = priceRaw ? Number(priceRaw) : null;
  const category = field(form, "category") || null;
  const location = field(form, "location") || null;
  const condition = field(form, "condition") || null;
  if (title.length > 90 || description.length > 2500 ||
    (price !== null && (!Number.isInteger(price) || price < 1 || price > 999999999)) ||
    (category !== null && !categories.some(c => c.id === category)) ||
    (location !== null && !(locations as readonly string[]).includes(location)) ||
    (condition !== null && !["New", "Used", "Refurbished"].includes(condition))) return fail("Invalid draft details");

  let old: StoredDraft | null = null;
  if (draftId) {
    const { data, error } = await db.from("marketly_listing_drafts").select("image_paths,preview_paths")
      .eq("id", draftId).eq("seller_id", user.id).maybeSingle();
    if (error || !data) return fail("Draft not found or not yours", 404);
    old = data as StoredDraft;
  }

  const incoming = form.getAll("images");
  if (incoming.some(x => !(x instanceof File))) return fail("Invalid image upload");
  const files = incoming as File[];
  const { data: ownerFree } = await db.rpc("marketly_is_owner");
  const photoLimit = ownerFree ? 12 : 5;
  if (files.length) { try { validateImageFiles(files, photoLimit); } catch(e) { return fail(e instanceof Error ? e.message : "Invalid images"); } }
  let order: PhotoOrderItem[];
  try {
    const raw = field(form, "photo_order");
    order = raw ? JSON.parse(raw) as PhotoOrderItem[] : [
      ...(old?.image_paths ?? []).map(path => ({ kind: "existing" as const, path })),
      ...files.map((_, index) => ({ kind: "new" as const, index }))
    ];
    if (!Array.isArray(order) || order.length > photoLimit) throw new Error(`Maximum ${photoLimit} photos per draft.`);
    const unique = new Set<string>();
    for (const item of order) {
      if (!item || typeof item !== "object") throw new Error("Invalid photo order");
      if (item.kind === "existing") {
        if (typeof item.path !== "string" || !old?.image_paths.includes(item.path)) throw new Error("Photo does not belong to this draft");
      } else if (item.kind === "new") {
        if (!Number.isInteger(item.index) || item.index < 0 || item.index >= files.length) throw new Error("Invalid selected photo");
      } else throw new Error("Invalid photo order");
      const key = item.kind === "new" ? `new:${item.index}` : `old:${item.path}`;
      if (unique.has(key)) throw new Error("Repeated photo");
      unique.add(key);
    }
    if (files.some((_, index) => !order.some(item => item.kind === "new" && item.index === index))) throw new Error("A selected photo is missing from order");
  } catch (e) { return fail(e instanceof Error ? e.message : "Invalid photo order"); }
  let uploaded: Awaited<ReturnType<typeof uploadListingPhotoPairs>> | undefined;
  try {
    if (files.length) uploaded = await uploadListingPhotoPairs(files, user.id);
    const paths: string[] = []; const previews: string[] = [];
    for (const item of order) {
      if (item.kind === "new") {
        paths.push(uploaded!.paths[item.index]); previews.push(uploaded!.previews[item.index]);
      } else {
        const index = old!.image_paths.indexOf(item.path);
        paths.push(item.path); previews.push(old!.preview_paths[index]);
      }
    }
    const { data: savedId, error } = await db.rpc("marketly_save_listing_draft", {
      p_draft_id: draftId, p_title: title, p_description: description,
      p_price_lkr: price, p_category: category, p_location: location, p_condition: condition,
      p_is_negotiable: field(form, "is_negotiable") === "true",
      p_image_paths: paths, p_preview_paths: previews,
    });
    if (error) throw new Error(error.message);
    const removed = (old?.image_paths ?? []).flatMap((path, index) => paths.includes(path) ? [] : [path, old!.preview_paths[index]]);
    // Cleanup happens after the DB commit. If cleanup fails, records remain correct;
    // orphaned storage paths can later be removed by an admin garbage collector.
    if (removed.length) {
      try {
        const { error: cleanupError } = await createAdminStorage().remove(removed);
        if (cleanupError) console.warn("[Marketly] Draft photo cleanup deferred", cleanupError.message);
      } catch (cleanupError) {
        console.warn("[Marketly] Draft photo cleanup deferred", cleanupError instanceof Error ? cleanupError.message : "unknown");
      }
    }
    return NextResponse.json({ id: savedId, message: "Draft saved (no posting credit used)" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (uploaded) await uploaded.storage.remove(uploaded.uploaded);
    const message = e instanceof Error ? e.message : "Could not save draft";
    return fail(message, message.includes("MAX_TEN_DRAFTS") ? 409 : 400);
  }
}
