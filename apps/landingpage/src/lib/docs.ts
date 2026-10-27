import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// Documentation pages live as `.mdx` files and are currently rendered through a
// remark/rehype pipeline (see lib/docsRender.ts): the landing page
// still runs React 18 while Next 16 evaluates MDX with React 19, so the MDX
// runtime cannot be used yet. Content is plain Markdown with Shiki highlighted
// code blocks; JSX inside these files will start working once the landing page
// is upgraded to React 19.
const DOCS_DIRECTORY = path.join(process.cwd(), "src", "content", "docs");

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  order: number;
  group: string;
}

export interface DocPageWithContent extends DocPage {
  content: string;
}

function readDocFile(fileName: string): DocPageWithContent {
  const filePath = path.join(DOCS_DIRECTORY, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  return {
    slug: fileName.replace(/\.mdx?$/, ""),
    title: typeof data.title === "string" ? data.title : fileName,
    description: typeof data.description === "string" ? data.description : "",
    order: typeof data.order === "number" ? data.order : 100,
    group: typeof data.group === "string" ? data.group : "Guides",
    content,
  };
}

function listDocFiles(): string[] {
  if (!fs.existsSync(DOCS_DIRECTORY)) return [];

  return fs
    .readdirSync(DOCS_DIRECTORY)
    .filter(fileName => /\.mdx?$/.test(fileName))
    .sort();
}

export function getAllDocs(): DocPage[] {
  return listDocFiles()
    .map(fileName => {
      const { content: _content, ...page } = readDocFile(fileName);
      return page;
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export type DocNavGroup = { group: string; pages: DocPage[] };

export function getDocsNavigation(): DocNavGroup[] {
  const groups = new Map<string, DocPage[]>();

  for (const page of getAllDocs()) {
    const pages = groups.get(page.group) ?? [];
    pages.push(page);
    groups.set(page.group, pages);
  }

  return [...groups.entries()].map(([group, pages]) => ({ group, pages }));
}

export function getDocBySlug(slug: string): DocPageWithContent | null {
  const fileName = listDocFiles().find(file => file.replace(/\.mdx?$/, "") === slug);

  return fileName ? readDocFile(fileName) : null;
}

export function getDocSlugs(): string[] {
  return listDocFiles().map(fileName => fileName.replace(/\.mdx?$/, ""));
}

/** 090 I16: previous and next pages in sidebar order */
export function getDocNeighbors(slug: string): { previous: DocPage | null; next: DocPage | null } {
  const pages = getAllDocs();
  const index = pages.findIndex(page => page.slug === slug);
  if (index < 0) return { previous: null, next: null };
  return { previous: pages[index - 1] ?? null, next: pages[index + 1] ?? null };
}
