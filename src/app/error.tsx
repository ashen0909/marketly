"use client";
import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(()=>{console.error("[Marketly] unexpected page error",error.digest||error.message);},[error]);
  return <section className="mx-auto max-w-xl px-4 py-20 text-center" role="alert">
    <AlertCircle className="mx-auto size-12 text-[#B88746]"/>
    <h1 className="mt-5 text-2xl font-extrabold">This page could not load</h1>
    <p className="mt-3 text-sm text-stone-600">Your data has not been intentionally deleted. Check your connection or try again.</p>
    <button type="button" onClick={reset} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#24272E] px-5 font-bold text-white"><RefreshCw className="size-4"/> Try again</button>
  </section>;
}
