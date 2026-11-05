/**
 * 18+ on the public site (identity checks 4.4, adult content review 9, PR A1 with
 * R6 and C1): the placeholder card names nothing, the shelf shows the sheet step
 * before a pass and the items after it, and the statutory notices are on every
 * 18+ page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ADULT_FAN_COPY,
  ALABAMA_HEALTH_WARNINGS,
  SAMHSA_HELPLINE_NOTICE,
  type ContentCard,
} from "@repo/constants";

const mocks = vi.hoisted(() => ({ shelf: vi.fn(), item: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@repo/ui", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@repo/ui");
  return { ...actual, MediaPlayer: () => <div data-testid="player" />, ChapterList: () => null };
});
vi.mock("@/lib/trpc", () => ({
  trpcClient: {
    content: {
      listAdultForBio: { query: mocks.shelf },
      getAdult: { query: mocks.item },
      getReadUrl: { query: vi.fn() },
      report: { mutate: vi.fn() },
    },
  },
}));
vi.mock("./PdfViewer", () => ({ PdfViewer: () => <div data-testid="pdf" /> }));

import { AdultItem, AdultItemsCard, AdultShelf, ageCheckUrl } from "./adult";

const card: ContentCard = {
  publicId: "abcdefghijklmnop",
  kind: "image",
  title: "Studio set",
  durationMs: null,
  pageCount: null,
  publishedAt: new Date().toISOString(),
  cover: null,
  blur: null,
  allowDownload: false,
};

function expectNotices(kinds: Array<"warnings" | "helpline">) {
  for (const kind of kinds) {
    const lines = kind === "warnings" ? ALABAMA_HEALTH_WARNINGS : SAMHSA_HELPLINE_NOTICE;
    for (const line of lines) expect(screen.getByText(line)).toBeInTheDocument();
  }
}

beforeEach(() => {
  mocks.shelf.mockReset();
  mocks.item.mockReset();
});

describe("Adult items card", () => {
  it("links to the shelf and names no title, cover or count", () => {
    const { container } = render(<AdultItemsCard handle="maya" theme={undefined} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/maya/adult");
    expect(link).toHaveTextContent(ADULT_FAN_COPY.cardTitle);
    expect(container.querySelector("img")).toBeNull();
    // The 18+ mark and "Over 18" are the only numbers: never a count
    expect(container.textContent!.replace(/18\+|Over 18/g, "")).not.toMatch(/\d/);
  });
});

describe("18+ shelf", () => {
  it("shows the Over 18 sheet step and both notices before a pass, and no items", async () => {
    mocks.shelf.mockResolvedValue({ open: false, reason: "not_shared" });
    render(<AdultShelf handle="maya" />);
    expect(await screen.findByText(ADULT_FAN_COPY.share)).toBeInTheDocument();
    const action = screen.getByRole("link", { name: ADULT_FAN_COPY.checkAction });
    expect(action.getAttribute("href")).toContain("/age-check?returnTo=");
    expectNotices(["warnings", "helpline"]);
    expect(screen.queryByText("Studio set")).toBeNull();
  });

  it("asks a signed out fan to sign in", async () => {
    mocks.shelf.mockRejectedValue({ data: { code: "UNAUTHORIZED" } });
    render(<AdultShelf handle="maya" />);
    expect(await screen.findByText(ADULT_FAN_COPY.signedOut)).toBeInTheDocument();
  });

  it("refuses under 18 with no action", async () => {
    mocks.shelf.mockResolvedValue({ open: false, reason: "under_18" });
    render(<AdultShelf handle="maya" />);
    expect(await screen.findByText(ADULT_FAN_COPY.under18)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ADULT_FAN_COPY.tryAgain })).toBeNull();
  });

  it("lists the items with the 18+ chip after a pass", async () => {
    mocks.shelf.mockResolvedValue({
      open: true,
      page: {
        creator: { handle: "maya", name: "Maya", image: null },
        items: [card],
        nextCursor: null,
      },
    });
    render(<AdultShelf handle="maya" />);
    const title = await screen.findByText("Studio set");
    expect(title.closest("a")).toHaveAttribute("href", "/maya/adult/abcdefghijklmnop");
    expect(screen.getAllByText(ADULT_FAN_COPY.chip).length).toBeGreaterThan(0);
    expectNotices(["warnings", "helpline"]);
  });
});

describe("18+ item page", () => {
  it("carries the helpline with the item", async () => {
    mocks.item.mockResolvedValue({
      open: true,
      item: {
        ...card,
        description: null,
        chapters: [],
        captionLangs: [],
        documentFormat: null,
        creator: { handle: "maya", name: "Maya", image: null },
      },
    });
    render(<AdultItem handle="maya" publicId="abcdefghijklmnop" />);
    expect(await screen.findAllByText("Studio set")).not.toHaveLength(0);
    expectNotices(["helpline"]);
  });
});

describe("ageCheckUrl", () => {
  it("opens the sheet on the app host and comes back here", () => {
    expect(ageCheckUrl("https://amped.bio/maya/adult")).toBe(
      "https://app.amped.bio/age-check?returnTo=https%3A%2F%2Famped.bio%2Fmaya%2Fadult"
    );
  });
});
