import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@repo/ui";
import { ParticlesProvider } from "@/components/ParticlesProvider";
import { AppProviders } from "@/components/providers/AppProviders";
import { FeatureFlagsProvider } from "@/components/providers/FeatureFlagsProvider";
import { getFeatureFlagOverrides } from "@/lib/featureFlags";
import { getBaseFontLink } from "@/lib/fontDelivery";
import Script from "next/script";
import { AmpedAnalytics } from "@/components/AmpedAnalytics";
import { CONSENT_DEFAULT_SNIPPET } from "@/lib/ampedAnalytics";
import { STORAGE_GUARD_SNIPPET } from "@/lib/storageGuard";
import "@/styles/globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_LANDINGPAGE_URL ?? "https://amped.bio";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Amped.Bio",
  description: "Your digital identity, amplified.",
  openGraph: {
    type: "website",
    siteName: "Amped.Bio",
    title: "Amped.Bio",
    description: "Your digital identity, amplified.",
    images: [{ url: "/og", width: 1200, height: 630, alt: "Amped.Bio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Amped.Bio",
    description: "Your digital identity, amplified.",
    images: ["/og"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Feature flags from site_settings, read on the server (lib/featureFlags.ts)
  const [featureFlags, baseFont] = await Promise.all([
    getFeatureFlagOverrides(),
    getBaseFontLink(),
  ]);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* QA-010: must run before any app chunk; see lib/storageGuard.ts */}
        <script
          id="amped-storage-guard"
          dangerouslySetInnerHTML={{ __html: STORAGE_GUARD_SNIPPET }}
        />
      </head>
      <body className="antialiased">
        {/* Google Consent Mode default: denied until the visitor chooses */}
        <Script id="amped-consent-default" strategy="beforeInteractive">
          {CONSENT_DEFAULT_SNIPPET}
        </Script>
        {/* The ten base families: Amped's media host while fontDelivery is on (lib/fontDelivery.ts) */}
        {baseFont.preconnect.map(origin => (
          <link
            key={origin.href}
            rel="preconnect"
            href={origin.href}
            crossOrigin={origin.crossOrigin}
          />
        ))}
        <link href={baseFont.href} rel="stylesheet" />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <FeatureFlagsProvider overrides={featureFlags}>
            <AppProviders>
              <ParticlesProvider>{children}</ParticlesProvider>
              <Toaster />
            </AppProviders>
          </FeatureFlagsProvider>
        </ThemeProvider>
        <AmpedAnalytics />
      </body>
    </html>
  );
}
