import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";

/**
 * Screen Review 090: the docs Markdown pipeline. Every class and control is
 * emitted in the server rendered HTML (I11), so code blocks, tables, notices
 * and anchors look final with JavaScript off. DocsEnhance only wires clicks.
 */

// 090 D1: four syntax roles on existing tokens, each at least 4.5:1 on the slab
const PRISM_CODE_THEME = {
  name: "amped-prism",
  type: "light",
  colors: { "editor.foreground": "#16152B", "editor.background": "#FFFFFF" },
  tokenColors: [
    { settings: { foreground: "#16152B" } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#524F73" },
    },
    {
      scope: ["string", "string.quoted", "string.template", "constant.other.symbol"],
      settings: { foreground: "#0B5A80" },
    },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "variable.language",
        "constant.language",
        "support.type.property-name",
        "entity.name.tag",
      ],
      settings: { foreground: "#5650A2" },
    },
  ],
};

const LANGUAGE_LABELS: Record<string, string> = {
  js: "JS",
  javascript: "JS",
  ts: "TS",
  typescript: "TS",
  bash: "Bash",
  sh: "Bash",
  shell: "Bash",
  json: "JSON",
  html: "HTML",
  plaintext: "Text",
  text: "Text",
};

export type DocHeading = { id: string; text: string; depth: 2 | 3 };

/* ---------------------------------------------------------------------- */
/* A minimal hast toolkit (no extra dependencies)                          */
/* ---------------------------------------------------------------------- */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const el = (
  tagName: string,
  properties: Record<string, unknown> = {},
  children: HastNode[] = []
): HastNode => ({ type: "element", tagName, properties, children });
const text = (value: string): HastNode => ({ type: "text", value });

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function walk(
  node: HastNode,
  visit: (node: HastNode, parent: HastNode | null, index: number) => void
) {
  const go = (current: HastNode, parent: HastNode | null, index: number) => {
    visit(current, parent, index);
    current.children?.forEach((child, childIndex) => go(child, current, childIndex));
  };
  go(node, null, 0);
}

// Lucide icon paths, inlined so the HTML is complete without React
const ICON = {
  copy: [
    el("rect", { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }),
    el("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }),
  ],
  link: [
    el("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
    el("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }),
  ],
  info: [
    el("circle", { cx: 12, cy: 12, r: 10 }),
    el("path", { d: "M12 16v-4" }),
    el("path", { d: "M12 8h.01" }),
  ],
  external: [
    el("path", { d: "M15 3h6v6" }),
    el("path", { d: "M10 14 21 3" }),
    el("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
  ],
};

const icon = (name: keyof typeof ICON, className: string) =>
  el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
      className: [className],
    },
    ICON[name]
  );

const SLAB =
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.7))] shadow-[inset_0_1px_0_#FFFFFF,inset_0_0_0_1px_rgba(22,21,43,0.08),3px_8px_21px_rgba(46,20,60,0.06)]";

/* ---------------------------------------------------------------------- */
/* Plugins                                                                 */
/* ---------------------------------------------------------------------- */

// 090 I10, I11, I25: the code slab with a 44 header row (language, Copy)
function rehypeCodeSlab() {
  return (tree: HastNode) => {
    walk(tree, node => {
      if (node.tagName !== "figure" || !node.properties) return;
      if (
        !("dataRehypePrettyCodeFigure" in node.properties) &&
        !("data-rehype-pretty-code-figure" in node.properties)
      )
        return;
      const pre = node.children?.find(child => child.tagName === "pre");
      if (!pre) return;
      const language = String(
        pre.properties?.dataLanguage ?? pre.properties?.["data-language"] ?? "plaintext"
      ).toLowerCase();
      const label = LANGUAGE_LABELS[language] ?? language.toUpperCase();
      node.properties.className = [
        "docs-code",
        "my-[21px]",
        "overflow-hidden",
        "rounded-prism-21",
        ...SLAB.split(" "),
      ];
      pre.properties = {
        ...pre.properties,
        className: [
          "!my-0",
          "!rounded-none",
          "!bg-none",
          "!bg-transparent",
          "!shadow-none",
          "overflow-x-auto",
          "!px-[21px]",
          "!py-[13px]",
        ],
        tabIndex: 0,
      };
      const header = el(
        "div",
        {
          className: [
            "flex",
            "h-touch",
            "items-center",
            "justify-between",
            "border-b",
            "border-prism-line",
            "pl-[21px]",
            "pr-[5px]",
          ],
        },
        [
          el("span", { className: ["text-prism-eyebrow", "uppercase", "text-prism-ink-2"] }, [
            text(label),
          ]),
          el(
            "button",
            {
              type: "button",
              dataCopyCode: "",
              className: [
                "prism-btn-secondary",
                "prism-focus",
                "inline-flex",
                "h-touch",
                "items-center",
                "gap-2",
                "rounded-prism-13",
                "px-[13px]",
                "text-prism-label",
                "font-semibold",
              ],
            },
            [icon("copy", "h-[21px] w-[21px]"), el("span", { dataCopyLabel: "" }, [text("Copy")])]
          ),
        ]
      );
      node.children = [header, ...(node.children ?? [])];
    });
  };
}

// 090 I14, I15: collect the headings and give each an anchor copy button
function rehypeHeadings(headings: DocHeading[]) {
  return () => (tree: HastNode) => {
    walk(tree, node => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;
      const id = String(node.properties?.id ?? "");
      if (!id) return;
      const label = textOf(node).trim();
      headings.push({ id, text: label, depth: node.tagName === "h2" ? 2 : 3 });
      node.properties = {
        ...node.properties,
        className: ["group", "flex", "items-center", "gap-1", "scroll-mt-[89px]"],
      };
      node.children = [
        el("span", {}, node.children ?? []),
        el(
          "button",
          {
            type: "button",
            dataCopyAnchor: id,
            ariaLabel: `Copy link to ${label}`,
            className: [
              "prism-icon-btn",
              "prism-focus",
              "shrink-0",
              "opacity-0",
              "transition-opacity",
              "group-hover:opacity-100",
              "focus-visible:opacity-100",
              "motion-reduce:transition-none",
            ],
          },
          [icon("link", "h-[21px] w-[21px] text-prism-ink-2")]
        ),
      ];
    });
  };
}

