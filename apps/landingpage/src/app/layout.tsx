import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@repo/ui";
import { ParticlesProvider } from "@/components/ParticlesProvider";
import { AppProviders } from "@/components/providers/AppProviders";
import "@/styles/globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://amped.bio";

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
      </body>
    </html>
  );
}
