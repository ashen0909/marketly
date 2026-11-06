import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminActions } from "@/components/market/admin-actions";
export const dynamic="force-dynamic";
export default async function AdminReportDetail({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;if(!/^[a-f\d-]{36}$/i.test(id))notFound();
 const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {data:allowed}=await db.rpc("marketly_admin_has_permission",{p_permission:"reports"});if(!allowed)notFound();
 const {data:report}=await db.from("listing_reports").select("id,listing_id,reason,details,status,reporter_id,created_at").eq("id",id).maybeSingle();if(!report)notFound();
 return <main className="mx-auto max-w-3xl space-y-5 px-4 py-9 sm:px-6"><Link href="/admin#reports" className="text-sm font-bold text-[#8E6428]">← Reports queue</Link><h1 className="text-3xl font-extrabold">Listing report review</h1>
 <section className="space-y-3 rounded-2xl border bg-white p-6"><p className="font-bold capitalize">{report.reason.replaceAll("_"," ")}</p><p className="whitespace-pre-wrap text-sm">{report.details||"No additional details"}</p>
 <p className="text-xs text-stone-500">Received {new Date(report.created_at).toLocaleString("en-LK")} · {report.status}</p>
 <Link href={`/listings/${report.listing_id}`} className="text-sm font-bold text-[#8E6428] underline">Open reported listing</Link>
 {report.status==="open"?<AdminActions kind="report" id={id}/>:<p className="text-sm text-stone-600">Report already reviewed.</p>}
 </section><Link href="/notifications" className="text-sm font-bold text-[#8E6428] underline">Notifications</Link></main>;
}