// 090 I12: tables scroll inside their own focusable region named by the h2
function rehypeTableRegions() {
  return (tree: HastNode) => {
    let lastH2 = "Table";
    walk(tree, (node, parent, index) => {
      if (node.tagName === "h2") lastH2 = textOf(node).trim() || lastH2;
      if (node.tagName !== "table" || !parent?.children) return;
      if (parent.tagName === "div" && parent.properties?.role === "region") return;
      parent.children[index] = el(
        "div",
        {
          role: "region",
          tabIndex: 0,
          ariaLabel: lastH2,
          className: ["prism-focus", "my-[21px]", "overflow-x-auto", "rounded-prism-21"],
        },
        [{ ...node, properties: { ...node.properties, className: ["!my-0", "min-w-[480px]"] } }]
      );
    });
  };
}

// 090 I24: blockquotes are the informational notice
function rehypeInfoNotice() {
  return (tree: HastNode) => {
    walk(tree, node => {
      if (node.tagName !== "blockquote") return;
      node.tagName = "div";
      node.properties = {
        role: "note",
        className: [
          "prism-glass-clear",
          "!rounded-prism-13",
          "my-[21px]",
          "flex",
          "items-start",
          "gap-[13px]",
          "py-[13px]",
          "pl-[13px]",
          "pr-[21px]",
          "text-prism-ink",
          "[&_p]:!my-0",
        ],
      };
      node.children = [
        icon("info", "mt-[2px] h-[21px] w-[21px] shrink-0 text-prism-nav"),
        el("div", { className: ["min-w-0", "flex-1", "space-y-2"] }, node.children ?? []),
      ];
    });
  };
}

// 090 I09: external links open in a new tab with the 13 external icon
function rehypeExternalLinks() {
  return (tree: HastNode) => {
    walk(tree, node => {
      if (node.tagName !== "a") return;
      const href = String(node.properties?.href ?? "");
      if (!/^https?:\/\//.test(href)) return;
      if (
        /^https?:\/\/([a-z0-9-]+\.)*amped\.bio(\/|$)/i.test(href) &&
        !href.includes("auth.amped.bio")
      )
        return;
      node.properties = { ...node.properties, target: "_blank", rel: "noopener noreferrer" };
      node.children = [
        ...(node.children ?? []),
        icon("external", "ml-1 inline h-[13px] w-[13px] align-[-1px]"),
        el("span", { className: ["sr-only"] }, [text(" (opens in a new tab)")]),
      ];
    });
  };
}

/** Renders a docs page. {{APP_URL}} becomes the editor URL of this environment. */
export async function renderDoc(
  markdown: string
): Promise<{ html: string; headings: DocHeading[] }> {
  const headings: DocHeading[] = [];
  const appUrl = process.env.NEXT_PUBLIC_PANEL_URL || "https://app.amped.bio";
  const source = markdown.replaceAll("{{APP_URL}}", appUrl);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypePrettyCode, {
      theme: PRISM_CODE_THEME as never,
      keepBackground: false,
      defaultLang: "plaintext",
    })
    .use(rehypeCodeSlab)
    .use(rehypeHeadings(headings))
    .use(rehypeTableRegions)
    .use(rehypeInfoNotice)
    .use(rehypeExternalLinks)
    .use(rehypeStringify)
    .process(source);
  return { html: String(file), headings };
}
