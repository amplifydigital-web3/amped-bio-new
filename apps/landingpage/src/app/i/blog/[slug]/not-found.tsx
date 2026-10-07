import type { Metadata } from "next";
import { NotFoundState } from "@/components/NotFoundState";
import { PublicPage } from "@/components/layout/PublicPage";

// Screen Review 097 I04 and 072 I17: a missing post answers HTTP 404
// (notFound() in the page) and sends readers back to the blog.
export const metadata: Metadata = {
  title: "Post not found · Amped.Bio",
  robots: { index: false, follow: true },
};

export default function PostNotFound() {
  return (
    <PublicPage>
      <NotFoundState
        eyebrow="Blog"
        title="Post not found"
        body="This post is not on the blog, or its link has changed."
        primary={{ label: "All posts", href: "/i/blog" }}
        secondary={[{ label: "Go to Amped.Bio", href: "/" }]}
      />
    </PublicPage>
  );
}
