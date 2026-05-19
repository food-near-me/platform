import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const ibmSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "foodnear.me — AI-native food discovery infrastructure",
  description:
    "Get discovered by AI agents, pay lower fees than delivery platforms, and keep your customer relationship.",
  openGraph: {
    title: "foodnear.me — AI-native food discovery infrastructure",
    description:
      "Get discovered by AI agents, pay lower fees than delivery platforms, and keep your customer relationship.",
    url: "https://foodnear.me",
    siteName: "foodnear.me",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "foodnear.me — AI-native food discovery infrastructure",
    description:
      "Get discovered by AI agents, pay lower fees than delivery platforms, and keep your customer relationship.",
  },
  alternates: {
    canonical: "https://foodnear.me",
  },
  other: {
    "ai-plugin": "https://foodnear.me/.well-known/ai-plugin.json",
    "mcp-server": "https://foodnear.me/.well-known/mcp-server.json",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://foodnear.me/#organization",
  name: "foodnear.me",
  url: "https://foodnear.me",
  logo: "https://foodnear.me/logo.png",
  description:
    "AI-native restaurant discovery infrastructure. Menu Protocol and Agent Discovery Optimization for the agentic web.",
  contactPoint: {
    "@type": "ContactPoint",
    email: "api@foodnear.me",
    contactType: "technical support",
  },
  sameAs: ["https://github.com/foodnearme"],
};

const webSiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://foodnear.me/#website",
  name: "foodnear.me",
  url: "https://foodnear.me",
  description:
    "AI-native restaurant discovery infrastructure. Get discovered by AI agents with Menu Protocol.",
  publisher: {
    "@id": "https://foodnear.me/#organization",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate:
        "https://foodnear.me/api/v1/search?query={search_term}&lat={latitude}&lng={longitude}",
    },
    "query-input": [
      "required name=search_term",
      "required name=latitude",
      "required name=longitude",
    ],
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://foodnear.me/#api",
  name: "foodnear.me API",
  applicationCategory: "WebApplication",
  operatingSystem: "Any",
  description:
    "REST API and MCP server for AI-native restaurant discovery. Search restaurants, retrieve Menu Protocol formatted menus, and check ADO scores.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free during beta. API keys available for higher rate limits.",
  },
  featureList: [
    "Restaurant search by location and filters",
    "Menu Protocol v1.0 formatted menus",
    "Dietary restriction filtering",
    "Allergen declarations",
    "ADO score optimization",
    "MCP server for AI agents",
    "Schema.org JSON-LD responses",
  ],
  softwareHelp: {
    "@type": "WebPage",
    url: "https://foodnear.me/SKILL.md",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmSans.variable} ${ibmMono.variable} h-full`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webSiteJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationJsonLd),
          }}
        />
        <link
          rel="alternate"
          type="application/json"
          href="https://foodnear.me/openapi.json"
          title="OpenAPI Specification"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
