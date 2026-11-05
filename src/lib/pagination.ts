export const LIST_PAGE_SIZE = 24;

/** Keep the input URL safe, stable, and bounded before calculating a DB range. */
export function readPage(input: string | undefined | null): number {
  const value = Number(input);
  return input && /^\d{1,5}$/.test(input) && Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10000) : 1;
}
export function pageRange(page: number, size = LIST_PAGE_SIZE) {
  const safe = Math.max(1, Math.min(Math.floor(page), 10000));
  return { from: (safe - 1) * size, to: safe * size - 1 };
}
export function totalPages(count: number | null | undefined, size = LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, count ?? 0) / size));
}
