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
  title: "Goregaonmeds | Your neighbourhood pharmacy, delivered",
  description:
    "Connect with Apple Pharmacy, Lotus Pharmacy and Healthzone & Cosmetic in Goregaon East. Request medicines on WhatsApp and pay at delivery.",
  applicationName: "Goregaonmeds",
  openGraph: {
    title: "Goregaonmeds — Care, closer to home.",
    description:
      "Three neighbourhood branches. One simple way to request your medicines.",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Goregaonmeds",
    description: "Your neighbourhood pharmacy, delivered in Goregaon East.",
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
      {/* Inline styles hata diye gaye hain taaki hydration error na aaye */}
      <body>
        {children}
      </body>
    </html>
  );
}