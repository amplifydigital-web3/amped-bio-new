import { decodeHtmlEntities } from "@/lib/htmlEntities";

// Server side allowlist sanitizer for WordPress post HTML (Screen Review
// 072 I11). It never passes markup through: it reads the input as tags and
// text and writes a new document that holds only allowlisted elements and
// attributes, with every value escaped again. Anything it does not recognize
// is written out as escaped text. script, style and similar elements are
// dropped with their content, and no on* attribute can survive because only
// listed attributes are copied.

const ALLOWED_TAGS = new Set([
  "p",
  "h2",
  "h3",
  "h4",
  "a",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "img",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  // Line breaks inside paragraphs carry no attributes and no risk
  "br",
  "iframe",
]);

// Attributes kept: a href; img src, alt, width, height; iframe src. Every
// other attribute is dropped, which removes on* handlers and inline styles.

const VOID_TAGS = new Set(["img", "hr", "br"]);

// Removed together with everything inside them
const DROP_CONTENT_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "textarea",
  "title",
  "object",
  "embed",
  "svg",
  "math",
  "select",
  "iframe",
]);

const IFRAME_HOSTS = new Set(["youtube.com", "www.youtube.com", "player.vimeo.com"]);

const OPEN_TAG =
  /^<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/;
const CLOSE_TAG = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function escapeText(text: string): string {
  return text
    .replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    const raw = match[2] ?? match[3] ?? match[4] ?? "";
    if (!(name in attributes)) attributes[name] = decodeHtmlEntities(raw);
  }
  return attributes;
}

// Returns the URL when it is safe for the attribute, else null. Control
// characters and spaces are removed before the scheme is read, the way
// browsers do, so "java\tscript:" cannot slip through.
function safeUrl(value: string, schemes: string[]): string | null {
  // eslint-disable-next-line no-control-regex -- control characters are what this removes
  const compact = value.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!compact) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    // Relative URL; a protocol relative one must still be http(s)
    return compact.startsWith("//") && !schemes.includes("https") ? null : value.trim();
  }
  return schemes.includes(scheme) ? value.trim() : null;
}

function isExternal(href: string, siteHosts: string[]): boolean {
  try {
    const url = new URL(href, "https://amped.bio");
    if (url.protocol === "mailto:") return false;
    return !siteHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function buildOpenTag(
  tag: string,
  attributes: Record<string, string>,
  siteHosts: string[]
): string | null {
  const out: string[] = [];

  if (tag === "a") {
    const href = attributes.href ? safeUrl(attributes.href, ["http", "https", "mailto"]) : null;
    if (href) {
      out.push(`href="${escapeAttribute(href)}"`);
      // Links to other sites open in a new tab with rel noopener
      if (isExternal(href, siteHosts)) out.push('target="_blank" rel="noopener noreferrer"');
    }
  } else if (tag === "img") {
    const src = attributes.src ? safeUrl(attributes.src, ["http", "https"]) : null;
    if (!src) return null;
    out.push(`src="${escapeAttribute(src)}"`);
    out.push(`alt="${escapeAttribute(attributes.alt ?? "")}"`);
    for (const size of ["width", "height"]) {
      if (/^\d{1,5}$/.test(attributes[size] ?? "")) out.push(`${size}="${attributes[size]}"`);
    }
    out.push('loading="lazy"');
  } else if (tag === "iframe") {
    const src = attributes.src ? safeUrl(attributes.src, ["https"]) : null;
    if (!src) return null;
    try {
      const url = new URL(src.startsWith("//") ? `https:${src}` : src);
      if (url.protocol !== "https:" || !IFRAME_HOSTS.has(url.hostname)) return null;
      out.push(`src="${escapeAttribute(url.toString())}"`);
    } catch {
      return null;
    }
    out.push('loading="lazy" allowfullscreen');
  }

  return `<${tag}${out.length ? ` ${out.join(" ")}` : ""}>`;
}

/**
 * Sanitize CMS HTML against the 072 I11 allowlist. `siteHosts` are the hosts
 * whose links stay in the same tab.
 */
export function sanitizePostHtml(
  html: string,
  siteHosts: string[] = ["amped.bio", "www.amped.bio", "staging.amped.bio"]
): string {
  const out: string[] = [];
  const open: string[] = [];
  let index = 0;

  const closeTo = (tag: string) => {
    const at = open.lastIndexOf(tag);
    if (at === -1) return;
    while (open.length > at) out.push(`</${open.pop()}>`);
  };

  while (index < html.length) {
    const next = html.indexOf("<", index);
    if (next === -1) {
      out.push(escapeText(html.slice(index)));
      break;
    }
    if (next > index) out.push(escapeText(html.slice(index, next)));
    index = next;
    const rest = html.slice(index);

    // Comments, doctypes and processing instructions are dropped
    if (rest.startsWith("<!--")) {
      const end = html.indexOf("-->", index + 4);
      index = end === -1 ? html.length : end + 3;
      continue;
    }
    if (/^<[!?]/.test(rest)) {
      const end = html.indexOf(">", index);
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    const close = CLOSE_TAG.exec(rest);
    if (close) {
      const tag = close[1].toLowerCase();
      if (ALLOWED_TAGS.has(tag) && !VOID_TAGS.has(tag)) closeTo(tag);
      index += close[0].length;
      continue;
    }

    const opening = OPEN_TAG.exec(rest);
    if (!opening) {
      out.push("&lt;");
      index += 1;
      continue;
    }

    const tag = opening[1].toLowerCase();
    index += opening[0].length;
    const attributes = parseAttributes(opening[2] ?? "");

    if (tag === "iframe") {
      // Only the allowlisted players survive; the element's content never does
      const built = buildOpenTag(tag, attributes, siteHosts);
      const end = rest.toLowerCase().indexOf("</iframe", opening[0].length);
      if (end === -1) index = html.length;
      else {
        const closeEnd = html.indexOf(">", next + end);
        index = closeEnd === -1 ? html.length : closeEnd + 1;
      }
      if (built) out.push(`${built}</iframe>`);
      continue;
    }

    if (DROP_CONTENT_TAGS.has(tag)) {
      if (opening[3] === "/") continue;
      const end = html.toLowerCase().indexOf(`</${tag}`, index);
      if (end === -1) index = html.length;
      else {
        const closeEnd = html.indexOf(">", end);
        index = closeEnd === -1 ? html.length : closeEnd + 1;
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) continue;

    const built = buildOpenTag(tag, attributes, siteHosts);
    if (!built) continue;
    out.push(built);
    if (!VOID_TAGS.has(tag)) open.push(tag);
  }

  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}
