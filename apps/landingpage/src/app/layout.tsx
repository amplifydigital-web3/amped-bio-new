import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@repo/ui";
import { ParticlesProvider } from "@/components/ParticlesProvider";
import { AppProviders } from "@/components/providers/AppProviders";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Amped.Bio",
  description: "Your digital identity, amplified.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
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
