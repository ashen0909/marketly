import type { Metadata } from "next";
import { LoginForm } from "@/components/market/login-form";

export const metadata: Metadata = { title: "Sign in" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  // Only permit returning to a local product detail page; never permit external redirects.
  const postLoginPath = next && /^\/listings\/[a-zA-Z0-9-]+$/.test(next) ? next : "/dashboard";
  const errorMessage = error === "confirmation" ? "Confirmation link invalid or expired. Request a new link and try again." : error === "setup" ? "Supabase is not configured yet." : "";
  return <div className="bg-[#FAF9F7] px-4 py-14">{errorMessage && <p className="error-text mx-auto mb-5 max-w-md" role="alert">{errorMessage}</p>}<LoginForm postLoginPath={postLoginPath}/></div>;
}
