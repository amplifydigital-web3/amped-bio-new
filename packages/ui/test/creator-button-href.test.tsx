import { renderToStaticMarkup } from "react-dom/server";
import { CreatorButton } from "../src/creator/creator-button";

// Build Board D57: the shared creator button never renders a script link.

const render = (href: string | undefined) =>
  renderToStaticMarkup(<CreatorButton theme={null} label="Shop" href={href} />);

describe("CreatorButton href", () => {
  it.each(["javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "//evil.example"])(
    "renders %j as a button with no link",
    href => {
      const html = render(href);
      expect(html).not.toContain("<a ");
      expect(html).not.toMatch(/javascript|data:|evil/i);
      expect(html).toContain("<button");
      expect(html).not.toContain("opens in a new tab");
    }
  );

  it("keeps safe links and site paths", () => {
    expect(render("https://example.com")).toContain('href="https://example.com"');
    expect(render("mailto:a@b.co")).toContain('href="mailto:a@b.co"');
    expect(render("/i/pools/0xabc")).toContain('href="/i/pools/0xabc"');
  });
});
