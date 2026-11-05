"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Notification = {
  id: string; kind: string; title: string;
  conversation_id: string | null; listing_id: string | null;
  created_at: string; read_at: string | null;
};

/** Mark only the notifications actually shown on this page as read after viewing it. */
export function NotificationsList({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setItems(initial);
    const unreadIds = initial.filter(item => !item.read_at).map(item => item.id);
    if (!unreadIds.length) return () => { active = false; };

    async function markVisibleNotificationsRead() {
      // RPC verifies auth.uid() = recipient_id; browser cannot mark other users' alerts.
      const { error: dbError } = await createBrowserSupabase().rpc("mark_notifications_read", { p_ids: unreadIds });
      if (!active) return;
      if (dbError) { setError("Could not update read status. Please refresh and try again."); return; }
      const now = new Date().toISOString();
      setItems(previous => previous.map(item => unreadIds.includes(item.id) ? { ...item, read_at: now } : item));
      // Update the header badge immediately instead of waiting for a 20-second poll.
      window.dispatchEvent(new Event("marketly:notifications-updated"));
    }
    void markVisibleNotificationsRead();
    return () => { active = false; };
  }, [initial]);

  return <div className="space-y-3">
    {error && <p role="alert" className="error-text">{error}</p>}
    {!items.length ? <p className="rounded-2xl border p-10 text-center text-stone-500">No notifications yet.</p> : items.map(item => <div key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${item.read_at ? "bg-white" : "border-[#DFC59A] bg-[#FFFBF4]"}`}>
      <div><p className="font-semibold">{item.title}</p><p className="mt-1 text-xs text-stone-500">{new Date(item.created_at).toLocaleString("en-LK")}</p></div>
      <div className="flex items-center gap-3">
        {item.kind === "admin_chat_report" ? <Link className="text-sm font-semibold underline" href="/admin/chat-reports">Review report</Link>
          : item.conversation_id ? <Link className="text-sm font-semibold underline" href={`/messages/${item.conversation_id}`}>View chat</Link>
          : item.listing_id ? <Link className="text-sm font-semibold underline" href={`/listings/${item.listing_id}`}>View ad</Link>
          : item.kind.startsWith("admin_") ? <Link className="text-sm font-semibold underline" href="/admin">Open admin</Link> : null}
      </div>
    </div>)}
  </div>;
}
