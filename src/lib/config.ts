export const marketlyConfig = {
  brand: "Marketly", // provisional name; check trademark and domain rights
  freeAdsPerCalendarMonth: 3,
  freeImagesPerListing: 5,
  extraImagePriceLkr: 100,
  maxImagesPerListing: 12,
  maxImageBytes: 5 * 1024 * 1024,
  imageMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  boostPlans: [
    { id: "starter", days: 7, priceLkr: 100 },
    { id: "popular", days: 14, priceLkr: 180 },
    { id: "premium", days: 30, priceLkr: 300 },
  ] as const,
} as const;

export function formatLkr(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-LK")}`;
}
