"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Tag } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { formatLkr } from "@/lib/config";

type Message = { id: string; sender_id: string; body: string; created_at: string; is_system?: boolean };
type Offer = { id: string; buyer_id: string; amount_lkr: number; status: "pending" | "accepted" | "declined" | "withdrawn"; created_at: string };

export function ChatRoom({ conversationId, myId, isBuyer, partnerName, listingTitle, listingId, listingStatus, initialMessages, initialOffers }: {
  conversationId: string; myId: string; isBuyer: boolean; partnerName: string; listingTitle: string; listingId: string; listingStatus: string;
  initialMessages: Message[]; initialOffers: Offer[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState("Connecting...");
  const endRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const [messagesResult, offersResult] = await Promise.all([
      supabase.from("messages").select("id,sender_id,body,created_at,is_system").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(100),
      supabase.from("offers").select("id,buyer_id,amount_lkr,status,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(30),
    ]);
    if (!messagesResult.error) setMessages([...((messagesResult.data ?? []) as Message[])].reverse());
    if (!offersResult.error) setOffers((offersResult.data ?? []) as Offer[]);
    if (messagesResult.error || offersResult.error) setConnection("Connection issue — retrying");
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    const client = createBrowserSupabase();
    const channel = client.channel(`marketly-chat-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => { if (alive) void reload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "offers", filter: `conversation_id=eq.${conversationId}` }, () => { if (alive) void reload(); })
      .subscribe((status) => { if (alive) setConnection(status === "SUBSCRIBED" ? "Live updates active" : "Refreshing periodically"); });
    const timer = window.setInterval(() => { if (alive) void reload(); }, 12000);
    return () => { alive = false; window.clearInterval(timer); void client.removeChannel(channel); };
  }, [conversationId, reload]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const text = body.trim();
    if (!text || text.length > 2000 || busy) return;
    setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("send_message", { p_conversation_id: conversationId, p_body: text });
      if (dbError) throw dbError;
      setBody(""); await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send your message."); }
    finally { setBusy(false); }
  }

  async function submitOffer(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 1 || value > 999999999) { setError("Enter a valid price in LKR."); return; }
    setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("make_offer", { p_conversation_id: conversationId, p_amount_lkr: value });
      if (dbError) throw dbError;
      setAmount(""); setNotice("Offer sent. The seller can accept or decline it."); await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send the offer."); }
    finally { setBusy(false); }
  }

  async function respond(id: string, accept: boolean) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("respond_to_offer", { p_offer_id: id, p_accept: accept });
      if (dbError) throw dbError;
      setNotice(accept ? "Offer accepted. Arrange collection/payment safely with the buyer; this is NOT a completed purchase." : "Offer declined.");
      await reload(); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not respond to offer."); }
    finally { setBusy(false); }
  }

  async function withdraw(id: string) {
    setError(""); setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("withdraw_offer", { p_offer_id: id });
      if (dbError) throw dbError;
      await reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not withdraw offer."); }
    finally { setBusy(false); }
  }

  const isSold = listingStatus === "sold" || messages.some(m => m.is_system && m.body.startsWith("Marketly system notice:"));
  const isAvailableForOffers = listingStatus === "active" && !isSold;
  const pending = offers.find((item) => item.status === "pending");
  return <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
    <Link href="/messages" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8B642B]"><ArrowLeft className="size-4"/>All messages</Link>
    <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#FBF9F5] p-5">
        <div><h1 className="text-xl font-extrabold">{partnerName}</h1><Link href={`/listings/${listingId}`} className="mt-1 block text-sm text-[#86612D] hover:underline">{listingTitle}</Link></div>
        <div className="flex items-center gap-2">{isSold&&<span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">SOLD</span>}<span className="text-xs text-stone-500" role="status">{connection}</span></div>
      </div>
      <div role="log" aria-label="Conversation messages" className="flex h-[440px] flex-col gap-3 overflow-y-auto bg-[#FAF9F7] px-4 py-5 sm:px-6">
        {!messages.length && <p className="m-auto text-center text-sm text-stone-500">No messages yet. Say hello and ask about the item.</p>}
        {messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[75%] ${message.is_system ? "mx-auto max-w-[95%] border border-amber-200 bg-amber-50 text-amber-950" : message.sender_id === myId ? "ml-auto bg-[#24272E] text-white" : "mr-auto border bg-white text-[#24272E]"}`}>
          {message.is_system&&<p className="mb-1 text-[11px] font-extrabold uppercase tracking-widest">Marketly system update</p>}<p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
          <p className={`mt-1 text-right text-[10px] ${message.is_system ? "text-amber-700" : message.sender_id === myId ? "text-white/65" : "text-stone-500"}`}>{new Date(message.created_at).toLocaleString("en-LK", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</p>
        </div>)}
        <div ref={endRef}/>
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-stone-200 p-3 sm:p-4">
        <label htmlFor="chat-message" className="sr-only">Message</label>
        <textarea id="chat-message" rows={2} maxLength={2000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Type a message..." className="min-w-0 flex-1 resize-none rounded-xl border border-stone-300 p-3 text-sm outline-[#B88746]" />
        <Button type="submit" disabled={busy || !body.trim()}><Send className="size-4"/><span className="hidden sm:inline">Send</span></Button>
      </form>
    </div>
    {error && <p className="error-text mt-4" role="alert">{error}</p>}
    {notice && <p className="success-text mt-4" role="status">{notice}</p>}
    <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Tag className="size-5 text-[#A3722F]"/>Price offers</h2>
      {isSold&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">Seller marked this item as sold. Previous messages remain available, but new offers are disabled.</p>}<p className="mt-2 text-xs text-stone-500">Offers are a negotiation only. No money is collected, and accepting does not mark an item sold.</p>
      {isBuyer && !pending && isAvailableForOffers && <form onSubmit={submitOffer} className="mt-4 flex flex-wrap items-end gap-3">
        <div><label htmlFor="offer-amount" className="field-label">Your offer (LKR)</label><input id="offer-amount" type="number" inputMode="numeric" min={1} max={999999999} required value={amount} onChange={(e) => setAmount(e.target.value)} className="field-control w-48" placeholder="e.g. 75000" /></div>
        <Button type="submit" disabled={busy}>Make an Offer</Button>
      </form>}
      <div className="mt-4 space-y-3">{offers.length === 0 && <p className="text-sm text-stone-500">No offers made yet.</p>}
        {offers.map((offer) => <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF9F7] p-4">
          <div><p className="font-bold">{formatLkr(Number(offer.amount_lkr))}</p><p className="text-xs capitalize text-stone-500">{offer.status} · {new Date(offer.created_at).toLocaleDateString("en-LK")}</p></div>
          {offer.status === "pending" && isAvailableForOffers && <div className="flex gap-2">{isBuyer ? <button type="button" disabled={busy} onClick={() => { void withdraw(offer.id); }} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-stone-100">Withdraw</button> : <><button type="button" disabled={busy} onClick={() => { void respond(offer.id, false); }} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-stone-100">Decline</button><button type="button" disabled={busy} onClick={() => { void respond(offer.id, true); }} className="rounded-lg bg-[#B88746] px-3 py-2 text-xs font-bold text-white hover:bg-[#9F722F]">Accept</button></>}</div>}
        </div>)}
      </div>
    </section>
    <p className="mt-5 rounded-xl bg-[#FFF5E5] p-4 text-xs leading-relaxed text-[#71501F]">Safety: Do not send OTPs, card details or deposits to unknown sellers. Inspect products and documents before arranging payment. Marketly does not handle purchase payments or offer escrow.</p>
  </div>;
}
