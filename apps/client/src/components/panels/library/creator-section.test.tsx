/**
 * The creator section (Build Board #26, FL-4, row 181). The rules that matter:
 * a fan with no connection goes to the public page; the section shows only
 * this creator's items in the creator's look, with the ownership line; the
 * status sheet opens with "{Creator} and you", toggles read On or Off, and
 * change Follow settings through follow.update; Unfollow offers Undo. Shop
 * (FL-6) shows locked cards with one next step, and the testnet line and the
 * stake disclosure under a stake card; alerts for new items save per creator.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/utils";
import { ACCESS_STAKE_DISCLOSURE, TESTNET_NOTICE } from "@repo/constants";
import { LIBRARY_COPY } from "./copy";

const mocks = vi.hoisted(() => ({
  creator: vi.fn(),
  creatorItems: vi.fn(),
  continue: vi.fn(),
  update: vi.fn(),
  unfollow: vi.fn(),
  undo: vi.fn(),
  toast: vi.fn(),
  assign: vi.fn(),
  ga: vi.fn(),
  newContent: vi.fn(),
  setNewContent: vi.fn(),
}));

vi.mock("@repo/ui", async () => {
  const UI = "../../../../../../packages/ui/src";
  const base = await import("../content/testUi").then(m => m.prismUi());
  const sheet = await import(`${UI}/prism/bottom-sheet`);
  const scope = await import(`${UI}/creator/section-scope`);
  const store = new Map<string, unknown>();
  return {
    ...base,
    ...sheet,
    ...scope,
    queryClient: {
      invalidateQueries: vi.fn(),
      getQueryData: (key: unknown) => store.get(JSON.stringify(key)),
      setQueryData: (key: unknown, value: unknown) => store.set(JSON.stringify(key), value),
    },
    useOptionalPlayer: () => null,
    trpcClient: { content: { getReadUrl: { query: vi.fn() } } },
    requirePlayerSource: vi.fn(),
    trpc: {
      library: {
        pathKey: () => ["library"],
        creator: {
          queryKey: (input: unknown) => ["library.creator", input],
          queryOptions: (input: unknown) => ({
            queryKey: ["library.creator", input],
            queryFn: mocks.creator,
          }),
        },
        continue: {
          queryOptions: (input: unknown) => ({
            queryKey: ["library.continue", input],
            queryFn: mocks.continue,
          }),
        },
        creatorItems: {
          infiniteQueryOptions: (input: object, opts: object) => ({
            queryKey: ["library.creatorItems", input],
            queryFn: () => mocks.creatorItems(input),
            initialPageParam: undefined,
            ...opts,
          }),
        },
        save: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
        unsave: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
        markWatched: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
        removeFromContinue: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
      },
      notifications: {
        newContent: {
          queryKey: (input: unknown) => ["notifications.newContent", input],
          queryOptions: (input: unknown) => ({
            queryKey: ["notifications.newContent", input],
            queryFn: mocks.newContent,
          }),
        },
        setNewContent: { mutationOptions: () => ({ mutationFn: mocks.setNewContent }) },
      },
      follow: {
        update: { mutationOptions: () => ({ mutationFn: mocks.update }) },
        unfollow: { mutationOptions: () => ({ mutationFn: mocks.unfollow }) },
        undoUnfollow: { mutationOptions: () => ({ mutationFn: mocks.undo }) },
      },
    },
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("@/utils/ga", () => ({ trackGAEvent: mocks.ga }));

import { CreatorSection } from "./CreatorSection";

const maya = { handle: "maya", name: "Maya Lin", image: null, accent: "#e4572e" };

function header(over: Record<string, unknown> = {}) {
  return {
    connected: true,
    owner: maya,
    theme: {
      button: "#2d4b8e",
      buttonText: "#ffffff",
      text: "#1b1b1f",
      container: "#ffffff",
      containerOpacity: 1,
      nameFont: "Playfair Display",
      bodyFont: "Inter",
      background: { type: "color", value: "#f6efe6" },
    },
    connection: { following: true, member: false, purchases: 0, poolFan: false },
    status: {
      membership: null,
      purchases: { count: 0 },
      follow: { showPublicly: false, emailUpdates: true },
    },
    counts: { yours: 1, shop: 0 },
    ...over,
  };
}

const item = {
  publicId: "abcdefgh12345678",
  kind: "audio",
  title: "Demo, take 3",
  durationMs: 200_000,
  pageCount: null,
  publishedAt: null,
  cover: null,
  blur: null,
  allowDownload: false,
  owner: maya,
  accessSource: "public",
  planName: null,
  progress: null,
  savedAt: null,
};

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <MemoryRouter initialEntries={["/library/@maya"]}>
      <CreatorSection handle="maya" />
    </MemoryRouter>,
    { queryClient }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.creator.mockResolvedValue(header());
  mocks.continue.mockResolvedValue({ items: [] });
  mocks.creatorItems.mockResolvedValue({ items: [item], nextCursor: null });
  mocks.update.mockResolvedValue({});
  mocks.newContent.mockResolvedValue({ enabled: true });
  mocks.setNewContent.mockResolvedValue({ enabled: false });
  mocks.unfollow.mockResolvedValue({ following: false, restoreToken: "token-1234567890" });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: mocks.assign },
  });
});

describe("creator section (row 181, board m4)", () => {
  it("shows the creator, the status line, Yours and the ownership line in their look", async () => {
    const { container } = renderSection();
    expect(await screen.findByRole("heading", { name: "Maya Lin" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Your status with this creator: Following/ })
    ).toBeTruthy();
    expect(await screen.findByText("Demo, take 3")).toBeTruthy();
    expect(mocks.creatorItems).toHaveBeenCalledWith({ handle: "maya", seg: "yours" });
    expect(screen.getByText("Maya Lin owns this content.")).toBeTruthy();
    const scope = container.querySelector("[data-creator-section-scope]") as HTMLElement;
    expect(scope.style.getPropertyValue("--c-btn")).toBe("#2d4b8e");
    expect(mocks.ga).not.toHaveBeenCalled();
  });

  it("sends a fan with no connection to the public page", async () => {
    mocks.creator.mockResolvedValue(header({ connected: false }));
    renderSection();
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith(expect.stringMatching(/\/@maya$/))
    );
  });

  it("logs a theme fallback, ids only", async () => {
    mocks.creator.mockResolvedValue(
      header({
        theme: {
          ...header().theme,
          text: "#cccccc",
          background: { type: "color", value: "#dddddd" },
        },
      })
    );
    renderSection();
    await waitFor(() =>
      expect(mocks.ga).toHaveBeenCalledWith(
        "library_theme_fallback",
        "library",
        expect.stringContaining("page")
      )
    );
  });

  it("shows an empty Shop when nothing is locked", async () => {
    mocks.creatorItems.mockImplementation(async (input: { seg: string }) =>
      input.seg === "shop" ? { items: [], nextCursor: null } : { items: [item], nextCursor: null }
    );
    renderSection();
    fireEvent.click(await screen.findByRole("tab", { name: /Shop/ }));
    expect(await screen.findByText(LIBRARY_COPY.section.shopEmptyTitle)).toBeTruthy();
  });

  it("shows a locked stake card with Go to the pool, the testnet line and the disclosure", async () => {
    const locked = {
      ...item,
      publicId: "lockedabcd123456",
      title: "Members cut",
      accessSource: undefined,
      blur: "https://cdn/blur.jpg",
      gate: { kind: "pool_member", summary: "Pool fans", stake: true, poolAddress: "0xpool" },
      unlockHint: { kind: "pool" },
    };
    mocks.creatorItems.mockImplementation(async (input: { seg: string }) =>
      input.seg === "shop"
        ? { items: [locked], nextCursor: null }
        : { items: [item], nextCursor: null }
    );
    renderSection();
    fireEvent.click(await screen.findByRole("tab", { name: /Shop/ }));
    const card = await screen.findByRole("article", { name: "Members cut, locked" });
    expect(within(card).getByText(/For Pool fans/)).toBeTruthy();
    const pool = within(card).getByRole("link", { name: /Go to the pool/ });
    expect(pool.getAttribute("href")).toMatch(/\/i\/pools\/0xpool$/);
    expect(within(card).getByText(TESTNET_NOTICE)).toBeTruthy();
    expect(within(card).getByText(ACCESS_STAKE_DISCLOSURE)).toBeTruthy();
    expect(card.querySelector("img")).toBeNull();
  });

  it("says Join is coming soon until FL-7, and asks to confirm the email for a pending follow", async () => {
    const join = {
      ...item,
      publicId: "joinabcdefgh1234",
      title: "Plan only",
      gate: { kind: "member", summary: "Members", stake: false },
      unlockHint: { kind: "join", planName: null },
    };
    const pending = {
      ...item,
      publicId: "pendabcdefgh1234",
      title: "Followers only",
      gate: { kind: "follower", summary: "Followers", stake: false },
      unlockHint: { kind: "confirm_email" },
    };
    mocks.creatorItems.mockImplementation(async (input: { seg: string }) =>
      input.seg === "shop"
        ? { items: [join, pending], nextCursor: null }
        : { items: [item], nextCursor: null }
    );
    renderSection();
    fireEvent.click(await screen.findByRole("tab", { name: /Shop/ }));
    const joinCard = await screen.findByRole("article", { name: "Plan only, locked" });
    expect(
      (within(joinCard).getByRole("button", { name: /Join/ }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(within(joinCard).getByText(LIBRARY_COPY.section.shopLaterHelp)).toBeTruthy();
    const pendingCard = screen.getByRole("article", { name: "Followers only, locked" });
    expect(within(pendingCard).getByText(LIBRARY_COPY.section.shopConfirmEmail)).toBeTruthy();
    expect(screen.queryByText(TESTNET_NOTICE)).toBeNull();
  });
});

describe("status sheet (board fl-q2)", () => {
  it("opens with the creator and you, reads On and Off, and saves a toggle", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /Your status with this creator/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Maya Lin and you")).toBeTruthy();
    expect(within(sheet).getByText("Maya Lin owns this content.")).toBeTruthy();
    expect(within(sheet).getByText("Off")).toBeTruthy();
    await waitFor(() => expect(within(sheet).getAllByText("On")).toHaveLength(2));
    fireEvent.click(
      within(sheet).getByRole("switch", { name: "Show me on Maya Lin's public list" })
    );
    await waitFor(() =>
      expect(mocks.update.mock.calls[0]?.[0]).toEqual({ handle: "maya", showPublicly: true })
    );
  });

  it("turns alerts for new items off for this creator", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /Your status with this creator/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(await within(sheet).findByRole("switch", { name: "Alerts for new items" }));
    await waitFor(() =>
      expect(mocks.setNewContent.mock.calls[0]?.[0]).toEqual({ handle: "maya", enabled: false })
    );
  });

  it("unfollows with an Undo", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: /Your status with this creator/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Unfollow" }));
    await waitFor(() => expect(mocks.unfollow).toHaveBeenCalled());
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "You unfollowed Maya Lin.",
          actionProps: expect.objectContaining({ children: "Undo" }),
        })
      )
    );
  });
});
