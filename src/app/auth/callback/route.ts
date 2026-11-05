import { NextResponse } from "next/server";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("next");
  const safeNext = requested === "/profile" ? "/profile?welcome=1" : requested === "/reset-password" ? "/reset-password" : "/dashboard"; // Explicit allowlist, no open redirects.
  if (!hasSupabaseConfig()) return NextResponse.redirect(new URL("/login", url.origin));
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));
}
