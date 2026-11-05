import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { ReviewChatReport } from "@/components/market/review-chat-report";
import { PaginationControls } from "@/components/market/pagination-controls";
import { readPage, pageRange, totalPages } from "@/lib/pagination";
export const dynamic = "force-dynamic";
export default async function AdminChatReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!hasSupabaseConfig()) notFound();
  const db = await createServerSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: canReview } = await db.rpc("marketly_admin_has_permission", { p_permission: "chat_reports" });
  if (!canReview) notFound();
  const page = readPage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { data, count, error } = await db.from("marketly_chat_reports")
    .select("id,conversation_id,reason,details,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <Link href="/admin" className="text-sm font-semibold text-[#85602A]">← Admin overview</Link>
    <h1 className="mt-5 text-3xl font-extrabold">Reported conversations</h1>
    <p className="mt-2 text-sm text-stone-500">Restricted to admins. Reports are reviewed without exposing private chat contents on this screen.</p>
    {error && <p role="alert" className="mt-5 text-red-700">Chat reports could not load. Please refresh and try again.</p>}
    <div className="mt-6 space-y-3">{(data??[]).map(r=><article key={r.id} className="rounded-2xl border bg-white p-5">
      <p className="text-sm font-bold">{r.reason.toUpperCase()} · {r.status}</p>
      <p className="mt-1 text-xs text-stone-500">{new Date(r.created_at).toLocaleString("en-LK")}</p>
      <p className="mt-2 text-sm">{r.details || "No additional details"}</p>
      <div className="mt-3"><ReviewChatReport id={r.id}/></div>
    </article>)}{!error&&!data?.length&&<p className="rounded-xl border p-8">No reports on this page.</p>}</div>
    <PaginationControls path="/admin/chat-reports" page={page} pages={totalPages(count)}/>
  </main>;
}
