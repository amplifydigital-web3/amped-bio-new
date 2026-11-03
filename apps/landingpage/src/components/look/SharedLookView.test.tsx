import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SharedLook } from "@/lib/sharedLook";

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { handle: string } },
  isPending: false,
  applyShared: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: mocks.session, isPending: mocks.isPending }) },
}));
vi.mock("@/lib/trpc", () => ({
  trpcClient: {
    theme: {
      applyShared: { mutate: mocks.applyShared },
      restore: { mutate: mocks.restore },
    },
  },
}));
vi.mock("@/lib/panel", () => ({ getPanelEditUrl: (h: string) => `https://app.test/${h}/edit` }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/layout/PublicPage", () => ({
  Eyebrow: ({ children }: any) => <p>{children}</p>,
}));
vi.mock("@repo/ui", () => ({
  Button: ({ asChild, children, variant: _v, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>,
  CreatorButton: ({ label }: any) => <span>{label}</span>,
  CreatorPage: ({ profile, blocks }: any) => (
    <div data-testid="preview">
      {profile.name}
      {blocks}
    </div>
  ),
  themeFileName: (n: string) => n.replace(/\s+/g, "-"),
  usePausedChoice: () => [false, vi.fn()],
}));

import {
  CARRY_LINE,
  LIMIT_LINE,
  SharedLookView,
  costLine,
  signUpHref,
  usesLine,
} from "./SharedLookView";

const look: SharedLook = {
  slug: "abcdefgh",
  name: "Northern Lights",
  author: "alice",
  config: { buttonColor: "#00ffaa", containerColor: "#111133", fontColor: "#ffffff" } as never,
  cost: {
    level: "heavy",
    count: 2,
    parts: [
      { layer: "scene", label: "Aurora", cost: "heavy" },
      { layer: "buttonHover", label: "Magnet", cost: "light" },
    ],
  },
  uses: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  download: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = null;
  mocks.isPending = false;
  window.history.replaceState(null, "", "/t/abcdefgh");
});

describe("shared look helpers", () => {
  it("reads the cost in the spec's words", () => {
    expect(costLine(look.cost)).toBe("Heavy, 2 effects. Slower phones show the still version.");
    expect(costLine({ level: "light", count: 1, parts: [] })).toBe("Light, 1 effect.");
    expect(costLine({ level: "still", count: 0, parts: [] })).toBe(
      "Still. Nothing on the page moves."
    );
  });

  it("counts uses, and says nothing before the first", () => {
    expect(usesLine(0)).toBeNull();
    expect(usesLine(1)).toBe("Used once");
    expect(usesLine(1200)).toBe("Used 1,200 times");
  });

  it("sends a signed out visitor through sign up and back to finish", () => {
    expect(signUpHref("abcdefgh", "apply")).toBe(
      "/register?returnTo=%2Ft%2Fabcdefgh%3Fuse%3Dapply"
    );
  });

  it("keeps every line free of dashes", () => {
    for (const line of [CARRY_LINE, LIMIT_LINE, costLine(look.cost)]) {
      expect(line).not.toMatch(/[–—]| - /);
    }
  });
});

describe("SharedLookView", () => {
  it("shows the look, its author, layers and colors on placeholder content", () => {
    render(<SharedLookView look={look} />);
    expect(screen.getByRole("heading", { level: 1, name: "Northern Lights" })).toBeTruthy();
    expect(screen.getByText("@alice").getAttribute("href")).toBe("/alice");
    expect(screen.getByText("Aurora")).toBeTruthy();
    expect(screen.getByText("Magnet")).toBeTruthy();
    expect(screen.getByText("Colors")).toBeTruthy();
    expect(screen.getByTestId("preview").textContent).toContain("Your name");
    expect(screen.getAllByText("Your link")).toHaveLength(3);
    expect(screen.getByText(CARRY_LINE)).toBeTruthy();
  });

  it("hides Made by with credit off and Download unless allowed", () => {
    const { rerender } = render(<SharedLookView look={{ ...look, author: null }} />);
    expect(screen.queryByText(/Made by/)).toBeNull();
    expect(screen.queryByText("Download .ampedtheme")).toBeNull();
    rerender(<SharedLookView look={{ ...look, download: true }} />);
    expect(screen.getByText("Download .ampedtheme")).toBeTruthy();
  });

  it("signed out, both actions go through sign up", () => {
    render(<SharedLookView look={look} />);
    expect(screen.getByText("Use this look").getAttribute("href")).toBe(
      signUpHref("abcdefgh", "apply")
    );
    expect(screen.getByText("Save to My looks").getAttribute("href")).toBe(
      signUpHref("abcdefgh", "save")
    );
    expect(mocks.applyShared).not.toHaveBeenCalled();
  });

  it("signed in, Use this look applies at once and offers Undo", async () => {
    mocks.session = { user: { handle: "bob" } };
    mocks.applyShared.mockResolvedValue({
      themeId: 9,
      mode: "apply",
      undoVersionId: 77,
      backgroundKept: false,
    });
    mocks.restore.mockResolvedValue({});
    render(<SharedLookView look={look} />);
    fireEvent.click(screen.getByText("Use this look"));
    await waitFor(() => expect(screen.getByText(/Applied to your page/)).toBeTruthy());
    expect(mocks.applyShared).toHaveBeenCalledWith({ slug: "abcdefgh", mode: "apply" });
    expect(screen.getByText("Open editor").getAttribute("href")).toBe("https://app.test/bob/edit");
    fireEvent.click(screen.getByText("Undo"));
    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith({ id: 9, versionId: 77 }));
  });

  it("back from sign up with ?use=save, finishes the save once and clears the param", async () => {
    window.history.replaceState(null, "", "/t/abcdefgh?use=save");
    mocks.session = { user: { handle: "bob" } };
    mocks.applyShared.mockResolvedValue({
      themeId: 10,
      mode: "save",
      undoVersionId: null,
      backgroundKept: true,
    });
    render(<SharedLookView look={look} />);
    await waitFor(() => expect(screen.getByText(/Saved to My looks\./)).toBeTruthy());
    expect(mocks.applyShared).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
    expect(screen.getByText(/Your background stays/)).toBeTruthy();
  });

  it("at 10 looks, says how to make room", async () => {
    mocks.session = { user: { handle: "bob" } };
    mocks.applyShared.mockRejectedValue(new Error("THEME_LIMIT"));
    render(<SharedLookView look={look} />);
    fireEvent.click(screen.getByText("Save to My looks"));
    await waitFor(() => expect(screen.getByText(LIMIT_LINE)).toBeTruthy());
  });
});
