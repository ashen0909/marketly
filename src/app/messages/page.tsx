import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: conversations, error } = await supabase.from("conversations")
    .select("id,listing_id,buyer_id,seller_id,last_message_at")
    .order("last_message_at", { ascending: false }).limit(100);
  const rows = conversations ?? [];
  const listingIds = [...new Set(rows.map((c) => c.listing_id))];
  const profileIds = [...new Set(rows.flatMap((c) => [c.buyer_id, c.seller_id]))];
  const [{ data: listings }, { data: profiles }] = await Promise.all([
    listingIds.length ? supabase.from("listings").select("id,title").in("id", listingIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    profileIds.length ? supabase.from("profiles").select("id,display_name").in("id", profileIds) : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
  ]);
  const titles = new Map((listings ?? []).map((item) => [item.id, item.title]));
  const names = new Map((profiles ?? []).map((item) => [item.id, item.display_name]));
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <h1 className="flex items-center gap-3 text-3xl font-extrabold"><MessageCircle className="size-8 text-[#B88746]"/>Messages</h1>
    <p className="mt-2 text-sm text-stone-500">Chat directly with sellers and buyers about individual listings.</p>
    {error && <p className="error-text mt-6">Could not load conversations. Run migration 003 in Supabase SQL Editor.</p>}
    <div className="mt-7 space-y-3">{!error && rows.length === 0 && <p className="rounded-2xl border p-10 text-center text-stone-500">No conversations yet. Open a product and choose Chat with Seller.</p>}
      {rows.map((conversation) => {
        const partnerId = user.id === conversation.buyer_id ? conversation.seller_id : conversation.buyer_id;
        return <Link key={conversation.id} href={`/messages/${conversation.id}`} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-[#D0A352] hover:shadow-sm">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#F6EBDD] font-bold text-[#8E652E]">{names.get(partnerId)?.charAt(0).toUpperCase() || "M"}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{names.get(partnerId) || "Marketly member"}</p><p className="truncate text-sm text-stone-500">{titles.get(conversation.listing_id) || "Previously listed item"}</p></div>
          <span className="shrink-0 text-xs text-stone-400">{new Date(conversation.last_message_at).toLocaleDateString("en-LK")}</span>
        </Link>;
      })}
    </div>
  </div>;
}
