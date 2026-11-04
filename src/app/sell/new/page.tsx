import { sriLankaBillingMonth } from "@/lib/billing-month";
import type { Metadata } from "next";
import { SellForm } from "@/components/market/sell-form";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Post an advertisement" };
export const dynamic = "force-dynamic";

export default async function PostAdPage() {
  let canPublish = false;
  let quotaUsed = 0;
  if (hasSupabaseConfig()) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      canPublish = true;
      const month = sriLankaBillingMonth();
      const { count } = await supabase.from("listing_post_ledger").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("billing_month", month);
      quotaUsed = count ?? 0;
    }
  }
  return <div className="bg-[#FBFAF8] px-4 py-10 sm:px-6"><div className="mx-auto max-w-6xl"><div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-[#A3722F]">Start selling</p><h1 className="mt-2 text-3xl font-extrabold">Post a new ad</h1><p className="mt-2 text-[#68707C]">Simple details, real photos, transparent upload pricing.</p></div><SellForm canPublish={canPublish} quotaUsed={quotaUsed}/></div></div>;
}
