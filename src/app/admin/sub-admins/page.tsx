import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Crown, ShieldCheck } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { SubAdminManager } from "@/components/market/sub-admin-manager";
import { normalizeAdminAccess } from "@/lib/admin-access";
export const dynamic="force-dynamic";
export default async function SubAdminsPage(){
 if(!hasSupabaseConfig())notFound();const db=await createServerSupabase();
 const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {data}=await db.rpc("marketly_admin_access");if(normalizeAdminAccess(data).role!=="owner")notFound();
 return <main className="mx-auto max-w-5xl space-y-7 px-4 py-8 pb-24 sm:px-6"><Link href="/admin" className="text-sm font-semibold text-[#8F6324]">← Admin center</Link><header className="rounded-3xl bg-[#24272E] p-6 text-white sm:p-8"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#E4BD76]"><Crown className="size-4"/>Owner only</div><h1 className="mt-3 text-3xl font-black">Manage Sub Admins</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Give trusted team members only the moderation permissions they need. Their normal buying/selling limits stay unchanged.</p></header><p className="flex items-start gap-3 rounded-xl border border-[#E6DBCC] bg-white p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#B88746]"/>Only the owner can add, change, suspend or remove admin access. Actions are checked in the database and logged; these controls never grant access to private chat bodies.</p><SubAdminManager/></main>;
}
