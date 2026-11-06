import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
const BUCKET = "marketly-identity-private";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;
const noStore = { "Cache-Control": "no-store" };
function fail(message: string, status = 400) { return NextResponse.json({ message }, { status, headers: noStore }); }
function detectImage(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) return { type: "image/png", ext: "png" };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0,4)) === "RIFF"
      && String.fromCharCode(...bytes.subarray(8,12)) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}
function normalizeName(value: string) { return value.trim().replace(/\s+/g, " "); }
function compareNames(one: string, two: string) {
  const normalizedOne = one.toLocaleLowerCase("en").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()
    ;
  const normalizedTwo = two.toLocaleLowerCase("en").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return !!normalizedOne && normalizedOne === normalizedTwo;
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Cross-origin request blocked.", 403);
  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) return fail("Photos exceed the 14 MB request limit.", 413);
  if (!hasSupabaseConfig()) return fail("Database unavailable.", 503);
  const secret = process.env.MARKETLY_IDENTITY_HMAC_KEY?.trim();
  if (!secret || secret.length < 32) return fail("Identity verification is not configured yet. Please contact support.", 503);
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Please sign in again.", 401);
  const { data: existing, error: pendingError } = await db.from("seller_verification_requests")
    .select("id").eq("seller_id", user.id).eq("status", "pending").limit(1);
  if (pendingError) return fail("Could not check existing requests. Please try again.", 503);
  if (existing?.length) return NextResponse.json({ id: existing[0].id, existing: true,
    message: "Your verification request is already pending. No duplicate was created." }, { headers: noStore });

  const form = await request.formData().catch(() => null);
  if (!form) return fail("Invalid form. Please try again.");
  const legalName = normalizeName(String(form.get("legal_name") || ""));
  const nic = String(form.get("nic_number") || "").trim().toUpperCase().replace(/\s|-/g, "");
  const comment = String(form.get("comment") || "").trim();
  if (legalName.length < 3 || legalName.length > 120 || comment.length > 400) return fail("Check your legal name and comment.");
  if (!/^(\d{9}[VX]|\d{12})$/.test(nic)) return fail("Enter a valid-format Sri Lankan NIC number (old or new format).");
  const { data: profile, error: profileError } = await db.from("marketly_profile_details")
    .select("full_name").eq("user_id", user.id).maybeSingle();
  if (profileError) return fail("Profile could not be checked. Please retry.", 503);

  const { data: corrections } = await db.from("seller_verification_requests")
    .select("id").eq("seller_id", user.id).eq("status", "changes_requested")
    .eq("kind", "identity").order("created_at", { ascending: false }).limit(1);
  const previousId = corrections?.[0]?.id;
  const { data: priorEvidence } = previousId ? await db.from("marketly_identity_submissions")
    .select("front_path,back_path,selfie_path").eq("request_id", previousId).maybeSingle() : { data: null };
  const uploaded: string[] = [];
  const photos: { key: string; path: string; bytes: Uint8Array; type: string }[] = [];
  for (const key of ["front", "back", "selfie"] as const) {
    const file = form.get(key);
    if (!(file instanceof File) || file.size < 10_000 || file.size > MAX_FILE_BYTES)
      return fail(`Please upload a clear ${key} photo (10 KB to 4 MB).`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectImage(bytes);
    if (!detected) return fail(`Unsupported ${key} photo format. Use JPEG, PNG or WebP.`);
    // Decode all pixels and normalize orientation. Sharp strips EXIF, GPS and other embedded metadata.
    // These are technical image checks, not OCR, document authenticity or face matching.
    let safe: Uint8Array;
    try {
      const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: 32_000_000 }).rotate();
      const meta = await pipeline.metadata();
      if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 480)
        return fail(`${key} image is too small. Please upload a sharper photo with at least 480 pixels on the shortest side.`);
      const stats = await pipeline.stats();
      if (stats.entropy < 2 || stats.sharpness < 1)
        return fail(`${key} image looks blank or too unclear. Retake the photo in good lighting.`);
      safe = new Uint8Array(await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer());
      if (safe.byteLength > MAX_FILE_BYTES) return fail(`${key} image is too large after processing.`);
    } catch { return fail(`${key} image could not be decoded safely. Upload a real JPEG, PNG or WebP photo.`); }
    photos.push({ key, path: `${user.id}/${randomUUID()}/${key}.jpg`, bytes: safe, type: "image/jpeg" });
  }
  const fingerprint = createHmac("sha256", secret).update(`marketly:nic:v1:${nic}`).digest("hex");
  try {
    for (const photo of photos) {
      const { error } = await db.storage.from(BUCKET)
        .upload(photo.path, photo.bytes, { contentType: photo.type, cacheControl: "0", upsert: false });
      if (error) throw new Error("Photo upload failed. Check your connection and try again.");
      uploaded.push(photo.path);
    }
    const { data: id, error } = await db.rpc("marketly_submit_identity", {
      p_legal_name: legalName, p_nic_last4: nic.slice(-4), p_nic_fingerprint: fingerprint,
      p_front_path: photos[0].path, p_back_path: photos[1].path, p_selfie_path: photos[2].path,
      p_comment: comment,
    });
    if (error) throw new Error(error.message);
    if (!id) throw new Error("Unable to save the verification request.");
    const { data: finalRequest } = await db.from("marketly_identity_submissions")
      .select("front_path").eq("request_id", id).maybeSingle();
    if (finalRequest?.front_path !== photos[0].path) { // another simultaneous submit won
      await db.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
    }
    if (finalRequest?.front_path === photos[0].path && priorEvidence) {
      const stale = [priorEvidence.front_path, priorEvidence.back_path, priorEvidence.selfie_path]
        .filter((path): path is string => !!path && !uploaded.includes(path));
      if (stale.length) await db.storage.from(BUCKET).remove(stale).catch(() => undefined);
    }
    return NextResponse.json({ id, existing: finalRequest?.front_path !== photos[0].path,
      message: "Identity evidence submitted securely for manual review.",
      precheck: {
        uploaded: true, nicFormat: true,
        profileNameMatches: !!profile?.full_name && compareNames(legalName, profile.full_name),
        faceComparison: "manual", identityAuthenticity: "manual",
      },
    }, { status: 201, headers: noStore });
  } catch (error) {
    if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Could not submit verification.";
    const safe = /^(Photo upload failed|Unable to save|VERIFICATION_RATE_LIMIT|REQUEST_ALREADY_PENDING|COMPLETE_PROFILE_AND_EMAIL_FIRST|ALREADY_VERIFIED|IDENTITY_DOCUMENT_MISSING|PENDING_REQUEST_REQUIRED)/.test(message)
      ? message.replaceAll("_", " ") : message.includes("NIC_ALREADY_LINKED_TO_ANOTHER_SELLER")
        ? "This NIC is already linked to another seller. Contact Marketly support if you believe this is incorrect."
        : "Verification could not be completed. Check your details and try again.";
    return fail(safe, message.includes("RATE_LIMIT") ? 429 : 400);
  }
}
