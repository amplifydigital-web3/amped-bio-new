/**
 * Content gating on the public site (PR C8, content gating 4.2 and 4.3):
 * locked cards, the locked item page, unlock in place and the stake copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ACCESS_BANNED_TERMS,
  ACCESS_STAKE_DISCLOSURE,
  TESTNET_NOTICE,
  findComplianceTerms,
  type AccessDecision,
  type ContentCard,
  type ContentPublicItem,
} from "@repo/constants";

const mocks = vi.hoisted(() => ({
  readUrl: vi.fn(),
  preview: vi.fn(),
  follow: vi.fn(),
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
      getReadUrl: { query: mocks.readUrl },
      getPreview: { query: mocks.preview },
      report: { mutate: vi.fn() },
    },
    follow: { follow: { mutate: mocks.follow } },
    access: { checkPage: { query: vi.fn(async () => ({})) } },
  },
}));
vi.mock("./PdfViewer", () => ({ PdfViewer: () => <div data-testid="pdf" /> }));

import { renderToString } from "react-dom/server";
import { ContentBlock } from "./ContentBlock";
import { FeedPageView } from "./FeedPageView";
import { ItemPageView } from "./ItemPageView";
import { SITE_CONTENT_COPY } from "./copy";

const decision = (over: Partial<AccessDecision>): AccessDecision => ({
  allowed: false,
  reason: "not_follower",
  hint: { action: "follow", creatorHandle: "maya" },
  rule: null,
  checkedAt: "2026-11-03T10:00:00.000Z",
  ...over,
});

const lockedCard = (id: string, gate: ContentCard["gate"]): ContentCard => ({
  publicId: id.padEnd(16, "0"),
  kind: "video",
  title: `Locked ${id}`,
  durationMs: 60_000,
  pageCount: null,
  publishedAt: "2026-10-21T10:00:00.000Z",
  cover: null,
  blur: "https://media/blur.webp?t=b",
  allowDownload: false,
  gate,
});

const follower = { kind: "follower" as const, summary: "Followers", stake: false };
const stake = {
  kind: "stake_min" as const,
  summary: "Fans with a minimum stake",
  stake: true,
  poolAddress: "0x" + "a".repeat(40),
};

const lockedItem = (gate: NonNullable<ContentCard["gate"]>): ContentPublicItem => ({
  ...lockedCard("x", gate),
  description: null,
  chapters: [],
  captionLangs: [],
  documentFormat: null,
  creator: { handle: "maya", name: "Maya Lin", image: null },
});

beforeEach(() => {
  mocks.readUrl.mockReset();
  mocks.preview.mockReset().mockResolvedValue({ blur: null, clip: null, audio: null, pages: [] });
  mocks.follow.mockReset();
});

describe("locked cards", () => {
  it("shows the blur and the rule, never plays a locked featured item", () => {
    const card = lockedCard("a", follower);
    const { container } = render(
      <ContentBlock
        block={
          {
            id: 1,
            type: "content",
            order: 0,
            config: { layout: "featured", publicIds: [card.publicId] },
          } as any
        }
        theme={undefined}
        cards={{ [card.publicId]: card }}
        handle="maya"
        creatorName="Maya Lin"
      />
    );
    expect(screen.queryByTestId("player")).toBeNull();
    expect(screen.getByText("Locked, Followers")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Locked a/ })).toHaveAttribute(
      "href",
      `/maya/c/${card.publicId}`
    );
  });
});

describe("locked item page", () => {
  it("shows the follow step and unlocks in place after following", async () => {
    mocks.readUrl
      .mockResolvedValueOnce({ decision: decision({}), playback: null, download: null })
      .mockResolvedValueOnce({
        decision: decision({ allowed: true, reason: "ok", hint: { action: "none" } }),
        playback: { kind: "video" },
        download: null,
      });
    mocks.follow.mockResolvedValue({ pending: false });
    render(<ItemPageView item={lockedItem(follower)} />);
    expect(await screen.findByText("Follow to open this")).toBeInTheDocument();
    expect(screen.queryByText(TESTNET_NOTICE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() => expect(screen.getByTestId("player")).toBeInTheDocument());
    expect(screen.queryByText("Follow to open this")).toBeNull();
  });

  it("asks a signed out visitor to sign in and come back", async () => {
    mocks.readUrl.mockResolvedValue({
      decision: decision({ reason: "not_signed_in", hint: { action: "sign_in" } }),
      playback: null,
      download: null,
    });
    render(<ItemPageView item={lockedItem(follower)} />);
    const link = await screen.findByRole("link", { name: "Sign in" });
    expect(link.getAttribute("href")).toMatch(/^\/login\?returnTo=/);
  });

  it("shows the testnet notice above the disclosure on a stake step, without an amount", async () => {
    mocks.readUrl.mockResolvedValue({
      decision: decision({ reason: "stake_below_min", hint: { action: "view_pool", poolId: 5 } }),
      playback: null,
      download: null,
    });
    const { container } = render(<ItemPageView item={lockedItem(stake)} />);
    expect(
      await screen.findByText("Your stake is under the creator's minimum")
    ).toBeInTheDocument();
    const notice = screen.getByText(TESTNET_NOTICE);
    const disclosure = screen.getByText(ACCESS_STAKE_DISCLOSURE);
    expect(
      notice.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the pool" })).toHaveAttribute(
      "href",
      `/i/pools/${stake.poolAddress}`
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*tREVO/);
    expect(findComplianceTerms(text.replace(TESTNET_NOTICE, ""), ACCESS_BANNED_TERMS)).toEqual([]);
  });
});

describe("gate copy (content gating 4.3)", () => {
  it("keeps stake steps free of member, buy and price words", () => {
    const g = SITE_CONTENT_COPY.gate;
    for (const text of [
      g.poolTitle,
      g.stakeBelowTitle,
      g.poolBody,
      g.goToPool,
      g.walletTitle,
      g.walletBody,
      g.lockedFor("Pool fans"),
    ]) {
      expect(findComplianceTerms(text, ACCESS_BANNED_TERMS), text).toEqual([]);
    }
  });
});

describe("stake notice before any tap or refusal (GQ2-2, decision D2)", () => {
  const contentBlock = (cards: ContentCard[]) => (
    <ContentBlock
      block={
        {
          id: 1,
          type: "content",
          order: 0,
          config: { layout: "grid", publicIds: cards.map(card => card.publicId) },
        } as any
      }
      theme={undefined}
      cards={Object.fromEntries(cards.map(card => [card.publicId, card]))}
      handle="maya"
      creatorName="Maya Lin"
    />
  );

  it("shows one notice for a content block with stake cards, in order", () => {
    render(
      contentBlock([lockedCard("a", stake), lockedCard("b", stake), lockedCard("c", follower)])
    );
    expect(screen.getAllByText(TESTNET_NOTICE)).toHaveLength(1);
    const notice = screen.getByText(TESTNET_NOTICE);
    const disclosure = screen.getByText(ACCESS_STAKE_DISCLOSURE);
    expect(
      notice.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows no notice when no card is behind a stake rule", () => {
    render(contentBlock([lockedCard("a", follower)]));
    expect(screen.queryByText(TESTNET_NOTICE)).toBeNull();
    expect(screen.queryByText(ACCESS_STAKE_DISCLOSURE)).toBeNull();
  });

  it("puts the notice in the locked item page's server HTML", () => {
    const html = renderToString(<ItemPageView item={lockedItem(stake)} />);
    expect(html).toContain(TESTNET_NOTICE);
    expect(html).toContain(ACCESS_STAKE_DISCLOSURE.replace(/'/g, "&#x27;"));
    expect(renderToString(<ItemPageView item={lockedItem(follower)} />)).not.toContain(
      TESTNET_NOTICE
    );
  });

  it("shows the item page notice while checking, and only once after a refusal", async () => {
    let answer: (value: unknown) => void = () => {};
    mocks.readUrl.mockReturnValue(new Promise(resolve => (answer = resolve)));
    render(<ItemPageView item={lockedItem(stake)} />);
    expect(screen.getAllByText(TESTNET_NOTICE)).toHaveLength(1);
    answer({
      decision: decision({ reason: "not_pool_member", hint: { action: "view_pool", poolId: 5 } }),
      playback: null,
      download: null,
    });
    expect(await screen.findByRole("link", { name: "Go to the pool" })).toBeInTheDocument();
    expect(screen.getAllByText(TESTNET_NOTICE)).toHaveLength(1);
  });

  it("shows one notice above the creator feed when a card is behind a stake rule", () => {
    const initial = {
      creator: { handle: "maya", name: "Maya Lin", image: null },
      items: [lockedCard("a", stake), lockedCard("b", stake)],
      nextCursor: null,
    } as any;
    render(<FeedPageView initial={initial} kind={null} />);
    expect(screen.getAllByText(TESTNET_NOTICE)).toHaveLength(1);
    expect(screen.getByText(ACCESS_STAKE_DISCLOSURE)).toBeInTheDocument();
  });
});
