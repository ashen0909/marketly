/** Pure seller-side hints. Database and API still perform authoritative validation. */
export function listingQuality(title: string, description: string, price: number, count: number) {
  const tips: string[] = [];
  if (title.trim().length < 5) tips.push("Use a descriptive title (at least 5 characters).");
  if (description.trim().length < 20) tips.push("Describe condition, defects, included accessories and delivery details.");
  if (!Number.isInteger(price) || price < 1 || price > 999999999) tips.push("Enter a valid price in LKR.");
  if (count < 1) tips.push("Add at least one genuine product photo before submitting for review.");
  if (count > 5) tips.push("Only the first five images are supported until real payments are available.");
  if (/^(test|item|product|sell|new|used)$/i.test(title.trim())) tips.push("Avoid generic titles; include product model or distinguishing details.");
  if (price > 0 && price < 100) tips.push("Double-check the price; it looks unusually low (not automatically rejected).");
  return tips;
}
export function sameTitle(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, " ").toLocaleLowerCase("en") === b.trim().replace(/\s+/g," ").toLocaleLowerCase("en");
}

/** Form-specific issues, aligned with the server's required field constraints.
 * Warnings help the seller but do not automatically block submission.
 */
export type ListingFieldName = "title" | "category" | "condition" | "price" | "location" | "description" | "photos";
export type ListingFieldIssue = { message: string; severity: "error" | "warning" };
export type ListingFieldIssues = Partial<Record<ListingFieldName, ListingFieldIssue>>;

export function listingFieldIssues(input: {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  location: string;
  photoCount: number;
  maxPhotoCount?: number;
  duplicate?: boolean;
}): ListingFieldIssues {
  const issues: ListingFieldIssues = {};
  const title = input.title.trim();
  const description = input.description.trim();
  const error = (message: string): ListingFieldIssue => ({ message, severity: "error" });
  const warning = (message: string): ListingFieldIssue => ({ message, severity: "warning" });
  if (input.duplicate) issues.title = error("You already have an ad with this title. Edit it or choose a different title.");
  else if (title.length < 5) issues.title = error("Title needs at least 5 characters. Include the product and model.");
  else if (title.length > 90) issues.title = error("Title must be 90 characters or fewer.");
  else if (/^(test|item|product|sell|new|used)$/i.test(title)) issues.title = warning("Be more specific: include a product model or unique detail.");
  if (!input.category.trim()) issues.category = error("Choose a product category.");
  if (!input.condition.trim()) issues.condition = error("Choose the product's condition.");
  if (!Number.isInteger(input.price) || input.price < 1 || input.price > 999999999)
    issues.price = error("Enter a valid price from Rs.1 to Rs.999,999,999.");
  else if (input.price < 100) issues.price = warning("This price looks unusually low. Please double-check it.");
  if (!input.location.trim()) issues.location = error("Choose the district or area.");
  if (description.length < 20) issues.description = error("Description needs at least 20 characters. Add condition and product details.");
  else if (description.length > 2500) issues.description = error("Description must be 2,500 characters or fewer.");
  if (input.photoCount < 1) issues.photos = error("Add at least one product photo before submitting.");
  else if (input.photoCount > (input.maxPhotoCount??5)) issues.photos = error(`Maximum ${input.maxPhotoCount??5} photos for this account.`);
  return issues;
}

export const listingFieldOrder: ListingFieldName[] = [
  "title", "category", "condition", "price", "location", "description", "photos",
];
export function firstInvalidListingField(issues: ListingFieldIssues): ListingFieldName | undefined {
  return listingFieldOrder.find(field => issues[field]?.severity === "error");
}
