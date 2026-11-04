"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Notification = { id: string; kind: string; title: string; conversation_id: string | null; listing_id: string | null; created_at: string; read_at: string | null };
export function NotificationsList({ initial }: { initial: Notification[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function markRead(ids: string[]) {
    if (!ids.length) return;
    setBusy(true); setError("");
    const { error: dbError } = await createBrowserSupabase().rpc("mark_notifications_read", { p_ids: ids });
    if (dbError) setError(dbError.message);
    else {
      const now = new Date().toISOString();
      setItems((previous) => previous.map((item) => ids.includes(item.id) ? { ...item, read_at: now } : item));
      router.refresh();
    }
    setBusy(false);
  }
  return <div className="space-y-3">
    <div className="flex justify-end"><button type="button" disabled={busy || !items.some(x => !x.read_at)} onClick={() => { void markRead(items.filter(x => !x.read_at).map(x => x.id)); }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-40"><CheckCheck className="size-4"/>Mark all as read</button></div>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!items.length ? <p className="rounded-2xl border p-10 text-center text-stone-500">No notifications yet.</p> : items.map((item) => <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${item.read_at ? "bg-white" : "border-[#DFC59A] bg-[#FFFBF4]"}`}>
      <div><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-stone-500">{new Date(item.created_at).toLocaleString("en-LK")}</p></div>
      <div className="flex items-center gap-3">{!item.read_at && <button type="button" disabled={busy} onClick={() => { void markRead([item.id]); }} className="text-xs font-semibold text-[#946926] hover:underline">Mark read</button>}{item.conversation_id ? <Link className="text-sm font-semibold underline" href={`/messages/${item.conversation_id}`}>View chat</Link> : item.listing_id ? <Link className="text-sm font-semibold underline" href={`/listings/${item.listing_id}`}>View ad</Link> : item.kind.startsWith("admin_") ? <Link className="text-sm font-semibold underline" href="/admin">Open admin</Link> : null}</div>
    </div>)}
  </div>;
}
