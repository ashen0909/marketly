import Link from "next/link";

export function PaginationControls({ path, page, pages, query = {} }: {
  path: string; page: number; pages: number; query?: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value && key !== "page") params.set(key, value);
    params.set("page", String(target));
    return `${path}?${params.toString()}`;
  };
  const first = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(pages, 5) }, (_, i) => first + i);
  return <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm">
    {page > 1 && <Link href={href(page - 1)} className="rounded-lg border px-3 py-2 font-semibold hover:bg-amber-50">← Previous</Link>}
    {numbers.map(num => <Link key={num} href={href(num)} aria-current={num === page ? "page" : undefined}
      className={`rounded-lg border px-3 py-2 font-semibold ${num === page ? "border-[#B88746] bg-[#24272E] text-white" : "hover:bg-amber-50"}`}>{num}</Link>)}
    {page < pages && <Link href={href(page + 1)} className="rounded-lg border px-3 py-2 font-semibold hover:bg-amber-50">Next →</Link>}
    <span className="ml-2 text-xs text-stone-500">Page {page} of {pages}</span>
  </nav>;
}
