import Link from "next/link";
import { Heart, MapPin, MessageCircle, Plus, ShoppingBag, UserRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase, hasSupabaseConfig } from "@/lib/supabase/server";
import { AccountMenu } from "@/components/market/account-menu";
import { NotificationBell } from "@/components/market/notification-bell";

/** Server-rendered so each request sees the real verified Supabase session. */
export async function SiteHeader() {
  let account: { displayName: string; email: string; id: string } | null = null;
  let isAdmin = false;
  let adminRole: "owner" | "sub_admin" | "user" = "user";
  if (hasSupabaseConfig()) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Both requests are independent; parallel work shortens every authenticated page render.
      const [{ data: profile }, { data: adminFlag }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        supabase.rpc("marketly_admin_access"),
      ]);
      const fallbackName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
      isAdmin=adminFlag?.isAdmin === true;
      adminRole=adminFlag?.role === "owner" ? "owner" : adminFlag?.role === "sub_admin" ? "sub_admin" : "user";
      account = {
        displayName: profile?.display_name || fallbackName || user.email?.split("@")[0] || "Marketly member",
        id: user.id,
        email: user.email || "",
      };
    }
  }

  return <header className="sticky top-0 z-50 border-b border-[#D0A352]/20 bg-[#24272E]/95 text-white shadow-[0_4px_15px_rgba(0,0,0,.09)] backdrop-blur-lg">
    <div className="mx-auto flex h-[74px] max-w-7xl min-w-0 items-center gap-2 px-3 sm:gap-6 sm:px-6">
      <Link href="/" className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight sm:gap-3" aria-label="Marketly home">
        <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#D0A352] to-[#A7752A]"><ShoppingBag className="size-6 text-[#24272E]" /></span><span className="hidden min-[365px]:inline">Marketly</span>
      </Link>
      <nav className="hidden items-center gap-6 text-sm font-medium text-white/85 md:flex" aria-label="Main navigation">
        <Link href="/" className="hover:text-[#E4BD76]">Home</Link>
        <Link href="/listings" className="hover:text-[#E4BD76]">Categories</Link>
        <Link href="/membership" className="hover:text-[#E4BD76]">Memberships</Link>
        {isAdmin && <Link href="/admin" className="font-bold text-[#E4BD76]">{adminRole==="owner"?"Owner Dashboard":"Admin Dashboard"}</Link>}
      </nav>
      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
        <Link href="/listings" className="hidden items-center gap-1 text-xs text-white/85 lg:flex"><MapPin className="size-4"/> All Sri Lanka</Link>
        <Link href={account ? "/favorites" : "/login"} aria-label="Saved items" className="hidden sm:block"><Heart className="size-5" /></Link>
        <Link href={account ? "/messages" : "/login"} aria-label="Messages" className="hidden sm:block"><MessageCircle className="size-5" /></Link>
        {account && <NotificationBell userId={account.id} />}
        {account ? <AccountMenu displayName={account.displayName} email={account.email} adminRole={isAdmin ? adminRole : "user"} /> : <Link href="/login" className="flex items-center gap-1 text-sm"><UserRound className="size-5"/><span className="hidden sm:inline">Sign In</span></Link>}
        <Link href="/sell/new" className={buttonVariants({ size: "sm" })}><Plus className="size-4"/> <span className="hidden min-[375px]:inline">Sell Item</span><span className="min-[375px]:hidden">Sell</span></Link>
      </div>
    </div>
  </header>;
}
