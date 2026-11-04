import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn("h-12 w-full rounded-xl border border-[#E4DFD7] bg-white px-4 text-sm text-[#24272E] placeholder:text-[#888B90] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#B88746] disabled:bg-zinc-100", className)} {...props} />;
}
