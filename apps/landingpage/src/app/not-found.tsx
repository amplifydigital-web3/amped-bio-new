import type { Metadata } from "next";
import { NotFoundState } from "@/components/NotFoundState";
import { PublicPage } from "@/components/layout/PublicPage";

// Screen Review 097 I01, I07, I10: every unmatched public path answers HTTP 404
// with the public shell and three ways forward.
export const metadata: Metadata = {
  title: "Page not found · Amped.Bio",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <PublicPage>
      <NotFoundState
        eyebrow="404"
        title="Page not found"
        body="This link is broken or the page has moved."
        primary={{ label: "Go to Amped.Bio", href: "/" }}
        secondary={[
          { label: "Explore pools", href: "/i/pools" },
          { label: "Read the blog", href: "/i/blog" },
        ]}
      />
    </PublicPage>
  );
}
