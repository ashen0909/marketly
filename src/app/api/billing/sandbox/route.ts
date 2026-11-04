import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), kind: z.enum(["extra_ad", "boost", "photos", "business"]),
    listingId: z.string().uuid().nullable().optional(),
    planId: z.enum(["starter", "popular", "premium"]).nullable().optional(),
    photoCount: z.number().int().min(6).max(12).nullable().optional(),
    requestKey: z.string().uuid(),
    outcome: z.enum(["success", "failure"]) }),
  z.object({ action: z.literal("consume_credit") }),
]);
const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });

/** Sandbox writes are permitted on a LOCAL DEV SERVER ONLY; there is no gateway and no real money. */
function sandboxEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.MARKETLY_SANDBOX_ENABLED === "true";
}
function serverOnlyClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) throw new Error("Server sandbox key not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  if (!sandboxEnabled()) return reply("Sandbox is disabled. No real payments are available.", 403);
  if (!hasSupabaseConfig()) return reply("Database not configured", 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply("Cross-origin request blocked", 403);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply("Invalid sandbox request", 400);
  const db = await createServerSupabase();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return reply("Please sign in", 401);
  try {
    const admin = serverOnlyClient();
    if (parsed.data.action === "consume_credit") {
      const { data, error } = await admin.rpc("marketly_sandbox_consume_credit", { p_user_id: user.id });
      if (error) return reply(error.message, 400);
      return NextResponse.json({ used: Boolean(data), sandbox: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const order = parsed.data;
    const { data: id, error: startError } = await admin.rpc("marketly_sandbox_start_checkout", {
      p_user_id: user.id,
      p_kind: order.kind,
      p_listing_id: order.kind === "boost" ? (order.listingId ?? null) : null,
      p_plan_id: order.kind === "boost" ? (order.planId ?? null) : null,
      p_photo_count: order.kind === "photos" ? (order.photoCount ?? null) : null,
      p_request_key: order.requestKey,
    });
    if (startError || !id) return reply(startError?.message ?? "Unable to create sandbox order", 400);

    // Check the order belongs to the authenticated user before server-privileged simulation.
    const { data: ownedOrder, error: ownershipError } = await db.from("marketly_sandbox_payments")
      .select("id,status,amount_lkr").eq("id", id).eq("user_id", user.id).single();
    if (ownershipError || !ownedOrder) return reply("Sandbox order cannot be verified", 403);

    // Mock gateway callback only; no provider request, card collection or LIVE entitlement.
    const { data: status, error: verifyError } = await admin.rpc("marketly_sandbox_record_result", {
      p_payment_id: id, p_success: order.outcome === "success",
    });
    if (verifyError) return reply(verifyError.message, 400);
    return NextResponse.json({ id, status, amountLkr: Number(ownedOrder.amount_lkr), sandbox: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[Marketly] sandbox request failed", error instanceof Error ? error.message : "Unknown error");
    return reply("Sandbox processing failed; check server configuration", 503);
  }
}
