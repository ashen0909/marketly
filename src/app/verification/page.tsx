import {redirect} from "next/navigation";
import {createServerSupabase} from "@/lib/supabase/server";
import {VerificationForm} from "@/components/market/verification-form";
import {PhoneVerification} from "@/components/market/phone-verification";
export const dynamic="force-dynamic";
export default async function VerificationPage(){const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
  const {data:requests}=await db.from("seller_verification_requests").select("id,kind,status,created_at,admin_note").eq("seller_id",user.id).order("created_at",{ascending:false}).limit(10);
  return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="mb-3 text-3xl font-extrabold">Seller verification</h1><p className="mb-6 text-sm text-stone-600">Free verification requests. A paid membership does not buy a verified badge. Phone OTP requires a separately configured SMS provider.</p>
    <VerificationForm/><PhoneVerification/><h2 className="mb-3 mt-10 text-lg font-bold">Your requests</h2>{(requests??[]).map(x=><p key={x.id} className="mb-2 rounded-xl border p-4 text-sm">{x.kind} · <strong>{x.status}</strong>{x.admin_note?` — ${x.admin_note}`:""}</p>)}</main>;
}
