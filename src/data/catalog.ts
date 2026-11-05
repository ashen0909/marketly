export const categories = [
  { id: "Mobiles", name: "Mobiles & Tablets", icon: "smartphone" },
  { id: "Vehicles", name: "Vehicles", icon: "car" },
  { id: "Property", name: "Property", icon: "house" },
  { id: "Electronics", name: "Electronics", icon: "laptop" },
  { id: "Home & Living", name: "Home & Living", icon: "sofa" },
  { id: "Fashion", name: "Fashion", icon: "shirt" },
  { id: "Services", name: "Services", icon: "wrench" },
  { id: "Other", name: "Other Items", icon: "grid" },
] as const;

export const locations = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya", "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar", "Mullaitivu", "Vavuniya", "Trincomalee", "Batticaloa", "Ampara", "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla", "Monaragala", "Ratnapura", "Kegalle"
] as const;

export type Listing = {
  id: string;
  title: string;
  description: string;
  price_lkr: number;
  category: string;
  location: string;
  condition: "New" | "Used" | "Refurbished";
  seller_id: string | null;
  seller_name: string;
  status: "active" | "sold" | "removed" | "deleted";
  moderation_status?: "pending" | "approved" | "rejected";
  moderation_note?: string | null;
  is_negotiable?: boolean;
  preview_urls?: string[];
  image_urls: string[];
  published_at: string;
  expires_at?: string | null;
  sample?: boolean;
};

/** Explicitly fictional sample content; never show it as real inventory. */
export const sampleListings: Listing[] = [
  { id: "sample-iphone", title: "iPhone 13 · 128GB", description: "Illustrative product listing, not a real item for sale.", price_lkr: 85000, category: "Mobiles", location: "Colombo", condition: "Used", seller_id: null, seller_name: "Example Seller", status: "active", image_urls: ["/images/iphone.webp"], published_at: "2026-11-01T12:00:00Z", sample: true },
  { id: "sample-bike", title: "Honda CB Shine", description: "Illustrative product listing, not a real item for sale.", price_lkr: 420000, category: "Vehicles", location: "Kandy", condition: "Used", seller_id: null, seller_name: "Example Seller", status: "active", image_urls: ["/images/motorbike.webp"], published_at: "2026-11-02T12:00:00Z", sample: true },
  { id: "sample-macbook", title: "MacBook Air M1", description: "Illustrative product listing, not a real item for sale.", price_lkr: 245000, category: "Electronics", location: "Colombo", condition: "Used", seller_id: null, seller_name: "Example Seller", status: "active", image_urls: ["/images/macbook.webp"], published_at: "2026-11-03T12:00:00Z", sample: true },
  { id: "sample-sofa", title: "3-Seater Sofa", description: "Illustrative product listing, not a real item for sale.", price_lkr: 65000, category: "Home & Living", location: "Gampaha", condition: "New", seller_id: null, seller_name: "Example Seller", status: "active", image_urls: ["/images/sofa.webp"], published_at: "2026-11-03T13:00:00Z", sample: true },
];
