import {
  addBlockSchema,
  blockSchema,
  isSafeHref,
  isSafeWebUrl,
  linkConfigSchema,
  mediaConfigSchema,
  normalizeHref,
  safeHref,
  safeRenderHref,
} from "../src/index";

// Build Board D57: a creator's link must never run script on amped.bio.

const UNSAFE = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "JAVASCRIPT:alert(document.cookie)",
  "  javascript:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "\u0000javascript:alert(1)",
  "javascript\u0001:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "DATA:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "blob:https://amped.bio/x",
  "//evil.example/path",
  "/relative/path",
  "example.com",
  "https:evil.example",
  "",
  // Encodings and lookalikes a browser never reads as http(s)
  "java%73cript:alert(1)",
  "&#106;avascript:alert(1)",
  "javascript&colon;alert(1)",
  "javascript://%0aalert(1)",
  "javascript://example.com/%0aalert(1)",
  "\r\njavascript:alert(1)",
  " \u0008\u001fjavascript:alert(1)",
  "\u007fjavascript:alert(1)",
  "javascript:alert(1)\u0000",
  " javascript:alert(1)",
  "java​script:alert(1)",
  "ｊavascript:alert(1)",
  "javаscript:alert(1)",
  "vBsCrIpT:msgbox(1)",
  "\tdata:text/html,<script>alert(1)</script>",
  "https:///evil.example",
  "https:\\\\evil.example",
];

const SAFE_LINKS = [
  "https://robfrasca.com",
  "HTTPS://Example.com/Path?q=1#x",
  "http://example.com",
  "mailto:name@example.com",
  "tel:+15551234567",
];

describe("isSafeHref", () => {
  it.each(UNSAFE)("refuses %j", value => {
    expect(isSafeHref(value)).toBe(false);
    expect(safeHref(value)).toBeUndefined();
  });

  it.each(SAFE_LINKS)("accepts %j", value => {
    expect(isSafeHref(value)).toBe(true);
    expect(safeHref(value)).toBe(value);
  });

  it("refuses values that are not strings", () => {
    for (const value of [null, undefined, 1, {}, ["https://a.b"]]) {
      expect(isSafeHref(value)).toBe(false);
    }
  });

  it("strips whitespace and control characters the way browsers read a scheme", () => {
    expect(normalizeHref(" java\tscr\nipt:x ")).toBe("javascript:x");
  });
});

describe("isSafeWebUrl", () => {
  it("takes http and https only", () => {
    expect(isSafeWebUrl("https://youtu.be/x")).toBe(true);
    expect(isSafeWebUrl("http://example.com")).toBe(true);
    expect(isSafeWebUrl("mailto:a@b.co")).toBe(false);
    expect(isSafeWebUrl("tel:+1555")).toBe(false);
    expect(isSafeWebUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("safeRenderHref", () => {
  it("keeps safe links and site paths", () => {
    expect(safeRenderHref("https://example.com")).toBe("https://example.com");
    expect(safeRenderHref("/i/pools/0xabc")).toBe("/i/pools/0xabc");
  });

  it("refuses other sites written as paths, and script", () => {
    expect(safeRenderHref("//evil.example")).toBeUndefined();
    expect(safeRenderHref("/\\evil.example")).toBeUndefined();
    expect(safeRenderHref("/\t/evil.example")).toBeUndefined();
    expect(safeRenderHref("javascript:alert(1)")).toBeUndefined();
    expect(safeRenderHref(undefined)).toBeUndefined();
  });
});

describe("link and media block schemas", () => {
  const link = (url: string) => ({ platform: "custom", url, label: "Shop" });
  const media = (url: string) => ({ platform: "youtube", url, label: "" });

  it("refuses script links that z.string().url() accepted", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "JavaScript://x%0aalert(1)",
    ]) {
      const result = linkConfigSchema.safeParse(link(url));
      expect(result.success).toBe(false);
    }
    const message = linkConfigSchema.safeParse(link("javascript:alert(1)"));
    expect(message.success ? "" : message.error.issues[0]?.message).toBe(
      "Use a link that starts with https://, mailto: or tel:"
    );
  });

  it("keeps the links the editor writes", () => {
    for (const url of SAFE_LINKS) expect(linkConfigSchema.safeParse(link(url)).success).toBe(true);
  });

  it("accepts an empty link, which never renders", () => {
    expect(linkConfigSchema.safeParse(link("")).success).toBe(true);
    expect(mediaConfigSchema.safeParse(media("")).success).toBe(true);
  });

  it("still refuses text that is not a URL", () => {
    expect(linkConfigSchema.safeParse(link("not a url")).success).toBe(false);
  });

  it("takes only http and https embeds", () => {
    expect(mediaConfigSchema.safeParse(media("https://youtu.be/abc")).success).toBe(true);
    expect(mediaConfigSchema.safeParse(media("javascript:alert(1)")).success).toBe(false);
    expect(mediaConfigSchema.safeParse(media("mailto:a@b.co")).success).toBe(false);
  });

  it("refuses a script link through addBlock and the save schemas", () => {
    const config = link("javascript:alert(1)");
    expect(addBlockSchema.safeParse({ type: "link", config }).success).toBe(false);
    expect(blockSchema.safeParse({ id: 1, type: "link", order: 0, config }).success).toBe(false);
    expect(
      blockSchema.safeParse({ id: 1, type: "link", order: 0, config: link("https://a.example") })
        .success
    ).toBe(true);
  });
});
