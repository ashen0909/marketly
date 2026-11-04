"use client";
import { useState } from "react";

export function PriceField({ initialValue = 0 }: { initialValue?: number }) {
  const [digits, setDigits] = useState(initialValue ? String(initialValue) : "");
  const shown = digits ? Number(digits).toLocaleString("en-US") : "";
  return <div>
    <label htmlFor="marketly-price" className="field-label">Price (LKR) *</label>
    <div className="flex items-center rounded-lg border border-stone-300 bg-white focus-within:ring-2 focus-within:ring-[#B88746]/30">
      <span className="px-3 text-sm font-bold text-stone-500">Rs.</span>
      <input id="marketly-price" inputMode="numeric" autoComplete="off" required
        aria-label="Price in Sri Lankan rupees" className="h-11 w-full rounded-lg bg-transparent px-2 outline-none"
        placeholder="100,000" value={shown} onChange={e=>setDigits(e.target.value.replace(/\D/g, "").slice(0,9).replace(/^0+/, ""))}/>
    </div>
    <input type="hidden" name="price" value={digits}/>
  </div>;
}
