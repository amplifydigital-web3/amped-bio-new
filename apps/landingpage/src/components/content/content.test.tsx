/**
 * Content on the public site (Build Board #20, PR 6): the bio block, the item
 * page, reports, SEO data and the copy rules. The player and the API are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CONTENT_REPORT_LABELS,
  findBannedTerms,
  type ContentCard,
  type ContentPublicItem,
} from "@repo/constants";

const mocks = vi.hoisted(() => ({
  report: vi.fn(),
  readUrl: vi.fn(),
  feed: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@repo/ui", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@repo/ui");
  return {
    ...actual,
    MediaPlayer: ({ item }: { item: { title: string; kind: string } }) => (
      <div data-testid="player">
        {item.kind} player for {item.title}
      </div>
    ),
    ChapterList: () => null,
  };
});
vi.mock("@/lib/trpc", () => ({
  trpcClient: {
    content: {
      report: { mutate: mocks.report },
      getReadUrl: { query: mocks.readUrl },
      feed: { query: mocks.feed },
    },
  },
}));
vi.mock("./PdfViewer", () => ({ PdfViewer: () => <div data-testid="pdf" /> }));

import { ContentBlock } from "./ContentBlock";
import { ItemPageView } from "./ItemPageView";
import { matchingPages } from "@/lib/pdfSearch";
import { FeatureFlagsProvider } from "@/components/providers/FeatureFlagsProvider";
import { PLAYER_COPY, PlayerProvider } from "@repo/ui";
import { SITE_CONTENT_COPY } from "./copy";
import { fetchUpNext, isoDuration, publishedLabel } from "@/lib/content";
import { buildContentFeedJsonLd, buildContentItemJsonLd } from "@/lib/contentSeo";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const card = (id: string, extra: Partial<ContentCard> = {}): ContentCard => ({
  publicId: id.padEnd(16, "0"),
  kind: "video",
  title: `Item ${id}`,
  durationMs: 760_000,
  pageCount: null,
  publishedAt: "2026-10-21T10:00:00.000Z",
  cover: { src: "https://media/cover.webp?t=x", srcSet: "", width: 1280, height: 720 },
  blur: null,
  allowDownload: false,
  ...extra,
});

const block = (publicIds: string[], layout: "featured" | "grid" | "list" = "featured") =>
  ({ id: 1, type: "content", order: 0, config: { label: "Latest", layout, publicIds } }) as any;

beforeEach(() => {
  mocks.report.mockReset();
  mocks.readUrl.mockReset();
});

describe("content copy", () => {
  it("has no dashes and no banned words", () => {
    const strings: string[] = [...Object.values(CONTENT_REPORT_LABELS)];
    const collect = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (typeof value === "function")
        strings.push(String((value as (...a: unknown[]) => unknown)(3, 12)));
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(SITE_CONTENT_COPY);
    for (const text of strings) {
      expect(DASHES.test(text), text).toBe(false);
      expect(findBannedTerms(text), text).toEqual([]);
    }
  });
});

describe("helpers", () => {
  it("labels publish dates and formats durations", () => {
    const now = new Date("2026-10-23T12:00:00");
    expect(publishedLabel("2026-10-23T08:00:00", now)).toBe("Today");
    expect(publishedLabel("2026-10-22T08:00:00", now)).toBe("Yesterday");
    expect(publishedLabel("2026-10-20T08:00:00", now)).toBe("3 days ago");
    expect(publishedLabel("2026-10-06T08:00:00", now)).toBe("Oct 6");
    expect(publishedLabel("2025-10-06T08:00:00", now)).toBe("Oct 6, 2025");
    expect(isoDuration(760_000)).toBe("PT12M40S");
    expect(isoDuration(3_600_000)).toBe("PT1H");
    expect(isoDuration(null)).toBeUndefined();
  });

  it("puts no media link into structured data", () => {
    const item: ContentPublicItem = {
      ...card("a"),
      description: "A night session",
      chapters: [],
      captionLangs: [],
      documentFormat: null,
      creator: { handle: "maya", name: "Maya Lin", image: null },
    };
    const ld = buildContentItemJsonLd(item);
    expect(ld).toMatchObject({ "@type": "VideoObject", name: "Item a", duration: "PT12M40S" });
    expect(JSON.stringify(ld)).not.toMatch(/contentUrl|embedUrl|m3u8|cloudflarestream/);
    const feed = buildContentFeedJsonLd({
      creator: item.creator,
      items: [card("a"), card("b")],
      nextCursor: null,
    });
    expect(feed.mainEntity.itemListElement).toHaveLength(2);
  });
  it("never marks a locked card openable in up next", async () => {
    mocks.feed.mockResolvedValueOnce({
      items: [
        card("cur"),
        card("open"),
        card("locked", { gate: { kind: "pool_member", summary: "Pool fans", stake: true } }),
        card("pdf", { kind: "document" }),
      ],
      nextCursor: null,
    });
    const entries = await fetchUpNext({ handle: "maya", name: "Maya" }, card("cur").publicId);
    expect(entries.map(entry => [entry.item.title, entry.canOpen])).toEqual([
      ["Item open", true],
      ["Item locked", false],
    ]);
  });
});

describe("ContentBlock", () => {
  it("plays the featured video on the page and shows the rest as cards, in order", () => {
    const cards = {
      [card("a").publicId]: card("a"),
      [card("b").publicId]: card("b", { kind: "image" }),
    };
    render(
      <ContentBlock
        block={block([card("a").publicId, "missing0000000000", card("b").publicId])}
        theme={undefined}
        cards={cards}
        handle="maya"
        creatorName="Maya Lin"
      />
    );
    expect(screen.getByTestId("player")).toHaveTextContent("video player for Item a");
    expect(screen.getByText(SITE_CONTENT_COPY.items(2))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Item b/ })).toHaveAttribute(
      "href",
      `/maya/c/${card("b").publicId}`
    );
    expect(screen.getByRole("link", { name: SITE_CONTENT_COPY.seeAll })).toHaveAttribute(
      "href",
      "/maya/content"
    );
  });

  it("hides itself when none of its items may show", () => {
    const { container } = render(
      <ContentBlock
        block={block(["draft000000000000"])}
        theme={undefined}
        cards={{}}
        handle="maya"
        creatorName={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("sends a report for the chosen item and reason", async () => {
    mocks.report.mockResolvedValue({ received: true });
    const a = card("a");
    render(
      <ContentBlock
        block={block([a.publicId], "grid")}
        theme={undefined}
        cards={{ [a.publicId]: a }}
        handle="maya"
        creatorName={null}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: SITE_CONTENT_COPY.reportContent }));
    const send = await screen.findByRole("button", { name: SITE_CONTENT_COPY.reportSend });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByLabelText(CONTENT_REPORT_LABELS.copyright));
    fireEvent.click(send);
    await waitFor(() =>
      expect(mocks.report).toHaveBeenCalledWith({
        publicId: a.publicId,
        reason: "copyright",
        details: undefined,
      })
    );
    expect(await screen.findByText(SITE_CONTENT_COPY.reportThanks)).toBeInTheDocument();
  });
});

describe("ItemPageView", () => {
  const item = (extra: Partial<ContentPublicItem> = {}): ContentPublicItem => ({
    ...card("a"),
    description: "Surf, wind and a slow drone.",
    chapters: [],
    captionLangs: [],
    documentFormat: null,
    creator: { handle: "maya", name: "Maya Lin", image: null },
    ...extra,
  });

  it("plays video and audio in the shared player", () => {
    render(<ItemPageView item={item({ kind: "audio" })} />);
    expect(screen.getByTestId("player")).toHaveTextContent("audio player for Item a");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Item a");
    expect(screen.getByRole("link", { name: SITE_CONTENT_COPY.backTo("maya") })).toHaveAttribute(
      "href",
      "/maya"
    );
  });

  it("opens PDFs in the viewer and offers no download unless allowed", () => {
    render(
      <ItemPageView item={item({ kind: "document", documentFormat: "pdf", pageCount: 18 })} />
    );
    expect(screen.getByTestId("pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SITE_CONTENT_COPY.download })).toBeNull();
  });

  it("downloads through a fresh single use link", async () => {
    mocks.readUrl.mockResolvedValue({
      playback: null,
      download: {
        url: "https://media/originals/x/original.zip?t=1",
        fileName: "Field kit.zip",
        expiresAt: 0,
      },
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ItemPageView item={item({ kind: "file", allowDownload: true })} />);
    expect(screen.getByText(SITE_CONTENT_COPY.downloadNote)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: SITE_CONTENT_COPY.download }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(mocks.readUrl).toHaveBeenCalledWith({ publicId: item().publicId, download: true });
  });

  it("says when a file has no download", () => {
    render(<ItemPageView item={item({ kind: "file" })} />);
    expect(screen.getByText(SITE_CONTENT_COPY.downloadsOff)).toBeInTheDocument();
  });

  it("keeps the PR 6 page when the Fan Library flag is off", () => {
    render(
      <PlayerProvider>
        <ItemPageView item={item({ kind: "audio" })} />
      </PlayerProvider>
    );
    expect(mocks.feed).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: PLAYER_COPY.moreFor("Item a") })).toBeNull();
  });

  it("adds More, Report, the queue and up next from the creator with the flag on (FL-1)", async () => {
    mocks.feed.mockResolvedValue({
      creator: { handle: "maya", name: "Maya Lin", image: null },
      items: [card("a"), card("b", { title: "Harbor at 5 a.m." }), card("c", { kind: "image" })],
      nextCursor: null,
    });
    render(
      <FeatureFlagsProvider overrides={{ fanLibrary: true }}>
        <PlayerProvider>
          <ItemPageView item={item({ kind: "video" })} />
        </PlayerProvider>
      </FeatureFlagsProvider>
    );
    expect(mocks.feed).toHaveBeenCalledWith({ handle: "maya", limit: 24 });
    // Up next lists the creator's other video and audio, never the item itself or images
    expect(
      await screen.findByRole("button", { name: PLAYER_COPY.playItem("Harbor at 5 a.m.") })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: PLAYER_COPY.playItem("Item c") })).toBeNull();
    expect(screen.getByRole("button", { name: PLAYER_COPY.moreFor("Item a") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PLAYER_COPY.keyboardShortcuts })).toBeInTheDocument();
    // The phone Report sits in More; the page row has the desktop one first
    const [report] = screen.getAllByRole("button", { name: PLAYER_COPY.report });
    fireEvent.click(report!);
    expect(await screen.findByText(SITE_CONTENT_COPY.reportIntro)).toBeInTheDocument();
  });

  it("shows an image in the photo viewer with zoom", () => {
    render(
      <ItemPageView
        item={item({ kind: "image", cover: { src: "https://m/i.webp", srcSet: "" } as never })}
      />
    );
    expect(screen.getByRole("img", { name: "Item a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PLAYER_COPY.zoomIn })).toBeInTheDocument();
  });
});

describe("document search", () => {
  it("finds the pages that hold every word, in page order", () => {
    const texts = ["Setting up mics", "Recording rain on tin", "rain gauge", "Tin roof and RAIN"];
    expect(matchingPages(texts, "rain tin")).toEqual([2, 4]);
    expect(matchingPages(texts, "  ")).toEqual([]);
    expect(matchingPages(texts, "snow")).toEqual([]);
  });
});
