import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/layout/PublicHeader";
import {
  formatPostDate,
  getBlogPosts,
  getPostCategory,
  getPostFeaturedImage,
  stripHtml,
} from "@/lib/blog";

// Statically generate the listing; revalidate every 10 minutes
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Blog | Amped.Bio",
  description: "News and updates from the Amped Bio team.",
};

export default async function BlogPage() {
  const posts = await getBlogPosts();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicHeader />
      <main className="flex-grow">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900">Blog</h1>
          <p className="mt-2 text-gray-600">News and updates from the Amped Bio team.</p>

          {posts.length === 0 ? (
            <p className="mt-12 text-gray-500">No posts published yet. Check back soon.</p>
          ) : (
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => {
                const image = getPostFeaturedImage(post);
                const category = getPostCategory(post);
                return (
                  <Link
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
                      {image ? (
                        <Image
                          src={image}
                          alt={post.title.rendered}
                          fill
                          className="object-cover transition group-hover:scale-105"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-col flex-grow p-5">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                        {category ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{category.name}</span>
                          </>
                        ) : null}
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600">
                        {post.title.rendered}
                      </h2>
                      <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                        {stripHtml(post.excerpt.rendered)}
                      </p>
                      <span className="mt-4 text-sm font-medium text-blue-600">Read more →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
