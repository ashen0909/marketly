import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { NotificationsList } from "@/components/market/notifications-list";
import { PaginationControls } from "@/components/market/pagination-controls";
import { readPage, pageRange, totalPages } from "@/lib/pagination";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = readPage((await searchParams).page);
  const { from, to } = pageRange(page);
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error, count } = await supabase.from("notifications")
    .select("id,kind,title,conversation_id,listing_id,created_at,read_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <h1 className="flex items-center gap-3 text-3xl font-extrabold"><Bell className="size-8 text-[#B88746]"/>Notifications</h1>
    <p className="mt-2 mb-8 text-sm text-stone-500">In-app alerts for messages, offers, ad reviews and admin moderation. Browser push/email alerts are not enabled.</p>
    {error ? <p className="error-text">Could not load notifications. Check database configuration.</p> : <><NotificationsList key={page} initial={data ?? []}/><PaginationControls path="/notifications" page={page} pages={totalPages(count)} /></>}
  </div>;
}
