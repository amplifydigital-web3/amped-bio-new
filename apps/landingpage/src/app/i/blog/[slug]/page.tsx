import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLE_CARD_CLASS, ARTICLE_PROSE_CLASS } from "@/components/article/articleStyles";
import { PostGrid } from "@/components/blog/PostCards";
import { PostClosingCard } from "@/components/blog/PostClosingCard";
import { Eyebrow, PublicPage } from "@/components/layout/PublicPage";
import {
  formatPostDate,
  getBlogPostBySlug,
  getBlogPosts,
  getPostCategory,
  getPostCoverImage,
  getPostFeaturedAlt,
  getPostFeaturedImage,
  getPostTitle,
  stripHtml,
  toPostCard,
} from "@/lib/blog";
import { sanitizePostHtml } from "@/lib/sanitizeHtml";

// Statically generate each post; revalidate every 10 minutes
export const revalidate = 600;

export async function generateStaticParams() {
  const { posts } = await getBlogPosts(50);
  return posts.map(post => ({ slug: post.slug }));
}

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return { title: "Post not found · Amped.Bio" };

  const postTitle = getPostTitle(post);
  const title = `${postTitle} | Amped.Bio`;
  const description = stripHtml(post.excerpt.rendered);
  const featured = getPostFeaturedImage(post);
  const ogImage = featured
    ? { url: featured, alt: postTitle }
    : {
        url: `/og?title=${encodeURIComponent(postTitle)}`,
        width: 1200,
        height: 630,
        alt: postTitle,
      };

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
  };
}

// Screen Review 072 I12 to I15: All posts, the meta row and Bebas title on the
// room, the 1.91:1 cover, the sanitized body on the shared article card, then
// More posts and the closing card.
export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const [post, recent] = await Promise.all([getBlogPostBySlug(slug), getBlogPosts(4)]);

  if (!post) notFound();

  const title = getPostTitle(post);
  const category = getPostCategory(post);
  const morePosts = recent.posts
    .filter(other => other.id !== post.id)
    .slice(0, 3)
    .map(toPostCard);

  return (
    <PublicPage>
      <article>
        <header className="mx-auto w-full max-w-[610px] pt-[21px]">
          <Link
            href="/i/blog"
            className="prism-btn-secondary prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 px-5 text-prism-label font-semibold"
          >
            <ArrowLeft className="h-[21px] w-[21px]" aria-hidden />
            All posts
          </Link>
          <p className="mt-[34px] text-prism-meta tabular-nums text-prism-ink-2">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            {category && (
              <>
                <span aria-hidden> · </span>
                <span>{category.name}</span>
              </>
            )}
          </p>
          <h1
            className={`mt-[13px] break-words uppercase font-prism-display text-prism-display-42 text-prism-ink [text-shadow:0_1px_0_rgba(255,255,255,0.9),5px_13px_34px_rgba(48,47,93,0.14)] sm:text-prism-display-68`}
          >
            {title}
          </h1>
          <div className="relative mt-[34px] aspect-[1.91/1] w-full overflow-hidden rounded-prism-13 bg-prism-ink">
            <Image
              src={getPostCoverImage(post)}
              alt={getPostFeaturedAlt(post)}
              fill
              priority
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 610px"
            />
          </div>
        </header>

        <div className={`mt-[21px] ${ARTICLE_CARD_CLASS}`}>
          <div
            className={`mx-auto max-w-[610px] ${ARTICLE_PROSE_CLASS}`}
            dangerouslySetInnerHTML={{ __html: sanitizePostHtml(post.content.rendered) }}
          />
        </div>
      </article>

      {morePosts.length > 0 && (
        <section aria-labelledby="more-posts" className="mx-auto mt-[55px] w-full max-w-[1173px]">
          <h2 id="more-posts">
            <Eyebrow>More posts</Eyebrow>
          </h2>
          <div className="mt-[21px]">
            <PostGrid posts={morePosts} headingLevel="h3" />
          </div>
        </section>
      )}

      <div className="mt-[21px]">
        <PostClosingCard />
      </div>
    </PublicPage>
  );
}
