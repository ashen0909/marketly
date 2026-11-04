"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function NotificationBell({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const client = createBrowserSupabase();
    async function reload() {
      const { count: unread, error } = await client.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null);
      if (live && !error) setCount(unread ?? 0);
    }
    void reload();
    const channel = client.channel(`marketly-notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => { void reload(); })
      .subscribe();
    const timer = window.setInterval(() => { void reload(); }, 20000);
    return () => { live = false; window.clearInterval(timer); void client.removeChannel(channel); };
  }, [userId]);
  return <Link href="/notifications" className="relative inline-flex items-center justify-center rounded-full p-1 text-white/85 hover:text-[#E4BD76]" aria-label={`${count} unread notifications`} title="Notifications">
    <Bell className="size-5" />{count > 0 && <span className="absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full bg-[#C79547] px-1 text-[10px] font-bold text-[#24272E]">{count > 99 ? "99+" : count}</span>}
  </Link>;
}
