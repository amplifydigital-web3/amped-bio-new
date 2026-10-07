"use client";

import { DestinationErrorCard } from "@/components/DestinationErrorCard";
import "@/styles/globals.css";

// Screen Review 097 I03: shown when the root layout or AppProviders throw, so
// it has its own html and body on the env color with no room beams, no
// providers, no Web3Auth, no analytics tag and no remote fonts (Figtree only
// when the browser already has it, then the system stack).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body className="prism-font min-h-dvh bg-prism-env px-[13px] pt-[89px] text-prism-ink antialiased sm:pt-[144px]">
        <DestinationErrorCard
          cause="Something went wrong on our side. Try again."
          primaryLabel="Reload page"
          onPrimary={() => window.location.reload()}
          digest={error.digest}
          plainHomeLink
        />
      </body>
    </html>
  );
}
