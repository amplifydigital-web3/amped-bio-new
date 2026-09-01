import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@repo/ui";
import { ParticlesProvider } from "@/components/ParticlesProvider";
import { AppProviders } from "@/components/providers/AppProviders";
import "@/styles/globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://amped.bio";
const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;
const GA_ID = "G-SK6H61G3S1";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <AppProviders>
            <ParticlesProvider>
              {children}
            </ParticlesProvider>
            <Toaster />
          </AppProviders>
        </ThemeProvider>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
        {CAPTCHA_SITE_KEY && (
          <Script
            src={`https://www.google.com/recaptcha/enterprise.js?render=${CAPTCHA_SITE_KEY}`}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
