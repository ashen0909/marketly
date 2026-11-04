import { marketlyConfig } from "./config";

export type ImageQuote = {
  imageCount: number;
  freeImageCount: number;
  extraImageCount: number;
  extraImageTotalLkr: number;
  canPublishWithoutPayment: boolean;
};

/** Display-only quote; the database and API MUST independently enforce the policy. */
export function quoteListingImages(imageCount: number): ImageQuote {
  if (!Number.isInteger(imageCount) || imageCount < 0 || imageCount > marketlyConfig.maxImagesPerListing) {
    throw new RangeError(`Choose between 0 and ${marketlyConfig.maxImagesPerListing} photos.`);
  }
  const freeImageCount = Math.min(imageCount, marketlyConfig.freeImagesPerListing);
  const extraImageCount = Math.max(0, imageCount - marketlyConfig.freeImagesPerListing);
  return {
    imageCount,
    freeImageCount,
    extraImageCount,
    extraImageTotalLkr: extraImageCount * marketlyConfig.extraImagePriceLkr,
    canPublishWithoutPayment: extraImageCount === 0,
  };
}
