"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ConfirmRequest = {
  title: string; description: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean;
};
type ToastType = "success" | "error" | "info";
type UI = { confirm: (request: ConfirmRequest) => Promise<boolean>; toast: (message: string, kind?: ToastType) => void };
const UIContext = createContext<UI | null>(null);
type Toast = { id: number; text: string; kind: ToastType };

export function MarketlyUiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmRequest | null>(null);
  const [messages, setMessages] = useState<Toast[]>([]);
  const resolver = useRef<((result: boolean) => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const count = useRef(0);

  const resolve = useCallback((result: boolean) => {
    resolver.current?.(result); resolver.current = null;setDialog(null);
    previousFocus.current?.focus();
  }, []);

  const confirm = useCallback((request: ConfirmRequest) => {
    if (resolver.current) return Promise.resolve(false);
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(request);
    return new Promise<boolean>(done => { resolver.current = done; });
  }, []);

  const toast = useCallback((text: string, kind: ToastType = "info") => {
    const id = ++count.current;
    setMessages(old => [...old.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setMessages(old => old.filter(msg => msg.id !== id)), 4800);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    cancelRef.current?.focus();
    const closeOnKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); resolve(false); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled])'));
      if (!focusable.length) return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",closeOnKeyboard);
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown",closeOnKeyboard);document.body.style.overflow = prior; };
  }, [dialog, resolve]);

  return <UIContext.Provider value={{ confirm, toast }}>
    {children}
    {dialog && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#15171C]/65 px-4 py-8 backdrop-blur-[3px]" onMouseDown={event=>{if(event.target===event.currentTarget)resolve(false);}}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="marketly-dialog-title" aria-describedby="marketly-dialog-desc" className="w-full max-w-md overflow-hidden rounded-3xl border border-[#CFAE73]/40 bg-[#24272E] p-6 text-white shadow-[0_24px_85px_rgba(0,0,0,.4)] sm:p-7">
        <div className="flex items-start gap-3"><span className="rounded-2xl bg-[#CDA35C]/15 p-3 text-[#E8C787]"><AlertTriangle className="size-6"/></span><div className="flex-1"><h2 id="marketly-dialog-title" className="text-xl font-extrabold">{dialog.title}</h2><p id="marketly-dialog-desc" className="mt-3 text-sm leading-6 text-[#DADCE1]">{dialog.description}</p></div></div>
        <div className="mt-7 flex flex-wrap justify-end gap-3"><button ref={cancelRef} type="button" onClick={()=>resolve(false)} className="min-h-11 rounded-xl border border-white/25 px-5 text-sm font-bold text-white hover:bg-white/10">{dialog.cancelLabel || "Cancel"}</button>
          <button type="button" onClick={()=>resolve(true)} className={`min-h-11 rounded-xl px-5 text-sm font-bold ${dialog.destructive ? "bg-[#C1574E] text-white hover:bg-[#AD4840]" : "bg-[#D0A352] text-[#24272E] hover:bg-[#E0B96E]"}`}>{dialog.confirmLabel || "Continue"}</button></div>
      </div>
    </div>}
    <div className="pointer-events-none fixed bottom-5 right-4 z-[110] flex max-w-[calc(100vw-2rem)] flex-col gap-2 sm:right-6" role="status" aria-live="polite" aria-atomic="false">
      {messages.map(msg=><div key={msg.id} className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-2xl border border-[#E5D5BA] bg-white px-4 py-3 text-sm text-[#24272E] shadow-[0_10px_35px_rgba(0,0,0,.16)]">
        {msg.kind==="success"?<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700"/>:<Info className={`mt-0.5 size-5 shrink-0 ${msg.kind==="error"?"text-red-700":"text-[#A3722F]"}`}/>}
        <span className="flex-1">{msg.text}</span><button type="button" onClick={()=>setMessages(old=>old.filter(item=>item.id!==msg.id))} aria-label="Dismiss message" className="rounded p-1 hover:bg-stone-100"><X className="size-4"/></button>
      </div>)}
    </div>
  </UIContext.Provider>;
}
export function useMarketlyUi(): UI {
  const value=useContext(UIContext);
  if (!value) throw new Error("MarketlyUiProvider is missing");
  return value;
}
