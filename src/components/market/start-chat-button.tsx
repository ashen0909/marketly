"use client";

import { useState } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { createBrowserSupabase, hasSupabaseConfig } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function StartChatButton({ listingId, sellerId, sample }: { listingId: string; sellerId: string | null; sample?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setError("");
    if (sample || !sellerId || !hasSupabaseConfig()) return;
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push(`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`); return; }
      if (user.id === sellerId) { router.push("/dashboard"); return; }
      const { data, error: dbError } = await supabase.rpc("start_conversation", { p_listing_id: listingId });
      if (dbError) throw dbError;
      router.push(`/messages/${data}`);
    } catch (err) { setError(userFacingError(err, "message")); }
    finally { setBusy(false); }
  }
  return <div><Button type="button" onClick={start} disabled={busy || !!sample || !sellerId} className="w-full"><MessageCircle className="size-4" />{busy ? "Opening chat..." : "Chat with Seller"}</Button>{error && <p role="alert" className="error-text mt-2">{error}</p>}</div>;
}
