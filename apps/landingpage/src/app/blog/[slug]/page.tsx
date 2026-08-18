import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/components/layout/PublicHeader";
import {
  formatPostDate,
  getBlogPostBySlug,
  getBlogPosts,
  getPostFeaturedImage,
  stripHtml,
} from "@/lib/blog";

// Statically generate each post; revalidate every 10 minutes
export const revalidate = 600;

export async function generateStaticParams() {
  const posts = await getBlogPosts(50);
  return posts.map((post) => ({ slug: post.slug }));
}

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return { title: "Post not found | Amped.Bio" };

  const title = `${post.title.rendered} | Amped.Bio`;
  const description = stripHtml(post.excerpt.rendered);
  const ogUrl = `/og?title=${encodeURIComponent(stripHtml(post.title.rendered))}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: post.title.rendered }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) notFound();

  const image = getPostFeaturedImage(post);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicHeader />
      <main className="flex-grow">
        <article className="mx-auto max-w-3xl px-6 py-12">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
          </Link>

          <h1 className="mt-6 text-4xl font-bold text-gray-900">{post.title.rendered}</h1>
          <p className="mt-3 text-sm text-gray-500">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
          </p>

          {image ? (
            <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-xl">
              <Image
                src={image}
                alt={post.title.rendered}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
              />
            </div>
          ) : null}

          <div
            className="mt-8 text-gray-800 [&_p]:mb-5 [&_p]:leading-7 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800 [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-gray-900 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-gray-100 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-red-600 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-100 [&_img]:my-6 [&_img]:mx-auto [&_img]:rounded-lg [&_hr]:my-8 [&_figure]:my-6 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-gray-500 [&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_iframe]:my-6 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg"
            dangerouslySetInnerHTML={{ __html: post.content.rendered }}
          />
        </article>
      </main>
    </div>
  );
}
