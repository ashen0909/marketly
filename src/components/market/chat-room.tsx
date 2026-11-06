"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { userFacingError } from "@/lib/user-facing-error";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Tag, ShieldAlert, LockKeyhole, CheckCheck, ChevronUp } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { formatLkr } from "@/lib/config";

type Message = { id: string; sender_id: string; body: string; created_at: string; is_system?: boolean; read_at?: string | null };
type Offer = { id: string; buyer_id: string; amount_lkr: number; status: "pending" | "accepted" | "declined" | "withdrawn"; created_at: string };
export type ChatState = { status: string; moderation: string | null; can_send: boolean; blocked_by_me: boolean; blocked_by_other: boolean; expires_at?: string | null };
const PAGE_SIZE = 30;

export function ChatRoom({ conversationId, myId, isBuyer, partnerName, listingTitle, listingId, initialChatState, initialMessages, initialOffers }: {
  conversationId: string; myId: string; isBuyer: boolean; partnerName: string; listingTitle: string; listingId: string;
  initialChatState: ChatState; initialMessages: Message[]; initialOffers: Offer[];
}) {
  const router = useRouter();
  const [renderNow] = useState(() => Date.now());
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [offers, setOffers] = useState<Offer[]>(initialOffers);
  const [state, setState] = useState<ChatState>(initialChatState);
  const [hasEarlier, setHasEarlier] = useState(initialMessages.length >= PAGE_SIZE);
  const [moreBusy, setMoreBusy] = useState(false);
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState("Connecting...");
  const [reportReason, setReportReason] = useState("spam");
  const [showReport, setShowReport] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const previouslyLoaded = useRef(new Set(initialMessages.map(m => m.id)));

  const reload = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const [messagesResult, offersResult, stateResult] = await Promise.all([
      supabase.from("messages").select("id,sender_id,body,created_at,is_system,read_at")
        .eq("conversation_id", conversationId).order("created_at", { ascending: false }).range(0, PAGE_SIZE - 1),
      supabase.from("offers").select("id,buyer_id,amount_lkr,status,created_at")
        .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(30),
      supabase.rpc("marketly_chat_state", { p_conversation_id: conversationId }),
    ]);
    if (!messagesResult.error) {
      const latest = [...((messagesResult.data ?? []) as Message[])].reverse();
      setMessages(prev => {
        // Reconcile read receipts and retain older manually loaded history.
        const map = new Map(prev.map(m => [m.id, m]));
        for (const m of latest) map.set(m.id, m);
        return [...map.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      });
    }
    if (!offersResult.error) setOffers((offersResult.data ?? []) as Offer[]);
    if (!stateResult.error && stateResult.data && typeof stateResult.data === "object") setState(stateResult.data as ChatState);
    if (messagesResult.error || offersResult.error || stateResult.error) setConnection("Connection issue — retrying");
    else {
      // Read receipts are applied by the receiver only, via an authenticated RPC.
      await supabase.rpc("marketly_mark_chat_read", { p_conversation_id: conversationId });
    }
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    const client = createBrowserSupabase();
    queueMicrotask(() => { if (alive) void reload(); });
    const channel = client.channel(`marketly-chat-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => { if (alive) void reload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "offers", filter: `conversation_id=eq.${conversationId}` }, () => { if (alive) void reload(); })
      .subscribe(status => { if (alive) setConnection(status === "SUBSCRIBED" ? "Live updates active" : "Refreshing periodically"); });
    const timer = window.setInterval(() => { if (alive) void reload(); }, 12000);
    return () => { alive = false; window.clearInterval(timer); void client.removeChannel(channel); };
  }, [conversationId, reload]);

  useEffect(() => {
    const last = messages[messages.length-1];
    if (!last || previouslyLoaded.current.has(last.id)) return;
    previouslyLoaded.current.add(last.id);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  async function loadEarlier() {
    setMoreBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { data, error: dbError } = await supabase.from("messages")
      .select("id,sender_id,body,created_at,is_system,read_at").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).range(messages.length, messages.length + PAGE_SIZE - 1);
    if (dbError) setError(userFacingError(dbError, "message"));
    else {
      const earlier = (data ?? []) as Message[];
      setHasEarlier(earlier.length >= PAGE_SIZE);
      setMessages(prev => {
        const map = new Map([...prev, ...earlier].map(m => [m.id, m]));
        return [...map.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      });
    }
    setMoreBusy(false);
  }

  async function send(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const text = body.trim();
    if (!text || text.length > 2000 || busy || !state.can_send) return;
    setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("send_message", { p_conversation_id: conversationId, p_body: text });
      if (dbError) throw dbError;
      setBody(""); await reload();
    } catch (err) { setError(userFacingError(err, "message")); await reload(); }
    finally { setBusy(false); }
  }

  async function submitOffer(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const value = Number(amount);
    if (!state.can_send) return;
    if (!Number.isSafeInteger(value) || value < 1 || value > 999999999) { setError("Enter a valid price in LKR."); return; }
    setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("make_offer", { p_conversation_id: conversationId, p_amount_lkr: value });
      if (dbError) throw dbError;
      setAmount(""); setNotice("Offer sent. The seller can accept or decline it."); await reload();
    } catch (err) { setError(userFacingError(err, "message")); await reload(); }
    finally { setBusy(false); }
  }

  async function respond(id: string, accept: boolean) {
    setError(""); setNotice(""); setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("respond_to_offer", { p_offer_id: id, p_accept: accept });
      if (dbError) throw dbError;
      setNotice(accept ? "Offer accepted. Arrange collection/payment safely with the buyer; this is NOT a completed purchase." : "Offer declined.");
      await reload(); router.refresh();
    } catch (err) { setError(userFacingError(err, "message")); }
    finally { setBusy(false); }
  }

  async function withdraw(id: string) {
    setError(""); setBusy(true);
    try {
      const { error: dbError } = await createBrowserSupabase().rpc("withdraw_offer", { p_offer_id: id });
      if (dbError) throw dbError;
      await reload();
    } catch (err) { setError(userFacingError(err, "message")); }
    finally { setBusy(false); }
  }

  async function toggleBlock() {
    setError("");setNotice("");setBusy(true);
    const { error: dbError } = await createBrowserSupabase().rpc("marketly_set_chat_block", { p_conversation_id: conversationId, p_block: !state.blocked_by_me });
    if (dbError) setError(userFacingError(dbError, "message")); else { setNotice(state.blocked_by_me ? "This conversation is unblocked." : "User blocked in this conversation. Chat history is preserved."); await reload(); }
    setBusy(false);
  }

  async function reportConversation(event: FormEvent) {
    event.preventDefault();setBusy(true);setError("");setNotice("");
    const {error:dbError}=await createBrowserSupabase().rpc("marketly_report_chat",{p_conversation_id:conversationId,p_reason:reportReason,p_details:""});
    if (dbError) setError(userFacingError(dbError, "message")); else {setNotice("Report submitted for admin review.");setShowReport(false);}
    setBusy(false);
  }

  const isSold = state.status === "sold";
  const isAvailableForOffers = state.can_send;
  const pending = offers.find(item => item.status === "pending");
  const closedText = state.blocked_by_me ? "You blocked this conversation. Unblock to chat when the ad is available."
    : state.blocked_by_other ? "This conversation has been blocked. Messages and offers are unavailable."
    : isSold ? "SOLD — this conversation is closed. The complete chat history is saved. Chat reopens after the seller relists and admin approves."
    : state.status === "deleted" ? "This advertisement was deleted. Chat history is preserved, but new messages are disabled."
    : state.status === "removed" ? "This advertisement is paused. Chat resumes if relisted and approved."
    : state.expires_at && new Date(state.expires_at).getTime() <= renderNow ? "This ad has expired. Chat resumes after renewal and admin approval."
    : "This advertisement is awaiting approval or is unavailable. Chat is temporarily closed.";
  return <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
    <Link href="/messages" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8B642B]"><ArrowLeft className="size-4"/>All messages</Link>
    <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#FBF9F5] p-5">
        <div><h1 className="text-xl font-extrabold">{partnerName}</h1><Link href={`/listings/${listingId}`} className="mt-1 block text-sm text-[#86612D] hover:underline">{listingTitle}</Link></div>
        <div className="flex items-center gap-2">{isSold&&<span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">SOLD</span>}{!state.can_send&&<LockKeyhole className="size-4 text-red-700"/>}<span className="text-xs text-stone-500" role="status">{connection}</span></div>
      </div>
      {hasEarlier && <div className="border-b bg-[#FBFAF8] py-2 text-center"><button type="button" onClick={() => {void loadEarlier();}} disabled={moreBusy} className="inline-flex items-center gap-1 text-xs font-semibold text-[#85602A] hover:underline"><ChevronUp className="size-3"/>{moreBusy?"Loading...":"Load earlier messages"}</button></div>}
      <div role="log" aria-label="Conversation messages" className="flex h-[440px] flex-col gap-3 overflow-y-auto bg-[#FAF9F7] px-4 py-5 sm:px-6">
        {!messages.length && <p className="m-auto text-center text-sm text-stone-500">No messages yet. Say hello and ask about the item.</p>}
        {messages.map(message => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[75%] ${message.is_system ? "mx-auto max-w-[95%] border border-amber-200 bg-amber-50 text-amber-950" : message.sender_id === myId ? "ml-auto bg-[#24272E] text-white" : "mr-auto border bg-white text-[#24272E]"}`}>
          {message.is_system&&<p className="mb-1 text-[11px] font-extrabold uppercase tracking-widest">Marketly system update</p>}<p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
          <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${message.is_system ? "text-amber-700" : message.sender_id === myId ? "text-white/65" : "text-stone-500"}`}>{new Date(message.created_at).toLocaleString("en-LK", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}{message.sender_id===myId&&!message.is_system&&message.read_at&&<span title="Read"><CheckCheck className="size-3"/></span>}</p>
        </div>)}
        <div ref={endRef}/>
      </div>
      {!state.can_send && <p role="status" className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{closedText}</p>}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-stone-200 p-3 sm:p-4">
        <label htmlFor="chat-message" className="sr-only">Message</label>
        <textarea id="chat-message" rows={2} maxLength={2000} required disabled={!state.can_send||busy} value={body} onChange={event => setBody(event.target.value)} placeholder={state.can_send?"Type a message...":"Chat closed — history is read-only"} className="min-w-0 flex-1 resize-none rounded-xl border border-stone-300 p-3 text-sm outline-[#B88746] disabled:bg-stone-100 disabled:text-stone-500" />
        <Button type="submit" disabled={busy || !body.trim() || !state.can_send}><Send className="size-4"/><span className="hidden sm:inline">Send</span></Button>
      </form>
      {state.can_send && <div className="flex flex-wrap gap-2 border-t px-4 py-3 text-xs">{(isBuyer ? ["Is this still available?", "Can we arrange a viewing?", "Is the price negotiable?"] : ["Yes, it is available.", "Please arrange a time to view.", "Thank you for your interest."]).map(reply => <button type="button" key={reply} onClick={() => setBody(reply)} className="rounded-full border px-3 py-1 hover:bg-amber-50">{reply}</button>)}</div>}
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-xs">
        <button type="button" disabled={busy} onClick={() => {void toggleBlock();}} className="font-semibold text-red-700">{state.blocked_by_me?"Unblock user":"Block user"}</button>
        <button type="button" onClick={() => setShowReport(value=>!value)} className="inline-flex items-center gap-1 font-semibold text-stone-600"><ShieldAlert className="size-3"/>Report chat</button>
        {showReport && <form onSubmit={reportConversation} className="flex w-full flex-wrap items-center gap-2"><select value={reportReason} onChange={e=>setReportReason(e.target.value)} className="rounded-lg border p-2"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="scam">Scam</option><option value="other">Other</option></select><button type="submit" disabled={busy} className="rounded-lg bg-stone-800 px-3 py-2 font-semibold text-white">Submit report</button></form>}
      </div>
    </div>
    {error && <p className="error-text mt-4" role="alert">{error}</p>}
    {notice && <p className="success-text mt-4" role="status">{notice}</p>}
    <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Tag className="size-5 text-[#A3722F]"/>Price offers</h2>
      {!state.can_send&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{closedText} New offers are disabled.</p>}
      <p className="mt-2 text-xs text-stone-500">Offers are negotiations only. No money is collected, and accepting does not mark an item sold.</p>
      {isBuyer && !pending && isAvailableForOffers && <form onSubmit={submitOffer} className="mt-4 flex flex-wrap items-end gap-3">
        <div><label htmlFor="offer-amount" className="field-label">Your offer (LKR)</label><input id="offer-amount" type="number" inputMode="numeric" min={1} max={999999999} required value={amount} onChange={e=>setAmount(e.target.value)} className="field-control w-48" placeholder="e.g. 75000" /></div>
        <Button type="submit" disabled={busy}>Make an Offer</Button>
      </form>}
      <div className="mt-4 space-y-3">{offers.length===0&&<p className="text-sm text-stone-500">No offers made yet.</p>}
        {offers.map(offer=><div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF9F7] p-4">
          <div><p className="font-bold">{formatLkr(Number(offer.amount_lkr))}</p><p className="text-xs capitalize text-stone-500">{offer.status} · {new Date(offer.created_at).toLocaleDateString("en-LK")}</p></div>
          {offer.status==="pending"&&isAvailableForOffers&&<div className="flex gap-2">{isBuyer?<button type="button" disabled={busy} onClick={()=>{void withdraw(offer.id);}} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-stone-100">Withdraw</button>:<><button type="button" disabled={busy} onClick={()=>{void respond(offer.id,false);}} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-stone-100">Decline</button><button type="button" disabled={busy} onClick={()=>{void respond(offer.id,true);}} className="rounded-lg bg-[#B88746] px-3 py-2 text-xs font-bold text-white hover:bg-[#9F722F]">Accept</button></>}</div>}
        </div>)}
      </div>
    </section>
    <p className="mt-5 rounded-xl bg-[#FFF5E5] p-4 text-xs leading-relaxed text-[#71501F]">Safety: Do not send OTPs, card details or deposits to unknown sellers. Inspect products and documents before arranging payment. Marketly does not handle purchase payments or offer escrow.</p>
  </div>;
}
