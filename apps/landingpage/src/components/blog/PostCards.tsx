import Image from "next/image";
import Link from "next/link";
import { cn } from "@repo/ui";
import type { BlogPostCard } from "@/lib/blog";

// Screen Review 072 I03 to I06: every card is one link named by its title.
// Covers sit in a 1.91:1 box inset 8 with r13, so the generated /og cover
// (1200 x 630) always shows whole; alt is empty because the title follows.

const CARD_HOVER =
  "transition-[background-color,box-shadow] duration-prism-hover ease-prism hover:bg-white/25";

function PostMeta({ post }: { post: BlogPostCard }) {
  return (
    <p className="text-prism-meta tabular-nums text-prism-ink-2">
      <time dateTime={post.date}>{post.dateLabel}</time>
      {post.category && (
        <>
          <span aria-hidden> · </span>
          <span>{post.category}</span>
        </>
      )}
    </p>
  );
}

function Cover({ src, sizes, priority }: { src: string; sizes: string; priority?: boolean }) {
  return (
    <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-prism-13 bg-prism-ink">
      <Image src={src} alt="" fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}

/** Grid card: G1 clear r21, cover, then meta, title 20/23 (2 lines), excerpt 16/26 (3 lines). */
export function PostCard({
  post,
  headingLevel = "h2",
}: {
  post: BlogPostCard;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <Link
      href={`/i/blog/${post.slug}`}
      className={cn("prism-glass-clear prism-focus flex h-full flex-col p-[8px]", CARD_HOVER)}
    >
      <Cover src={post.cover} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 377px" />
      <div className="flex flex-1 flex-col px-[13px] pb-[13px] pt-[21px]">
        <PostMeta post={post} />
        <Heading className="mt-2 line-clamp-2 text-prism-panel-title text-prism-ink">
          {post.title}
        </Heading>
        {post.excerpt && (
          <p className="mt-2 line-clamp-3 text-prism-body text-prism-ink-2">{post.excerpt}</p>
        )}
      </div>
    </Link>
  );
}

/** The newest post: the one G3 lens of the index, with the rim and halo (072 I01). */
export function FeaturedPostCard({ post }: { post: BlogPostCard }) {
  return (
    <div className="relative isolate">
      <span aria-hidden className="prism-halo-card" />
      <Link
        href={`/i/blog/${post.slug}`}
        className={cn(
          "prism-lens prism-focus grid gap-[21px] p-[8px] md:grid-cols-[minmax(0,610px)_minmax(0,1fr)] md:items-center md:gap-0",
          CARD_HOVER
        )}
      >
        <span aria-hidden className="prism-rim" />
        <Cover src={post.cover} sizes="(max-width: 768px) 100vw, 610px" priority />
        <div className="px-[13px] pb-[13px] md:px-[34px] md:py-[34px]">
          <span className="inline-flex h-[26px] items-center rounded-prism-8 bg-white/[0.92] px-2 text-prism-meta text-prism-ink-2">
            Newest post
          </span>
          <div className="mt-[21px]">
            <PostMeta post={post} />
          </div>
          <h2 className="mt-[13px] text-prism-card-title text-prism-ink">{post.title}</h2>
          {post.excerpt && (
            <p className="mt-[13px] line-clamp-4 text-prism-body text-prism-ink-2">
              {post.excerpt}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}

/** Grid of G1 clear cards: 3 columns at 1173, 2 at 890, 1 at 390, 21 gaps. */
export function PostGrid({
  posts,
  headingLevel,
}: {
  posts: BlogPostCard[];
  headingLevel?: "h2" | "h3";
}) {
  return (
    <ul className="grid gap-[21px] sm:grid-cols-2 lg:grid-cols-3">
      {posts.map(post => (
        <li key={post.id}>
          <PostCard post={post} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
