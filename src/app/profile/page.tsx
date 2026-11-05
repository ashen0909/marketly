import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { createAdminStorageBucket } from "@/lib/supabase/storage-admin";
import { ProfileForm } from "@/components/market/profile-form";
import type { ProfileDetails } from "@/lib/profile-completion";

export const metadata: Metadata = { title: "My profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: publicProfile },{ data: personal }] = await Promise.all([
    db.from("profiles").select("display_name,identity_verified,created_at").eq("id",user.id).maybeSingle(),
    db.from("marketly_profile_details").select("full_name,phone,district,city,about,contact_preference,photo_path,email_notifications").eq("user_id",user.id).maybeSingle(),
  ]);
  const name=publicProfile?.display_name || (typeof user.user_metadata?.display_name==="string"?user.user_metadata.display_name:"") || "Marketly member";
  let photoUrl: string | null = null;
  if (personal?.photo_path) {
    try { const {data}=await createAdminStorageBucket("marketly-profile-photos").createSignedUrl(personal.photo_path,3600);photoUrl=data?.signedUrl || null; }
    catch { photoUrl=null; }
  }
  return <div className="min-h-[70vh] bg-[#FAF9F7] px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8C632B] hover:underline"><ArrowLeft className="size-4"/> Seller dashboard</Link>
      <div className="mb-7 mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#9C6F2E]">My account</p><h1 className="mt-2 text-3xl font-extrabold text-[#24272E] sm:text-4xl">My Profile</h1><p className="mt-2 max-w-xl text-sm text-[#68707C]">All your details, verification progress and security settings in one place. Personal information stays private.</p></div>
        {publicProfile?.identity_verified && <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800"><BadgeCheck className="size-4"/> Identity verified</span>}
      </div>
      <ProfileForm initialName={name} initialDetails={personal as ProfileDetails | null} initialPhotoUrl={photoUrl}
        email={user.email || ""} emailVerified={!!user.email_confirmed_at} verified={!!publicProfile?.identity_verified}/>
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4"><ShieldCheck className="size-5 text-[#A3722F]"/><p className="flex-1 text-sm text-stone-600">Identity verification is a separate admin-reviewed process. A business membership never grants a verified badge.</p><Link href="/verification" className="text-sm font-bold text-[#926829] underline">Verification history</Link></div>
    </div>
  </div>;
}
