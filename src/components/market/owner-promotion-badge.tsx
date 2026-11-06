"use client";

import { useState } from "react";

/** Keep clock evaluation out of the component render body. */
export function OwnerPromotionBadge({ expiresAt }: { expiresAt: string }) {
  const [renderNow] = useState(() => Date.now());
  if (new Date(expiresAt).getTime() <= renderNow) return null;
  return <span className="absolute left-3 top-3 rounded-full border border-[#E7CE9C] bg-[#24272E] px-3 py-1 text-[11px] font-bold text-[#F2D29A]">Promoted</span>;
}
