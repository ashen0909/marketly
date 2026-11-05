import { LoaderCircle } from "lucide-react";

export function RouteLoading({ title = "Loading Marketly", cards = 3 }: { title?: string; cards?: number }) {
  return <section role="status" aria-label={title} className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
    <div className="flex items-center gap-3 text-sm font-semibold text-[#926726]"><LoaderCircle className="size-5 animate-spin" aria-hidden="true"/>{title}</div>
    <div aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({length:cards},(_,i)=><div key={i} className="overflow-hidden rounded-2xl border border-[#EAE5DC] bg-white shadow-sm"><div className="aspect-[1.65] animate-pulse bg-[#F3F0E9]"/><div className="space-y-3 p-4"><div className="h-4 w-4/5 animate-pulse rounded bg-[#EDE8DD]"/><div className="h-4 w-2/5 animate-pulse rounded bg-[#F1EEE9]"/></div></div>)}
    </div>
  </section>;
}
