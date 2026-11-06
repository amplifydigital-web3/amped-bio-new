/**
 * Fan Library page (Build Board #26, FL-3). The rules that matter: the Library
 * is reachable only with fanLibrary on, sits after Explore in Start and in More
 * on phones; its sub paths survive the Editor; every item names its owner and
 * shows at most one label; the testnet line follows a pool row; the copy has no
 * dashes and no money words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { LIBRARY_LIMITS, TESTNET_NOTICE } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";
import { setFeatureFlagOverridesForTests } from "../../../config/featureFlags";
import {
  destinationForPanel,
  dockComposition,
  enabledDestinations,
} from "../../shell/destinations";
import { LIBRARY_COPY } from "./copy";
import { isLibraryPath, parseLibraryPath } from "./paths";
import { accessLabel, minutesLeft, playerItemFor } from "./parts";
import { readFilter, writeFilter, filterLabel } from "./FilterSheet";

const mocks = vi.hoisted(() => ({
  continue: vi.fn(),
  saved: vi.fn(),
  creators: vi.fn(),
  newest: vi.fn(),
  search: vi.fn(),
  memberships: vi.fn(async () => ({ items: [] })),
  toast: vi.fn(),
}));

function queryOptions(name: string, fn: () => unknown) {
  return (input: unknown) => ({ queryKey: [name, input], queryFn: fn });
}
function infiniteOptions(name: string, fn: (input: object) => unknown) {
  return (input: object, opts: object) => ({
    queryKey: [name, input],
    queryFn: ({ pageParam }: { pageParam?: string }) => fn({ ...input, cursor: pageParam }),
    initialPageParam: undefined,
    ...opts,
  });
}

vi.mock("@repo/ui", async () => {
  const UI = "../../../../../../packages/ui/src";
  const base = await import("../content/testUi").then(m => m.prismUi());
  const sheet = await import(`${UI}/prism/bottom-sheet`);
  const mutation = () => ({ mutationFn: vi.fn(async () => ({ ok: true })) });
  return {
    ...base,
    ...sheet,
    queryClient: { invalidateQueries: vi.fn() },
    useOptionalPlayer: () => null,
    useAuth: () => ({ authUser: { id: 7 } }),
    trpcClient: { content: { getReadUrl: { query: vi.fn() } } },
    requirePlayerSource: vi.fn(),
    trpc: {
      library: {
        pathKey: () => ["library"],
        continue: { queryOptions: queryOptions("library.continue", mocks.continue) },
        saved: {
          queryOptions: queryOptions("library.saved", mocks.saved),
          infiniteQueryOptions: infiniteOptions("library.saved.inf", mocks.saved),
        },
        creators: {
          queryOptions: queryOptions("library.creators", mocks.creators),
          infiniteQueryOptions: infiniteOptions("library.creators.inf", mocks.creators),
        },
        newest: { infiniteQueryOptions: infiniteOptions("library.newest", mocks.newest) },
        search: { infiniteQueryOptions: infiniteOptions("library.search.inf", mocks.search) },
        memberships: {
          queryOptions: () => ({ queryKey: ["library.memberships"], queryFn: mocks.memberships }),
        },
        save: { mutationOptions: mutation },
        unsave: { mutationOptions: mutation },
        markWatched: { mutationOptions: mutation },
        removeFromContinue: { mutationOptions: mutation },
      },
    },
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toast } }));

import { LibraryHome } from "./LibraryHome";
import { LibrarySearch } from "./LibrarySearch";
import { YourCreatorsPage } from "./YourCreators";

const maya = { handle: "maya", name: "Maya Lin", image: null, accent: "#e4572e" };
const theo = { handle: "theo", name: "Theo", image: null, accent: null };

function libItem(over: Record<string, unknown> = {}) {
  return {
    publicId: "abcdefgh12345678",
    kind: "video" as const,
    title: "Studio session, part 2",
    durationMs: 760_000,
    pageCount: null,
    publishedAt: new Date().toISOString(),
    cover: null,
    blur: null,
    allowDownload: false,
    owner: maya,
    accessSource: "public" as const,
    planName: null,
    progress: null,
    savedAt: null,
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    owner: maya,
    connection: { following: true, member: false, purchases: 0, poolFan: false },
    newCount: 0,
    pastDue: false,
    ...over,
  };
}

function renderAt(ui: React.ReactElement, path = "/library") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>, {
    queryClient,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.continue.mockResolvedValue({ items: [] });
  mocks.saved.mockResolvedValue({ items: [], nextCursor: null });
  mocks.creators.mockResolvedValue({ items: [], nextCursor: null });
  mocks.newest.mockResolvedValue({ items: [], nextCursor: null });
  mocks.search.mockResolvedValue({ groups: [], nextCursor: null });
});

describe("Library destination (spec 3.5, CT-D1, CK-D4)", () => {
  afterEach(() => setFeatureFlagOverridesForTests({}));

  it("is not in the rail while fanLibrary is off", () => {
    setFeatureFlagOverridesForTests({ fanLibrary: false });
    expect(enabledDestinations().map(d => d.id)).not.toContain("library");
    expect(destinationForPanel("library")).toBeNull();
  });

  it("reads Home, Explore, Library, Inbox in Start, and sits in More on phones", () => {
    setFeatureFlagOverridesForTests({
      fanLibrary: true,
      messages: true,
      wallet: true,
      creatorPool: true,
    });
    const enabled = enabledDestinations();
    expect(enabled.filter(d => d.group === "start").map(d => d.id)).toEqual([
      "home",
      "explore",
      "library",
      "inbox",
    ]);
    const { dock, more } = dockComposition(enabled);
    expect(dock.map(d => d.id)).toEqual(["home", "page", "inbox", "wallet"]);
    expect(more.map(d => d.id)).toContain("library");
    expect(destinationForPanel("library")).toBe("library");
  });
});

describe("Library paths", () => {
  it("keeps the sub paths the panel serves", () => {
    expect(parseLibraryPath("/library")).toEqual({ view: "home" });
    expect(parseLibraryPath("/library/search")).toEqual({ view: "search" });
    expect(parseLibraryPath("/library/creators/")).toEqual({ view: "creators" });
    expect(parseLibraryPath("/library/saved")).toEqual({ view: "saved" });
    expect(parseLibraryPath("/library/@Maya")).toEqual({ view: "creator", handle: "maya" });
    expect(parseLibraryPath("/library/@maya/c/abcdefgh12345678")).toEqual({
      view: "item",
      handle: "maya",
      publicId: "abcdefgh12345678",
    });
  });

  it("refuses anything else, so the Editor falls back to /library", () => {
    expect(isLibraryPath("/library/downloads/NOT-AN-ID")).toBe(false);
    expect(isLibraryPath("/library/@maya/c/NOT-AN-ID")).toBe(false);
    expect(isLibraryPath("/library/maya")).toBe(false);
    expect(isLibraryPath("/libraryx")).toBe(false);
    expect(isLibraryPath("/library/@bad handle")).toBe(false);
  });

  it("serves Downloads and a downloaded item (FL-5)", () => {
    expect(parseLibraryPath("/library/downloads")).toEqual({ view: "downloads" });
    expect(parseLibraryPath("/library/downloads/abcd1234efgh5678")).toEqual({
      view: "download",
      publicId: "abcd1234efgh5678",
    });
  });

  it("does not throw on a broken escape in a hand written link", () => {
    // `/library/@%` decodes to a URIError, which would blank the whole panel
    expect(() => parseLibraryPath("/library/@%")).not.toThrow();
    expect(parseLibraryPath("/library/@%")).toBeNull();
    expect(isLibraryPath("/library/@%E0%A4%A")).toBe(false);
  });
});

describe("labels and the player item", () => {
  it("shows one label, and none for Followers and Public (spec 2.1)", () => {
    expect(accessLabel({ accessSource: "public", planName: null })).toBeNull();
    expect(accessLabel({ accessSource: "follower", planName: null })).toBeNull();
    expect(accessLabel({ accessSource: "purchased", planName: null })).toBe("Purchased");
    expect(accessLabel({ accessSource: "pool", planName: null })).toBe("Pool fans");
    expect(accessLabel({ accessSource: "member", planName: "Inner circle" })).toBe("Inner circle");
  });

  it("names the owner so autoplay stays with the creator (decision D)", () => {
    const player = playerItemFor(libItem());
    expect(player).toMatchObject({
      ownerId: "maya",
      subtitle: "Maya Lin",
      href: "/library/@maya/c/abcdefgh12345678",
    });
    expect(playerItemFor(libItem({ kind: "document" }))).toBeNull();
  });

  it("counts minutes left from the saved position", () => {
    expect(
      minutesLeft({
        durationMs: 760_000,
        progress: { positionMs: 400_000, durationMs: null, completed: false },
      })
    ).toBe(6);
    expect(minutesLeft({ durationMs: 760_000, progress: null })).toBeNull();
  });
});

describe("the filter", () => {
  it("lives in the URL and ignores values it does not know", () => {
    const params = writeFilter(new URLSearchParams("q=1"), {
      type: "audio",
      source: "member",
      where: null,
    });
    expect(params.toString()).toBe("q=1&type=audio&source=member");
    expect(readFilter(params)).toEqual({ type: "audio", source: "member", where: null });
    expect(readFilter(new URLSearchParams("type=movie&source=staked&where=moon"))).toEqual({
      type: null,
      source: null,
      where: null,
    });
    expect(filterLabel({ type: "audio", source: "public", where: null })).toBe("Audio, Free");
    // FL-5: On this device
    expect(readFilter(new URLSearchParams("where=device")).where).toBe("device");
    expect(filterLabel({ type: null, source: null, where: "device" })).toBe("On this device");
  });
});

describe("Library page (row 124, board m1)", () => {
  it("shows Continue, Your creators and Newest, each item with its owner", async () => {
    mocks.continue.mockResolvedValue({
      items: [
        libItem({
          title: "Mixing vocals",
          progress: { positionMs: 400_000, durationMs: 760_000, completed: false },
        }),
      ],
    });
    mocks.creators.mockResolvedValue({ items: [row({ newCount: 3 })], nextCursor: null });
    mocks.newest.mockResolvedValue({
      items: [libItem({ publicId: "bbbbbbbb12345678", title: "New beat", owner: theo })],
      nextCursor: null,
    });
    renderAt(<LibraryHome />);
    expect(await screen.findByRole("heading", { name: "Continue" })).toBeTruthy();
    expect(screen.getByText("6 min left")).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Your creators" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 new").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Open New beat, by Theo" })).toBeTruthy();
  });

  it("sends a fan with nothing yet to Explore", async () => {
    renderAt(<LibraryHome />);
    expect(await screen.findByText(LIBRARY_COPY.empty.libraryTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: LIBRARY_COPY.empty.explore })).toBeTruthy();
  });

  it("filters Newest from the URL and clears with one chip", async () => {
    renderAt(<LibraryHome />, "/library?type=audio");
    await waitFor(() =>
      expect(mocks.newest).toHaveBeenCalledWith(expect.objectContaining({ type: "audio" }))
    );
    expect(mocks.continue).not.toHaveBeenCalled();
    expect(await screen.findByText(LIBRARY_COPY.empty.filteredTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove filter Audio" }));
    await waitFor(() =>
      expect(mocks.newest).toHaveBeenCalledWith(expect.objectContaining({ type: undefined }))
    );
  });

  it("names what failed when Newest does not load", async () => {
    mocks.newest.mockRejectedValue(new Error("down"));
    renderAt(<LibraryHome />);
    expect(await screen.findByText(LIBRARY_COPY.error.title)).toBeTruthy();
  });
});

describe("Your creators (row 180, board m3)", () => {
  it("puts the testnet line under a pool row only", async () => {
    mocks.creators.mockResolvedValue({
      items: [
        row({ pastDue: true }),
        row({
          owner: theo,
          connection: { following: true, member: false, purchases: 0, poolFan: true },
        }),
      ],
      nextCursor: null,
    });
    renderAt(<YourCreatorsPage />, "/library/creators");
    expect(await screen.findByText(TESTNET_NOTICE)).toBeTruthy();
    expect(screen.getByText("Payment past due")).toBeTruthy();
    expect(screen.getByText("Pool fan, Following")).toBeTruthy();
  });

  it("has no testnet line without a pool row", async () => {
    mocks.creators.mockResolvedValue({ items: [row()], nextCursor: null });
    renderAt(<YourCreatorsPage />, "/library/creators");
    expect(await screen.findByText("Following")).toBeTruthy();
    expect(screen.queryByText(TESTNET_NOTICE)).toBeNull();
  });

  it("keeps the creator search inside the length the server accepts", async () => {
    renderAt(<YourCreatorsPage />, "/library/creators");
    const input = screen.getByLabelText(LIBRARY_COPY.creatorsPage.searchLabel);
    fireEvent.change(input, { target: { value: "m".repeat(120) } });
    await waitFor(() =>
      expect(mocks.creators).toHaveBeenCalledWith(
        expect.objectContaining({ q: "m".repeat(LIBRARY_LIMITS.searchMaxLength) })
      )
    );
  });
});

describe("Library search (row 183, boards m2, fl-q7)", () => {
  it("trims a hand written search link to the length the server accepts", async () => {
    renderAt(<LibrarySearch />, `/library/search?q=${"m".repeat(120)}`);
    await waitFor(() =>
      expect(mocks.search).toHaveBeenCalledWith(
        expect.objectContaining({ q: "m".repeat(LIBRARY_LIMITS.searchMaxLength) })
      )
    );
  });
});

describe("Library copy (spec 3.8)", () => {
  const strings: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") strings.push(value);
    else if (typeof value === "function") {
      const out = (value as (...a: unknown[]) => unknown)(2, "x");
      if (typeof out === "string") strings.push(out);
    } else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(LIBRARY_COPY);

  it("has no em or en dashes", () => {
    expect(strings.filter(s => /[–—]/.test(s))).toEqual([]);
  });

  it("has no money or investment words", () => {
    const banned = /\b(earn|earnings|yield|return|returns|income|invest|investment|apy|profit)\b/i;
    expect(strings.filter(s => banned.test(s))).toEqual([]);
  });
});
