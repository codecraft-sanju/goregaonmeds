import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://goregaonmeds.vercel.app";
const PHONE = "+91-8433818771";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Online Medicine Delivery in Goregaon East | Goregaonmeds",
  description:
    "Order medicines online from Apple, Lotus & Healthzone Pharmacy in Goregaon East. Upload prescription on WhatsApp and get cash on delivery.",
  applicationName: "Goregaonmeds",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/medicine-fallback.webp",
  },
  openGraph: {
    title: "Goregaonmeds — Care, closer to home.",
    description:
      "Three neighbourhood branches. One simple way to request your medicines.",
    url: SITE_URL,
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

const BRANCH_ADDRESSES = [
  {
    name: "Apple Pharmacy",
    streetAddress: "Shop No. 9, Sheetal Krupa Building, Ground Floor, Aarey Road",
  },
  {
    name: "Lotus Pharmacy",
    streetAddress: "Shop No. 10, Shreyas Bhavan, Jay Prakash Nagar Road No. 1, opposite Domino’s Pizza",
  },
  {
    name: "Healthzone & Cosmetic",
    streetAddress: "Pednekar Chawl, Shop No. 3, Ground Floor, S.V., Aarey Road",
  },
];

const AREA_SERVED = {
  "@type": "Place",
  name: "Goregaon East, Mumbai",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Goregaon East, Mumbai",
    addressRegion: "Maharashtra",
    addressCountry: "IN",
  },
};

// MedicalOrganization for the network; each branch is a Pharmacy (a LocalBusiness subtype),
// which is what Google uses for local results. Add `geo` and `openingHoursSpecification`
// per branch once exact coordinates and hours are confirmed.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "MedicalOrganization",
  "@id": `${SITE_URL}/#organization`,
  name: "Goregaonmeds",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  image: `${SITE_URL}/logo.png`,
  description:
    "Neighbourhood pharmacy network in Goregaon East, Mumbai. Order medicines on WhatsApp and pay cash or UPI on delivery.",
  telephone: PHONE,
  areaServed: AREA_SERVED,
  medicalSpecialty: "Pharmacy",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: PHONE,
    contactType: "customer service",
    areaServed: "IN",
  },
  subOrganization: BRANCH_ADDRESSES.map((branch) => ({
    "@type": "Pharmacy",
    name: branch.name,
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    telephone: PHONE,
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    priceRange: "₹",
    paymentAccepted: "Cash, UPI",
    currenciesAccepted: "INR",
    areaServed: AREA_SERVED,
    address: {
      "@type": "PostalAddress",
      streetAddress: branch.streetAddress,
      addressLocality: "Goregaon East, Mumbai",
      addressRegion: "Maharashtra",
      postalCode: "400063",
      addressCountry: "IN",
    },
  })),
};

// Escaping "<" prevents any string in the data from closing the script tag early.
const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataJson }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}