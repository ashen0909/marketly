import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Validate setup, rather than treating .env.example placeholders as a connection. */
export function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || /YOUR-|PLACEHOLDER|EXAMPLE/i.test(url + key)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  } catch { return false; }
}

export async function createServerSupabase() {
  if (!hasSupabaseConfig()) throw new Error("Missing Supabase environment variables.");
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; proxy.ts refreshes sessions.
          }
        },
      },
    },
  );
}
