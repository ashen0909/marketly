import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: { default: "bg-[#B88746] text-white hover:bg-[#9F722F]", graphite: "bg-[#24272E] text-white hover:bg-[#3B4049]", outline: "border border-[#DDD5C8] bg-white text-[#24272E] hover:bg-[#F6F5F2]", ghost: "text-[#24272E] hover:bg-[#F6F5F2]" },
    size: { default: "h-11 px-5", sm: "h-9 px-3", lg: "h-12 px-7", icon: "size-11" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
