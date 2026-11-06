import Link from "next/link";
import { DocumentCompare } from "@/components/market/document-compare";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Clock3, LockKeyhole, ShieldAlert } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminIdentityReview } from "@/components/market/admin-identity-review";
import { adminCan, normalizeAdminAccess } from "@/lib/admin-access";

export const dynamic = "force-dynamic";
export default async function ReviewIdentityPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 if (!/^[a-f\d-]{36}$/i.test(id)) notFound();
 const db = await createServerSupabase();
 const { data: { user } } = await db.auth.getUser(); if (!user) redirect("/login");
 const { data: raw } = await db.rpc("marketly_admin_access");
 const access = normalizeAdminAccess(raw);
 if (!adminCan(access, "verification")) notFound();
 const { data: request, error } = await db.from("seller_verification_requests")
   .select("id,seller_id,kind,status,created_at,admin_note,revision,escalated_at,escalated_note")
   .eq("id", id).maybeSingle();
 if (error || !request) notFound();
 const [{ data: identity }, { data: profile }, { data: details }] = await Promise.all([
  db.from("marketly_identity_submissions").select("legal_name,nic_last4,front_path,back_path,selfie_path,submitted_at,documents_purged_at").eq("request_id", id).maybeSingle(),
  db.from("profiles").select("display_name,identity_verified").eq("id", request.seller_id).maybeSingle(),
  db.from("marketly_profile_details").select("full_name,phone,district,city").eq("user_id", request.seller_id).maybeSingle(),
 ]);
 if (identity && !identity.documents_purged_at) {
  const { error: auditError } = await db.rpc("marketly_log_identity_preview", { p_request_id: id });
  if (auditError) notFound(); // fail closed: do not render private images without recording access
 }
 const { data: pendingPeers } = await db.from("seller_verification_requests")
   .select("id").eq("status", "pending").neq("id", id).neq("seller_id",user.id).limit(1);
 const hasNext = !!pendingPeers?.length;
 const evidence = identity && !identity.documents_purged_at ? await Promise.all([identity.front_path,identity.back_path,identity.selfie_path].map(async path => {
  if (!path) return null;
  const {data} = await db.storage.from("marketly-identity-private").createSignedUrl(path, 45);
  return data?.signedUrl ?? null;
 })) : [];
 return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 pb-20 sm:px-6">
  <Link href="/admin#verification" className="inline-flex items-center gap-2 text-sm font-bold text-[#8E6428]"><ArrowLeft className="size-4"/>Back to administration</Link>
  <header className="rounded-3xl bg-[#24272E] px-6 py-7 text-white"><p className="flex items-center gap-2 text-xs font-bold tracking-[.13em] text-[#E4BD76]"><BadgeCheck className="size-4"/>SECURE IDENTITY REVIEW</p>
  <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Seller verification request</h1>
  <p className="mt-2 text-sm text-white/70">Private documents · authorized reviewers only · never share screenshots or raw document links.</p></header>
  <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
   <section className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="text-lg font-extrabold">Seller & request details</h2>
    <dl className="space-y-2 text-sm">{[
      ["Display name",profile?.display_name||"Not provided"],
      ["Profile full name",details?.full_name||"Not provided"],
      ["Submitted legal name",identity?.legal_name||"Legacy request — no secure evidence"],
      ["NIC ending",identity?.nic_last4?`•••• ${identity.nic_last4}`:"Not provided"],
      ["Phone",details?.phone||"Not provided"],
      ["Location",[details?.city,details?.district].filter(Boolean).join(", ")||"Not provided"],
      ["Status",request.status],
      ["Revision",String(request.revision)],
      ["Created",new Date(request.created_at).toLocaleString("en-LK")],
      ].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2 border-b py-2"><dt className="text-stone-500">{label}</dt><dd className="max-w-xs text-right font-semibold">{value}</dd></div>)}</dl>
    {request.escalated_at&&<p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950"><ShieldAlert className="mr-1 inline size-4"/>Escalated for Owner review: {request.escalated_note||"Suspicious evidence"}</p>}
    {request.admin_note&&<p className="rounded-xl border bg-[#FFFCF5] p-3 text-sm">Previous review note: {request.admin_note}</p>}
   </section>
   <section className="space-y-4 rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold">Private document comparison</h2><span className="flex items-center gap-1 text-xs text-stone-500"><Clock3 className="size-3"/>Links expire in 45s</span></div>
   <p className="text-xs text-stone-600">Zoom images using your browser. Compare the real face in the selfie against the NIC photo, and inspect both sides manually.</p>
   <DocumentCompare evidence={evidence} />
   <p className="flex items-center gap-2 text-xs text-stone-600"><LockKeyhole className="size-4"/>Document URLs are temporary. Reload this page if the images expire.</p>
   {!identity&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Legacy text-only request. Approval is blocked until documents are submitted through the secure verification flow.</p>}
   </section>
  </div>
  <AdminIdentityReview requestId={id} status={request.status} isOwner={access.role==="owner"} isOwn={request.seller_id===user.id} escalated={!!request.escalated_at} hasIdentity={!!identity&&!identity.documents_purged_at}/>
  <div className="flex flex-wrap gap-3 text-sm font-semibold"><Link href="/admin#verification" className="rounded-lg border px-4 py-2 hover:bg-[#FFF8EC]">Back to verification queue</Link>{hasNext?<Link href="/admin/verification/next" className="rounded-lg border border-[#D0A352] px-4 py-2 text-[#865E22] hover:bg-[#FFF8EC]">Next pending review →</Link>:<span aria-disabled="true" title="No other pending requests" className="cursor-not-allowed rounded-lg border border-stone-200 bg-stone-100 px-4 py-2 text-stone-400">No more pending reviews</span>}<Link href="/notifications" className="rounded-lg border px-4 py-2 hover:bg-[#FFF8EC]">Notifications</Link></div>
 </main>;
}
