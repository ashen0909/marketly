import { NextResponse } from "next/server";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const safeNext = "/dashboard"; // Do not allow open redirects through the query string.
  if (!hasSupabaseConfig()) return NextResponse.redirect(new URL("/login", url.origin));
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));
}
