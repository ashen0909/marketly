"use client";
import { useState } from "react";
import { ListingFieldFeedback } from "@/components/market/listing-field-feedback";
import type { ListingFieldIssue } from "@/lib/listing-quality";

export function PriceField({ initialValue = 0, onValueChange, onBlur, issue }: {
  initialValue?: number;
  onValueChange?: (value: number) => void;
  onBlur?: () => void;
  issue?: ListingFieldIssue;
}) {
  const [digits, setDigits] = useState(initialValue ? String(initialValue) : "");
  const shown = digits ? Number(digits).toLocaleString("en-US") : "";
  return <div>
    <label htmlFor="marketly-price" className="field-label">Price (LKR) *</label>
    <div className={`flex items-center rounded-lg border bg-white focus-within:ring-2 focus-within:ring-[#B88746]/30 ${issue?.severity === "error" ? "border-red-500" : "border-stone-300"}`}>
      <span className="px-3 text-sm font-bold text-stone-500">Rs.</span>
      <input id="marketly-price" inputMode="numeric" autoComplete="off" required
        aria-label="Price in Sri Lankan rupees" aria-invalid={issue?.severity === "error"}
        aria-describedby={issue ? "price-feedback" : undefined}
        onBlur={onBlur}
        className="h-11 w-full rounded-lg bg-transparent px-2 outline-none"
        placeholder="100,000" value={shown} onChange={e=>{const value=e.target.value.replace(/\D/g, "").slice(0,9).replace(/^0+/, "");setDigits(value);onValueChange?.(Number(value));}}/>
    </div>
    <ListingFieldFeedback id="price-feedback" issue={issue}/>
    <input type="hidden" name="price" value={digits}/>
  </div>;
}
