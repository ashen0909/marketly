import {notFound,redirect} from "next/navigation";
import {createServerSupabase} from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function NextVerification() {
 const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {data:allowed}=await db.rpc("marketly_admin_has_permission",{p_permission:"verification"});if(!allowed)notFound();
 const {data}=await db.from("seller_verification_requests").select("id,seller_id").eq("status","pending").order("created_at",{ascending:true}).limit(15);
 const first=(data||[]).find(row=>row.seller_id!==user.id);
 if(first)redirect(`/admin/verification/${first.id}`);
 redirect("/admin#verification");
}
