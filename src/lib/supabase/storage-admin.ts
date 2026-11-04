import { createClient } from "@supabase/supabase-js";

/**
 * Backend-only storage client. Keep this key out of NEXT_PUBLIC variables,
 * client components, git, logs, and responses.
 * The storage bucket's user INSERT policy is revoked by migration 002.
 */
export function createAdminStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error("Server image storage is not configured. Add SUPABASE_SECRET_KEY in .env.local (server only).");
  }
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).storage.from("listing-images");
}
