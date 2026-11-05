"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
export function ReviewChatReport({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function change(status: "reviewed" | "dismissed") {
    setBusy(true); setError("");
    const { error: dbError } = await createBrowserSupabase().rpc("marketly_review_chat_report", { p_report_id: id, p_status: status });
    if (dbError) setError(dbError.message); else router.refresh();
    setBusy(false);
  }
  return <div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy} onClick={() => {void change("reviewed");}} className="rounded-lg border px-3 py-2 text-xs font-semibold">Mark reviewed</button>
    <button type="button" disabled={busy} onClick={() => {void change("dismissed");}} className="rounded-lg border px-3 py-2 text-xs font-semibold">Dismiss</button>
    {error && <span role="alert" className="w-full text-xs text-red-700">{error}</span>}
  </div>;
}
