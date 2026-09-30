import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { PublicHeader } from "@/components/layout/PublicHeader";

// The notice text lives in src/content/legal/privacy.md so legal edits are a
// one file change. Rendered at build time.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Notice | Amped.Bio",
  description:
    "What personal information Amped.Bio collects, why, who receives it, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

async function renderNotice(): Promise<string> {
  const filePath = path.join(process.cwd(), "src", "content", "legal", "privacy.md");
  const markdown = fs.readFileSync(filePath, "utf8");
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

export default async function PrivacyPage() {
  const html = await renderNotice();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <article
          className="text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 [&_li]:leading-7 [&_p]:mb-4 [&_p]:leading-7 [&_table]:mb-6 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-900 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </div>
  );
}
