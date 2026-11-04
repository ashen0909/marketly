/** Billing months use Asia/Colombo local calendar time, including at month boundaries. */
export function sriLankaBillingMonth(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Colombo",year:"numeric",month:"2-digit"}).formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  if (!year || !month) throw new Error("Unable to format Sri Lankan billing month.");
  return `${year}-${month}-01`;
}
