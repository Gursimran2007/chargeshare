import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import { Toaster } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { getViewer } from "@/lib/auth";
import { config } from "@/lib/config";
import { brand } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: `${brand.name} · Book EV chargers near you`, template: `%s · ${brand.name}` },
  description:
    "Discover and book verified EV chargers at homes, workplaces and destinations in Chennai. Hosts earn from idle charging time.",
};

export const viewport: Viewport = { themeColor: "#0a1730", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  return (
    <html lang="en-IN" className={`${inter.variable} ${sora.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
          Skip to content
        </a>
        {config.demoMode ? (
          <div className="bg-warn-100 px-4 py-1.5 text-center text-xs font-medium text-warn-600">
            Demo mode: listings, hosts and bookings are fictional and payments are simulated. No real chargers, no real money.{" "}
            <a href="/how-it-works#demo-tour" className="font-semibold underline">Take the demo tour</a>
          </div>
        ) : null}
        <SiteHeader viewer={viewer} />
        <main id="main" className="flex-1 pb-20 md:pb-0">
          {children}
        </main>
        <SiteFooter demo={config.demoMode} />
        <MobileTabBar signedIn={!!viewer} isHost={!!viewer?.isHost} />
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
