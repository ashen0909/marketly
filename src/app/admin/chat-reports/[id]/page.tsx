import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { ReviewChatReport } from "@/components/market/review-chat-report";
export const dynamic="force-dynamic";
export default async function AdminChatReportDetail({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;if(!/^[a-f\d-]{36}$/i.test(id))notFound();
 const db=await createServerSupabase();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {data:allowed}=await db.rpc("marketly_admin_has_permission",{p_permission:"chat_reports"});if(!allowed)notFound();
 const {data:report}=await db.from("marketly_chat_reports").select("id,reason,details,status,created_at").eq("id",id).maybeSingle();if(!report)notFound();
 return <main className="mx-auto max-w-3xl space-y-5 px-4 py-9 sm:px-6"><Link href="/admin/chat-reports" className="text-sm font-bold text-[#8E6428]">← Conversation reports</Link><h1 className="text-3xl font-extrabold">Conversation report</h1>
 <section className="space-y-3 rounded-2xl border bg-white p-6"><p className="font-semibold capitalize">{report.reason.replaceAll("_"," ")}</p><p className="whitespace-pre-wrap text-sm">{report.details||"No details supplied"}</p><p className="text-xs text-stone-500">{report.status} · {new Date(report.created_at).toLocaleString("en-LK")}</p>
 {report.status==="open"?<ReviewChatReport id={id}/>:<p className="text-sm">Already reviewed.</p>}</section><Link href="/notifications" className="text-sm font-bold text-[#8E6428] underline">Notifications</Link></main>;
}
