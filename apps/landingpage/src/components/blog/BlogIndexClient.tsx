"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, LoaderCircle, Newspaper } from "lucide-react";
import { Button, EmptyState } from "@repo/ui";
import type { BlogPostCard } from "@/lib/blog";
import { FeaturedPostCard, PostGrid } from "@/components/blog/PostCards";

interface PageResponse {
  posts: BlogPostCard[];
  page: number;
  totalPages: number;
}

async function fetchPage(page: number): Promise<PageResponse> {
  const res = await fetch(`/i/blog-posts?page=${page}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("blog");
  return (await res.json()) as PageResponse;
}

// Screen Review 072 I01, I08, I09: the newest post as the featured lens, the
// rest in the grid, then Load more 12 at a time until the last page. Empty and
// failed are different states; Retry asks WordPress again.
export function BlogIndexClient({
  initialPosts,
  initialTotalPages,
  initialFailed,
}: {
  initialPosts: BlogPostCard[];
  initialTotalPages: number;
  initialFailed: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [failed, setFailed] = useState(initialFailed);
  const [loading, setLoading] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const retry = async () => {
    setLoading(true);
    try {
      const result = await fetchPage(1);
      setPosts(result.posts);
      setTotalPages(result.totalPages);
      setPage(1);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoading(true);
    setMoreFailed(false);
    try {
      const result = await fetchPage(page + 1);
      const known = new Set(posts.map(post => post.id));
      setPosts([...posts, ...result.posts.filter(post => !known.has(post.id))]);
      setTotalPages(result.totalPages);
      setPage(page + 1);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (failed) {
    return (
      <div
        role="alert"
        className="prism-glass-clear mx-auto flex max-w-[508px] items-start gap-3 p-[21px]"
      >
        <AlertCircle className="mt-px h-[21px] w-[21px] shrink-0 text-prism-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-prism-label font-bold text-prism-ink">Posts did not load</h2>
          <p className="mt-1 text-prism-body text-prism-ink-2">The blog service did not respond.</p>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={loading}
            aria-busy={loading || undefined}
            onClick={() => void retry()}
          >
            {loading && (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        title="No posts yet"
        description="New posts appear here."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Go to Amped.Bio</Link>
          </Button>
        }
      />
    );
  }

  const [featured, ...rest] = posts;
  const hasMore = page < totalPages;

  return (
    <div className="space-y-[21px]">
      <FeaturedPostCard post={featured} />
      {rest.length > 0 && <PostGrid posts={rest} />}
      {(hasMore || moreFailed) && (
        <div className="flex flex-col items-center gap-2 pt-[34px]">
          <Button
            variant="secondary"
            disabled={loading}
            aria-busy={loading || undefined}
            onClick={() => void loadMore()}
          >
            {loading ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {loading ? "Loading" : "Load more"}
            {!loading && <ChevronDown aria-hidden />}
          </Button>
          {moreFailed && (
            <p role="alert" className="text-prism-meta text-prism-danger">
              The blog service did not respond.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
