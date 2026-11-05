import { createClient } from "@supabase/supabase-js";

/** Server-only storage client; no secret can be imported into browser bundles. */
export function createAdminStorageBucket(bucket: "listing-images" | "marketly-profile-photos" = "listing-images") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Secure server storage is not configured.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).storage.from(bucket);
}

/** Preserve all old listing-upload imports unchanged. */
export function createAdminStorage() { return createAdminStorageBucket("listing-images"); }
