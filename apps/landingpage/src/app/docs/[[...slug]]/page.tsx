import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARTICLE_CARD_CLASS, ARTICLE_PROSE_CLASS } from "@/components/article/articleStyles";
import { BrandButtons } from "@/components/docs/BrandButtons";
import { DocsEnhance } from "@/components/docs/DocsEnhance";
import { DocsIndex } from "@/components/docs/DocsIndex";
import { DocsPager } from "@/components/docs/DocsPager";
import { DocsToc } from "@/components/docs/DocsToc";
import { getDocBySlug, getDocNeighbors, getDocSlugs } from "@/lib/docs";
import { renderDoc } from "@/lib/docsRender";

interface DocPageProps {
  params: Promise<{ slug?: string[] }>;
}

const BRAND_BUTTONS_MARKER = "<p>{{BRAND_BUTTONS}}</p>";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: [] }, ...getDocSlugs().map(slug => ({ slug: [slug] }))];
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!slug?.[0]) {
    return {
      title: "Developers | Amped.Bio",
      description:
        "Add Sign in with Amped.Bio to your application using OAuth 2.1 and OpenID Connect.",
    };
  }
  const doc = slug.length === 1 ? getDocBySlug(slug[0]) : null;
  if (!doc) return { title: "Page not found | Amped.Bio", robots: { index: false } };
  return { title: `${doc.title} | Amped.Bio Developers`, description: doc.description };
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug } = await params;

  // /docs renders the Developers home; an unknown page is a 404 (090 I17)
  if (!slug?.[0]) return <DocsIndex />;
  const doc = slug.length === 1 ? getDocBySlug(slug[0]) : null;
  if (!doc) notFound();

  const { html, headings } = await renderDoc(doc.content);
  const [before, after] = html.includes(BRAND_BUTTONS_MARKER)
    ? html.split(BRAND_BUTTONS_MARKER)
    : [html, null];
  const { previous, next } = getDocNeighbors(doc.slug);

  return (
    <div className="flex items-start gap-[34px]">
      <div className="min-w-0 flex-1">
        <article className={ARTICLE_CARD_CLASS}>
          <header className="mx-auto max-w-[610px]">
            <h1 className="text-prism-card-title text-prism-ink">{doc.title}</h1>
            {doc.description && (
              <p className="mt-[8px] text-prism-body text-prism-ink-2">{doc.description}</p>
            )}
          </header>
          <DocsEnhance>
            <div className={`mx-auto mt-[34px] max-w-[610px] ${ARTICLE_PROSE_CLASS}`}>
              <div dangerouslySetInnerHTML={{ __html: before }} />
              {after !== null && (
                <>
                  <BrandButtons />
                  <div dangerouslySetInnerHTML={{ __html: after }} />
                </>
              )}
            </div>
          </DocsEnhance>
        </article>
        <div className="mx-auto max-w-[720px]">
          <DocsPager previous={previous} next={next} />
        </div>
      </div>
      <DocsToc headings={headings} />
    </div>
  );
}
