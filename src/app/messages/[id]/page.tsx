import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { ChatRoom, type ChatState } from "@/components/market/chat-room";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

type ConversationListingMeta = { listing_title: string | null; listing_status: string | null };

function isConversationListingMeta(value: unknown): value is ConversationListingMeta {
  if (typeof value !== "object" || value === null) return false;
  if (!("listing_title" in value) || !("listing_status" in value)) return false;
  return (typeof value.listing_title === "string" || value.listing_title === null)
    && (typeof value.listing_status === "string" || value.listing_status === null);
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  if (!hasSupabaseConfig()) redirect("/login?error=setup");
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: conversation } = await supabase.from("conversations")
    .select("id,listing_id,buyer_id,seller_id").eq("id", id).maybeSingle();
  if (!conversation || (conversation.buyer_id !== user.id && conversation.seller_id !== user.id)) notFound();
  const partnerId = conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;
  const [{ data: partner }, { data: listing }, { data: chatState }, { data: messages }, { data: offers }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", partnerId).maybeSingle(),
    supabase.rpc("marketly_conversation_listing_meta", { p_conversation_id: id }).single(),
    supabase.rpc("marketly_chat_state", { p_conversation_id: id }),
    supabase.from("messages").select("id,sender_id,body,created_at,is_system,read_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("offers").select("id,buyer_id,amount_lkr,status,created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const listingMeta = isConversationListingMeta(listing) ? listing : null;
  const currentChatState = chatState && typeof chatState === "object" && "can_send" in chatState
    ? chatState as ChatState
    : { status: "removed", moderation: null, can_send: false, blocked_by_me: false, blocked_by_other: false };
  return <ChatRoom
    conversationId={id} myId={user.id} isBuyer={conversation.buyer_id === user.id}
    partnerName={partner?.display_name || "Marketly member"}
    listingTitle={listingMeta?.listing_title || "Previously listed item"}
    listingId={conversation.listing_id} initialChatState={currentChatState}
    initialMessages={[...(messages ?? [])].reverse()}
    initialOffers={(offers ?? []) as Array<{ id: string; buyer_id: string; amount_lkr: number; status: "pending" | "accepted" | "declined" | "withdrawn"; created_at: string }>}
  />;
}
