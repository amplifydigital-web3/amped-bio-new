import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { BLOG_PAGE_SIZE, getBlogPosts, toPostCard } from "@/lib/blog";

// Screen Review 072 I08, I09: the blog index asks for the next page of cards
// (Load more) or the first page again (Retry) here. WordPress stays cached for
// 10 minutes by getBlogPosts.
const pageSchema = z.coerce.number().int().min(1).max(1000);

export async function GET(request: NextRequest) {
  const parsed = pageSchema.safeParse(request.nextUrl.searchParams.get("page") ?? "1");
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }
  const result = await getBlogPosts(BLOG_PAGE_SIZE, parsed.data);
  if (result.failed) {
    return NextResponse.json({ error: "The blog service did not respond" }, { status: 502 });
  }
  return NextResponse.json({
    posts: result.posts.map(toPostCard),
    page: parsed.data,
    totalPages: result.totalPages,
  });
}
