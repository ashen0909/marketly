import { createBrowserClient } from "@supabase/ssr";

/** Reject the placeholders shipped in .env.example so preview mode cannot masquerade as connected. */
export function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || /YOUR-|PLACEHOLDER|EXAMPLE/i.test(url + key)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  } catch { return false; }
}

export function createBrowserSupabase() {
  if (!hasSupabaseConfig()) throw new Error("Configure your real Supabase Project URL and publishable key in .env.local first.");
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
