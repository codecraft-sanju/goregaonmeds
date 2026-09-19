import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://goregaonmeds.vercel.app"),
  title: "Goregaonmeds | Your neighbourhood pharmacy, delivered",
  description:
    "Connect with Apple Pharmacy, Lotus Pharmacy and Healthzone & Cosmetic in Goregaon East. Request medicines on WhatsApp and pay at delivery.",
  applicationName: "Goregaonmeds",
  icons: {
    icon: "/medicine-fallback.webp",
  },
  openGraph: {
    title: "Goregaonmeds — Care, closer to home.",
    description:
      "Three neighbourhood branches. One simple way to request your medicines.",
    url: "https://goregaonmeds.vercel.app",
    siteName: "Goregaonmeds",
    images: [
      {
        url: "/logo.png",
        width: 800,
        height: 800,
        alt: "Goregaonmeds Logo",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Goregaonmeds",
    description: "Your neighbourhood pharmacy, delivered in Goregaon East.",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123e33",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        {children}
      </body>
    </html>
  );
}