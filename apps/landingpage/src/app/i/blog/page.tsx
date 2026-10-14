import type { Metadata } from "next";
import { BlogIndexClient } from "@/components/blog/BlogIndexClient";
import { DISPLAY_TITLE_CLASS, PublicPage } from "@/components/layout/PublicPage";
import { getBlogPosts, toPostCard } from "@/lib/blog";

// Statically generate the listing; revalidate every 10 minutes
export const revalidate = 600;

const DESCRIPTION = "News and updates from the Amped.Bio team.";

export const metadata: Metadata = {
  title: "Blog | Amped.Bio",
  description: DESCRIPTION,
  openGraph: {
    title: "Blog | Amped.Bio",
    description: DESCRIPTION,
    images: [
      { url: "/og?title=News%20and%20updates", width: 1200, height: 630, alt: "Amped.Bio Blog" },
    ],
  },
  twitter: {
    title: "Blog | Amped.Bio",
    description: DESCRIPTION,
    images: ["/og?title=News%20and%20updates"],
  },
};

// Screen Review 072 I01, I02, I07: the blog on the room under the public
// header. A Bebas BLOG hero, one intro line, then the posts.
export default async function BlogPage() {
  const result = await getBlogPosts();

  return (
    <PublicPage>
      <div className="mx-auto w-full max-w-[1173px] pt-[34px] sm:pt-[21px]">
        <h1 className={`uppercase ${DISPLAY_TITLE_CLASS}`}>Blog</h1>
        <p className="mt-[21px] text-prism-body text-prism-ink-2">{DESCRIPTION}</p>
        <div className="mt-[34px]">
          <BlogIndexClient
            initialPosts={result.posts.map(toPostCard)}
            initialTotalPages={result.totalPages}
            initialFailed={result.failed}
          />
        </div>
      </div>
    </PublicPage>
  );
}
