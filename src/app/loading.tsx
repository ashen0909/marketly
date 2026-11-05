export default function Loading() {
  return <div className="mx-auto max-w-7xl animate-pulse px-4 py-12 sm:px-6" role="status" aria-label="Loading Marketly page">
    <div className="h-8 w-60 rounded-xl bg-stone-200"/><div className="mt-3 h-4 w-80 max-w-full rounded-lg bg-stone-100"/>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({length:6},(_,i)=><div key={i} className="overflow-hidden rounded-2xl border border-stone-100"><div className="aspect-[1.6] bg-stone-100"/><div className="space-y-3 p-4"><div className="h-4 w-3/4 rounded bg-stone-200"/><div className="h-4 w-1/2 rounded bg-stone-100"/></div></div>)}</div>
    <span className="sr-only">Loading…</span>
  </div>;
}
