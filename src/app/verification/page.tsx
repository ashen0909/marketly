import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { VerificationForm } from "@/components/market/verification-form";
import { PhoneVerification } from "@/components/market/phone-verification";
import { profileCompletion, type ProfileDetails, emptyProfileDetails } from "@/lib/profile-completion";

export const dynamic = "force-dynamic";
export default async function VerificationPage() {
  const db = await createServerSupabase();
  const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  const [{data:requests},{data:profile},{data:details}]=await Promise.all([
    db.from("seller_verification_requests").select("id,kind,status,created_at,admin_note").eq("seller_id",user.id).order("created_at",{ascending:false}).limit(10),
    db.from("profiles").select("display_name,identity_verified").eq("id",user.id).maybeSingle(),
    db.from("marketly_profile_details").select("full_name,phone,district,city,about,contact_preference,photo_path,email_notifications").eq("user_id",user.id).maybeSingle(),
  ]);
  const progress=profileCompletion(profile?.display_name||"",(details as ProfileDetails | null)||emptyProfileDetails);
  const eligible=progress.complete && !!user.email_confirmed_at && !requests?.some(x=>x.status==="pending");
  return <main className="mx-auto max-w-3xl px-4 py-10">
    <h1 className="mb-2 text-3xl font-extrabold">Seller verification</h1>
    <p className="mb-6 text-sm text-stone-600">Verification is free. Only eligible accounts may request admin review. Never submit your NIC, passport number or banking details in messages.</p>
    <div className="mb-6 rounded-2xl border border-[#E6D4B4] bg-[#FFFBF4] p-5">
      <div className="flex justify-between gap-3"><h2 className="font-bold">Profile completion</h2><strong>{progress.percentage}%</strong></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E7DDCE]" role="progressbar" aria-valuenow={progress.percentage} aria-valuemin={0} aria-valuemax={100} aria-label="Verification profile completion"><div className="h-full bg-[#B88746]" style={{width:`${progress.percentage}%`}}/></div>
      <p className="mt-2 text-sm">{progress.missing.length?`Missing: ${progress.missing.join(", ")}`:"All profile details completed."}</p>
      {!user.email_confirmed_at && <p className="mt-2 text-sm text-red-800">Confirm your email before applying.</p>}
      <Link href="/profile" className="mt-3 inline-block text-sm font-bold text-[#875F22] underline">Complete or edit my profile</Link>
    </div>
    {profile?.identity_verified && <p className="success-text mb-5">Your identity verification is already approved. You can still view previous requests below.</p>}
    {eligible && !profile?.identity_verified ? <VerificationForm/>:
      <p className="mb-5 rounded-2xl border bg-stone-50 p-5 text-sm text-stone-700">{requests?.some(x=>x.status==="pending")?"You already have a pending verification request. Wait for admin review.":profile?.identity_verified?"Your account is verified.":"Complete your profile and confirm your email to unlock verification requests."}</p>}
    <PhoneVerification/>
    <h2 className="mb-3 mt-10 text-lg font-bold">Your verification requests</h2>
    {(requests??[]).length?(requests??[]).map(x=><p key={x.id} className="mb-2 rounded-xl border p-4 text-sm">{x.kind} · <strong>{x.status}</strong>{x.admin_note?` — ${x.admin_note}`:""}</p>):<p className="rounded-xl border border-dashed p-4 text-sm text-stone-500">No verification requests yet.</p>}
  </main>;
}
