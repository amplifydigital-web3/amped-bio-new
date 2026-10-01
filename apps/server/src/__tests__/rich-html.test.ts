/**
 * Tests for the shared rich text sanitizer (packages/constants/src/html.ts) and the
 * block config wrapper the server applies on save and on public reads.
 */
import { describe, it, expect } from "vitest";
import {
  htmlToPlainText,
  looksLikeHtml,
  sanitizeRichHtml,
  sanitizeRichText,
} from "@repo/constants";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";

describe("sanitizeRichHtml: XSS payloads", () => {
  const payloads: Array<[string, string]> = [
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["script tag", "<script>alert(1)</script>"],
    ["unclosed script", "<script>alert(1)"],
    ["split script", "<scr<script>ipt>alert(1)</script>"],
    ["svg onload", "<svg onload=alert(1)></svg>"],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["javascript href", '<a href="javascript:alert(1)">x</a>'],
    ["javascript href with tab entity", '<a href="java&#x09;script:alert(1)">x</a>'],
    ["javascript href with control char", '<a href="java\tscript:alert(1)">x</a>'],
    ["data href", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ["onclick on allowed tag", '<a href="https://ok.example" onclick="alert(1)">x</a>'],
    ["unquoted attribute breakout", "<p style=x onmouseover=alert(1)>x</p>"],
    ["style expression", '<p style="background:url(javascript:alert(1))">x</p>'],
    ["html comment", "<!--<img src=x onerror=alert(1)>-->"],
  ];

  it.each(payloads)("neutralizes %s", (_name, payload) => {
    const out = sanitizeRichHtml(payload);
    expect(out).not.toMatch(/<(script|img|svg|iframe)\b/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:/i);
    expect(out).not.toMatch(/url\(/i);
  });
});

describe("sanitizeRichHtml: allowed markup", () => {
  it("keeps Slate formatting tags", () => {
    const html = "<p><strong>a</strong> <em>b</em> <u>c</u> <s>d</s> <code>e</code></p>";
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it("keeps text-align on paragraphs and lists", () => {
    expect(sanitizeRichHtml('<p style="text-align: center">x</p>')).toBe(
      '<p style="text-align: center">x</p>'
    );
    expect(sanitizeRichHtml('<ol style="text-align: right"><li>x</li></ol>')).toBe(
      '<ol style="text-align: right"><li>x</li></ol>'
    );
    expect(sanitizeRichHtml('<ul style="text-align: left"><li>x</li></ul>')).toBe(
      '<ul style="text-align: left"><li>x</li></ul>'
    );
  });

  it("rebuilds links with a safe target and rel", () => {
    expect(sanitizeRichHtml('<a href="https://amped.bio">x</a>')).toBe(
      '<a href="https://amped.bio" target="_blank" rel="noopener noreferrer nofollow">x</a>'
    );
  });

  it("keeps the text of stray dangerous tag names", () => {
    expect(sanitizeRichHtml("<p>I love <svg icons and more text</p>")).toBe(
      "<p>I love &lt;svg icons and more text</p>"
    );
  });
});

describe("sanitizeRichText", () => {
  it("returns plain text unchanged", () => {
    expect(sanitizeRichText("Tom & Jerry")).toBe("Tom & Jerry");
    expect(sanitizeRichText("I <3 music")).toBe("I <3 music");
  });

  it("passes null, undefined and empty values through", () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText(undefined)).toBeUndefined();
    expect(sanitizeRichText("")).toBe("");
  });

  it("sanitizes values that contain markup", () => {
    expect(sanitizeRichText('<p>hi</p><img src=x onerror="alert(1)">')).toBe("<p>hi</p>");
  });

  it("uses the same HTML heuristic as the clients", () => {
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
    expect(looksLikeHtml("a </b>")).toBe(true);
    expect(looksLikeHtml("I <3 music")).toBe(false);
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToPlainText("<p>Tom &amp; <strong>Jerry</strong></p><script>x</script>")).toBe(
      "Tom & Jerry"
    );
  });
});

describe("sanitizeBlockConfig", () => {
  it("sanitizes HTML content of text blocks", () => {
    const config = { content: "<p>x</p><script>alert(1)</script>", platform: "text" };
    expect(sanitizeBlockConfig("text", config)).toEqual({ content: "<p>x</p>", platform: "text" });
  });

  it("keeps plain text content of text blocks unchanged", () => {
    const config = { content: "Tom & Jerry" };
    expect(sanitizeBlockConfig("text", config)).toEqual(config);
  });

  it("leaves other block types untouched", () => {
    const config = { content: "<script>alert(1)</script>" };
    expect(sanitizeBlockConfig("link", config)).toBe(config);
  });
});
