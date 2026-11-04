import * as React from "react";
import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="card" className={cn("rounded-2xl border border-[#EAE6E0] bg-white shadow-[0_5px_20px_rgba(24,30,38,.035)]", className)} {...props}/>; }
