"use client";
import { useState } from "react";
import Link from "next/link";
import { UserPlus, UserCheck } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function FollowSellerButton({ sellerId, signedIn, initialFollowing }: {
  sellerId: string; signedIn: boolean; initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!signedIn) return <Link href="/login" className="ml-auto rounded-xl border border-[#CDA560] px-4 py-2 text-sm font-semibold text-[#80591F]">Sign in to follow</Link>;
  return <div className="ml-auto shrink-0">
    <button disabled={busy} type="button" onClick={async () => {
      setBusy(true); setError("");
      const { data, error: dbError } = await createBrowserSupabase().rpc("marketly_toggle_seller_follow", { p_seller_id: sellerId });
      if (dbError) setError(dbError.message); else setFollowing(Boolean(data));
      setBusy(false);
    }} className="inline-flex items-center gap-2 rounded-xl border border-[#CDA560] px-4 py-2 text-sm font-semibold text-[#80591F] hover:bg-amber-50 disabled:opacity-50">
      {following ? <UserCheck className="size-4"/> : <UserPlus className="size-4"/>}{busy ? "Saving..." : following ? "Following" : "Follow Seller"}
    </button>
    {error && <p role="alert" className="max-w-40 text-xs text-red-700">{error}</p>}
  </div>;
}
