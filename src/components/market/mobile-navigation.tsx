"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, House, MessageCircle, Plus, UserRound } from "lucide-react";

const links=[
  {href:"/",label:"Home",Icon:House},
  {href:"/listings",label:"Browse",Icon:Grid2X2},
  {href:"/sell/new",label:"Sell",Icon:Plus},
  {href:"/messages",label:"Chats",Icon:MessageCircle},
  {href:"/profile",label:"Profile",Icon:UserRound},
];
export function MobileNavigation() {
  const path=usePathname();
  return <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D8C7AA] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-5px_30px_rgba(0,0,0,.06)] backdrop-blur md:hidden" aria-label="Mobile navigation">
    <div className="mx-auto grid max-w-xl grid-cols-5">{links.map(({href,label,Icon})=>{
      const active=href==="/"?path===href:path.startsWith(href);
      return <Link key={href} href={href} aria-current={active?"page":undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold focus-visible:outline-2 ${active?"text-[#986823]":"text-[#59606B]"}`}>
        <Icon className={`size-5 ${href==="/sell/new"?"rounded-lg bg-[#D0A352] p-0.5 text-[#24272E]":""}`}/><span>{label}</span>
      </Link>;
    })}</div>
  </nav>;
}
