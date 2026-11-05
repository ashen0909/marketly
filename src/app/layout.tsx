import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/market/site-header";
import { FavoritesProvider } from "@/components/market/favorites-provider";
import { MarketlyUiProvider } from "@/components/market/marketly-ui-provider";
import { MobileNavigation } from "@/components/market/mobile-navigation";
import { ConnectivityNotice } from "@/components/market/connectivity-notice";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Marketly — Buy better. Sell easier.", template: "%s | Marketly" },
  description: "A simpler marketplace concept for buying and selling across Sri Lanka. Safe, transparent and easy to use.",
  robots: { index: false, follow: false }, // Remove after legal review and production readiness.
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const demo = !hasSupabaseConfig();
  return <html lang="en"><body>
    <MarketlyUiProvider><FavoritesProvider>
    <SiteHeader />
    <MobileNavigation />
    <ConnectivityNotice />
    {demo && <div className="bg-[#FFF3DB] px-4 py-2 text-center text-xs font-medium text-[#6F4E20]" role="status">DEVELOPMENT PREVIEW — sample products only. Configure Supabase to activate accounts and real listings.</div>}
    <main id="main-content">{children}</main>
    <footer className="mb-16 mt-14 md:mb-0 border-t border-[#ECE8E2] bg-[#F8F7F4] px-4 py-8 text-center text-sm text-[#68707C]">
      <p className="font-bold text-[#24272E]">Marketly</p>
      <p className="mt-2">Buy better. Sell easier. · Sri Lanka · Direct buyer–seller marketplace concept.</p>
      <p className="mt-2 text-xs">Never share OTPs or banking passwords. Meet safely and inspect items before paying.</p>
      <p className="mt-2 text-xs">Messaging and price negotiations are available for registered members. Verification and purchase payments are not live.</p>
    </footer>
    </FavoritesProvider></MarketlyUiProvider>
  </body></html>;
}
