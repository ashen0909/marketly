import { marketlyConfig } from "./config";

export type SandboxKind = "extra_ad" | "boost" | "photos" | "business";
export type SandboxOrder = {
  kind: SandboxKind;
  listingId?: string | null;
  planId?: "starter" | "popular" | "premium" | null;
  photoCount?: number | null;
};

/** UI quote only; the database separately calculates authoritative prices. */
export function quoteSandboxOrder(order: SandboxOrder): number {
  switch (order.kind) {
    case "extra_ad":
      return 100;
    case "business":
      return 300;
    case "boost": {
      const plan = marketlyConfig.boostPlans.find((p) => p.id === order.planId);
      if (!plan) throw new RangeError("Invalid boost plan");
      return plan.priceLkr;
    }
    case "photos": {
      const count = order.photoCount;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 6 || count > marketlyConfig.maxImagesPerListing) {
        throw new RangeError("Paid photo count must be between 6 and the maximum");
      }
      return (count - marketlyConfig.freeImagesPerListing) * marketlyConfig.extraImagePriceLkr;
    }
  }
}
