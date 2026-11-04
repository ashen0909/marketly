import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Mail, ShieldCheck, UserRound } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/market/profile-form";

export const metadata: Metadata = { title: "Profile settings" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles")
    .select("display_name,identity_verified,created_at")
    .eq("id", user.id).maybeSingle();
  const name = profile?.display_name || (typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "") || "Marketly member";

  return <div className="min-h-[65vh] bg-[#FAF9F7] px-4 py-10 sm:py-14">
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-widest text-[#9C6F2E]">My account</p>
      <h1 className="mt-2 text-3xl font-extrabold text-[#24272E]">Profile settings</h1>
      <p className="mt-2 text-sm text-[#68707C]">Use one Marketly account to buy and sell.</p>
      <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_250px]">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold"><UserRound className="size-5 text-[#A3722F]"/> Your public name</h2>
          <p className="mt-2 text-sm text-[#68707C]">This name appears in your account menu and on your product listings.</p>
          <ProfileForm initialName={name}/>
          <div className="mt-7 border-t border-stone-100 pt-5">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Mail className="size-4"/> Email address</p>
            <p className="break-all rounded-lg bg-[#F8F7F4] px-3 py-3 text-sm text-[#515762]">{user.email || "Not available"}</p>
            <p className="mt-2 text-xs text-[#68707C]">Email changes are not enabled in this milestone.</p>
          </div>
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-[#A3722F]"/> Seller trust</h2>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium">{profile?.identity_verified ? <><BadgeCheck className="size-5 text-emerald-700"/> Identity verified</> : "Identity not verified"}</p>
            <p className="mt-2 text-xs leading-relaxed text-[#68707C]">Identity checks are not available yet. Paying for a membership does not grant an identity badge.</p>
          </div>
          <Link href="/dashboard" className="block rounded-xl border border-[#D8C4A2] bg-[#FFFBF5] px-5 py-3 text-center text-sm font-bold text-[#855921] hover:bg-[#FFF3E1]">View My Ads</Link>
        </aside>
      </div>
    </div>
  </div>;
}
