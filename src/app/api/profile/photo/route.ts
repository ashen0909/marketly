import { NextResponse } from "next/server";
import { userFacingError } from "@/lib/user-facing-error";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminStorageBucket } from "@/lib/supabase/storage-admin";

export const runtime = "nodejs";
const fail = (message: string, status = 400) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function session() {
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  return { db, user };
}

export async function GET() {
  const { db, user } = await session();
  if (!user) return fail("Sign in required", 401);
  const { data, error } = await db.from("marketly_profile_details").select("photo_path").eq("user_id", user.id).maybeSingle();
  if (error) return fail("Could not load profile photo", 500);
  if (!data?.photo_path) return NextResponse.json({ url: null }, { headers: { "Cache-Control": "no-store" } });
  const { data: signed, error: signError } = await createAdminStorageBucket("marketly-profile-photos").createSignedUrl(data.photo_path, 3600);
  if (signError) return fail("Photo temporarily unavailable", 503);
  return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("Cross-origin request blocked", 403);
  if (Number(request.headers.get("content-length") || 0) > 3 * 1024 * 1024) return fail("Photo is too large", 413);
  const { db, user } = await session();
  if (!user) return fail("Sign in required", 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return fail("Choose a JPG, PNG or WebP photo smaller than 2 MB.");
  }
  const store = createAdminStorageBucket("marketly-profile-photos");
  const path = `${user.id}/${crypto.randomUUID()}.webp`;
  try {
    const raw = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(raw, { limitInputPixels: 16_000_000 }).rotate()
      .resize({ width: 512, height: 512, fit: "cover" }).webp({ quality: 80 }).toBuffer();
    const { data: existing } = await db.from("marketly_profile_details").select("photo_path").eq("user_id", user.id).maybeSingle();
    const { error: upErr } = await store.upload(path, optimized, { contentType: "image/webp", upsert: false, cacheControl: "3600" });
    if (upErr) throw upErr;
    const { error: dbErr } = await db.rpc("marketly_set_profile_photo", { p_photo_path: path });
    if (dbErr) { await store.remove([path]); throw dbErr; }
    if (existing?.photo_path && existing.photo_path !== path) await store.remove([existing.photo_path]);
    const { data: signed } = await store.createSignedUrl(path, 3600);
    return NextResponse.json({ url: signed?.signedUrl || null, message: "Profile photo saved" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Marketly] profile photo upload failed", error instanceof Error ? error.message : "Unknown error");
    return fail(userFacingError(error, "upload"), 400);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return fail("Cross-origin request blocked", 403);
  const { db, user } = await session();
  if (!user) return fail("Sign in required", 401);
  const { data: existing } = await db.from("marketly_profile_details").select("photo_path").eq("user_id", user.id).maybeSingle();
  const { error } = await db.rpc("marketly_set_profile_photo", { p_photo_path: null });
  if (error) return fail(userFacingError(error, "upload"));
  if (existing?.photo_path) await createAdminStorageBucket("marketly-profile-photos").remove([existing.photo_path]);
  return NextResponse.json({ url: null, message: "Photo removed" }, { headers: { "Cache-Control": "no-store" } });
}
