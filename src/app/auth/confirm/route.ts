import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

/** Confirm signup through a token hash so SSR auth creates valid session cookies. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!hasSupabaseConfig()) return NextResponse.redirect(new URL("/login?error=setup", url.origin));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && type && ["email", "signup", "recovery", "invite", "magiclink", "email_change"].includes(type)) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : "/profile?confirmed=1", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirmation", url.origin));
}
