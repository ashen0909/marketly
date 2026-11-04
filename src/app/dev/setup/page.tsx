import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleHelp, Database, XCircle } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Developer database setup", robots: { index: false, follow: false } };

type Check = { title: string; ok: boolean; detail: string };

export default async function SetupPage() {
  // Internal developer-only diagnostics; do not expose environment details on production sites.
  if (process.env.NODE_ENV === "production") notFound();
  const checks: Check[] = [];
  const configured = hasSupabaseConfig();
  checks.push({ title: "Project URL + publishable key", ok: configured, detail: configured ? "Configured (not a placeholder)" : "Paste real values into .env.local, then restart Next.js" });
  if (configured) {
    try {
      const client = await createServerSupabase();
      for (const table of ["profiles", "listings", "listing_images", "listing_post_ledger"] as const) {
        const { error } = await client.from(table).select("id").limit(1);
        checks.push({ title: `Table: ${table}`, ok: !error, detail: error ? `${error.code || "Database error"}: ${error.message}` : "Accessible (RLS may return zero rows for guests)" });
      }
    } catch (error) {
      checks.push({ title: "Supabase connection", ok: false, detail: error instanceof Error ? error.message : "Could not reach Supabase" });
    }
  }
  const ready = checks.length === 5 && checks.every(c=>c.ok);
  return <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
    <div className="mb-8 flex items-center gap-3"><Database className="size-9 text-[#AA782C]"/><div><p className="text-xs font-bold uppercase tracking-widest text-[#AA782C]">Development only</p><h1 className="text-3xl font-extrabold">Marketly · Database connection</h1></div></div>
    <p className="mb-6 text-[#68707C]">This page checks whether your local Next.js project can read the Supabase tables. It does not create any accounts or insert example listings.</p>
    <div className={`mb-6 rounded-xl border px-5 py-4 font-semibold ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{ready ? "Database checks passed — you can now test registration and publishing." : "Setup incomplete — follow the steps below and reload this page."}</div>
    <div className="space-y-3">{checks.map(c => <div key={c.title} className="flex items-start gap-3 rounded-xl border border-stone-200 p-4">{c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600"/> : <XCircle className="mt-0.5 size-5 shrink-0 text-amber-600"/>}<div><p className="font-semibold">{c.title}</p><p className="mt-1 break-words text-sm text-[#68707C]">{c.detail}</p></div></div>)}</div>
    <div className="mt-8 rounded-2xl border border-stone-200 bg-[#FBFAF8] p-6"><h2 className="flex items-center gap-2 text-lg font-bold"><CircleHelp className="size-5 text-[#AA782C]"/> Next steps</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#575F6A]"><li>Create a Supabase project</li><li>Run <code>supabase/migrations/202611040001_initial_marketplace.sql</code> once in SQL Editor</li><li>Set the URL and publishable key in <code>.env.local</code>, restart <code>npm run dev</code></li><li>Configure Auth Site URL and confirmation email template as described in <code>SETUP-SINHALA.md</code></li><li>Register, confirm email, then publish a listing with 1–5 photos</li></ol><div className="mt-5 flex gap-3"><Link href="/login" className="rounded-lg bg-[#24272E] px-4 py-2 text-sm font-semibold text-white">Register / Login</Link><Link href="/sell/new" className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold">Post Ad</Link></div></div>
    <p className="mt-6 text-xs text-[#68707C]">Connection checks do not establish production readiness. Image storage, Auth confirmation, RLS and email delivery still require end-to-end testing.</p>
  </main>;
}
