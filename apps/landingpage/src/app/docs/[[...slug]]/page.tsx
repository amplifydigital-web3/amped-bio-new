import type { Metadata } from "next";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import { getDocBySlug, getDocSlugs } from "@/lib/docs";
import { DocsIndex } from "@/components/docs/DocsIndex";
import { DocsCodeCopy } from "@/components/docs/DocsCodeCopy";

interface DocPageProps {
  params: Promise<{ slug?: string[] }>;
}

async function renderMarkdown(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypePrettyCode, { theme: "github-dark", keepBackground: false })
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}

export function generateStaticParams() {
  return getDocSlugs().map(slug => ({ slug: [slug] }));
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;

  if (!slug?.[0]) {
    return {
      title: "Developers | Amped.bio",
      description: "Add Sign in with Amped.bio to your application using OAuth 2.1 and OpenID Connect.",
    };
  }

  const doc = getDocBySlug(slug[0]);
  if (!doc) return { title: "Developers | Amped.bio" };

  return {
    title: `${doc.title} | Amped.bio Developers`,
    description: doc.description,
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;

  // `/docs` renders the index; `/docs/<slug>` renders the documentation page.
  if (!slug?.[0]) return <DocsIndex />;

  const doc = getDocBySlug(slug[0]);
  if (!doc) return <DocsIndex />;

  const html = await renderMarkdown(doc.content);

  return (
    <article className="max-w-3xl pb-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{doc.title}</h1>
        {doc.description ? <p className="mt-3 leading-7 text-gray-600">{doc.description}</p> : null}
      </header>

      <DocsCodeCopy>
        <div
          className="text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-200 [&_blockquote]:bg-blue-50 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 [&_li]:leading-7 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_p]:mb-4 [&_p]:leading-7 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-gray-900 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </DocsCodeCopy>
    </article>
  );
}
