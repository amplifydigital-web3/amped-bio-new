/**
 * Store pages on the public site (C9): storefront, product page and store policy. The API and
 * checkout start are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  MembershipPlanPublic,
  StorePolicyPublic,
  StoreProductPublic,
  StorePublic,
} from "@repo/constants";

const mocks = vi.hoisted(() => ({ start: vi.fn(), report: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/checkout", () => ({ startProductCheckout: mocks.start }));
vi.mock("@/lib/trpc", () => ({
  trpcClient: { store: { report: { mutate: mocks.report } } },
}));

import { ProductPageView, StorefrontView, StorePolicyView } from "./StoreViews";

const card = {
  id: "0f".repeat(16),
  slug: "episode-4",
  kind: "single" as const,
  title: "Episode 4",
  amountUnits: "3000000",
  accessPeriodDays: null,
  itemCount: 1,
  cover: null,
  itemKinds: ["video"],
  alsoInMembership: false,
};

const store: StorePublic = {
  handle: "maya",
  name: "Maya's Shop",
  sellerName: "Maya Lin",
  tagline: "Short films",
  avatar: null,
  layout: "grid",
  sectionOrder: ["featured", "products", "about"],
  about: "Made in Lisbon.",
  featured: [],
  products: [
    card,
    {
      ...card,
      id: "0e".repeat(16),
      slug: "pack",
      kind: "bundle",
      itemCount: 3,
      title: "Pack",
      amountUnits: "12500000",
      accessPeriodDays: 30,
    },
  ],
  buyingHere: {
    summary:
      "You buy from Maya Lin. Sales are final. If an item does not open or is not as described, message me within 7 days.",
    policyVersion: 2,
  },
  preview: false,
  membership: null,
};

beforeEach(() => mocks.start.mockReset());

describe("StorefrontView", () => {
  it("lists products with $N USDC amounts and access lines, and names the seller", () => {
    render(<StorefrontView store={store} />);
    expect(screen.getByRole("heading", { name: "Maya's Shop" })).toBeTruthy();
    expect(screen.getByText("$3 USDC")).toBeTruthy();
    expect(screen.getByText("$12.50 USDC")).toBeTruthy();
    expect(screen.getByText("In your Library")).toBeTruthy();
    expect(screen.getByText("Access for 30 days")).toBeTruthy();
    expect(screen.getByText("Bundle, 3 items")).toBeTruthy();
    expect(
      screen.getByText(/Sold by Maya Lin\. You buy from Maya Lin\. Sales are final/)
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read the store policy" }).getAttribute("href")).toBe(
      "/maya/store/policy?v=2"
    );
    expect(screen.getByRole("link", { name: "Store policy" })).toBeTruthy();
    expect(screen.queryByText(/Preview only/)).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/price|Yours to keep|monthly/i);
  });

  it("filters by kind and shows the preview line to the owner", () => {
    render(<StorefrontView store={{ ...store, preview: true }} />);
    expect(screen.getByText(/Preview only\. Store sales are not switched on yet\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bundles" }));
    expect(screen.queryByText("Episode 4")).toBeNull();
    expect(screen.getByText("Pack")).toBeTruthy();
  });
});

const product: StoreProductPublic = {
  ...card,
  handle: "maya",
  sellerName: "Maya Lin",
  description: "Behind the scenes.",
  items: [
    { publicId: "vid1", kind: "video", title: "Episode 4 cut", durationMs: 60000, pageCount: null },
  ],
  policyVersion: 2,
  preview: false,
  membership: null,
};

describe("ProductPageView", () => {
  it("buys through checkout with the product id, under the seller line", async () => {
    mocks.start.mockResolvedValue(undefined);
    render(<ProductPageView product={product} />);
    expect(screen.getByText("Episode 4 cut")).toBeTruthy();
    expect(screen.getByText(/Sold by Maya Lin\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buy $3 USDC" }));
    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({
        offerId: "0f".repeat(16),
        source: "store",
        via: null,
      })
    );
  });

  it("carries the promoter code from ?via= to Buy (C12)", async () => {
    window.history.replaceState(null, "", "/maya/store/episode-4?via=SAM10");
    try {
      render(<ProductPageView product={product} />);
      fireEvent.click(screen.getByRole("button", { name: "Buy $3 USDC" }));
      await waitFor(() =>
        expect(mocks.start).toHaveBeenCalledWith({
          offerId: "0f".repeat(16),
          source: "store",
          via: "SAM10",
        })
      );
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("puts the code on product links from the storefront", async () => {
    window.history.replaceState(null, "", "/maya/store?via=SAM10");
    try {
      render(<StorefrontView store={store} />);
      await waitFor(() =>
        expect(
          screen
            .getAllByRole("link")
            .some(a => a.getAttribute("href") === "/maya/store/episode-4?via=SAM10")
        ).toBe(true)
      );
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("can't be bought in preview", () => {
    render(<ProductPageView product={{ ...product, preview: true }} />);
    expect(
      (screen.getByRole("button", { name: "Buy $3 USDC" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

const plan: MembershipPlanPublic = {
  id: "0f".repeat(16),
  handle: "maya",
  sellerName: "Maya Lin",
  policyVersion: 2,
  name: "Inner circle",
  description: "Early cuts.",
  benefits: ["Every episode a week early", "A live session every 30 days"],
  amountEvery30Days: "5000000",
  amountYearly: "48000000",
  yearlySavingPercent: 20,
  memberCount: 12,
  viewer: null,
};

describe("Membership on the store (MB-2)", () => {
  it("shows the membership card with amounts every 30 days and Join to the app", () => {
    render(<StorefrontView store={{ ...store, membership: plan }} />);
    expect(screen.getByRole("heading", { name: "Inner circle" })).toBeTruthy();
    expect(screen.getByText("$5 USDC every 30 days")).toBeTruthy();
    expect(screen.getByText("or $48 USDC a year, save 20%")).toBeTruthy();
    expect(screen.getByText("12 members")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Join" }).getAttribute("href")).toMatch(
      /\/join\/@maya$/
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/price|monthly/i);
  });

  it("has no Join link in preview and no card without a plan", () => {
    const { unmount } = render(
      <StorefrontView store={{ ...store, membership: plan, preview: true }} />
    );
    expect(screen.queryByRole("link", { name: "Join" })).toBeNull();
    unmount();
    render(<StorefrontView store={store} />);
    expect(screen.queryByText("Inner circle")).toBeNull();
  });

  it("says a product is also in the membership", () => {
    render(<ProductPageView product={{ ...product, membership: plan }} />);
    expect(screen.getByText(/Also included in Inner circle\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Join instead" }).getAttribute("href")).toMatch(
      /\/join\/@maya$/
    );
  });
});

describe("StorePolicyView", () => {
  const policy: StorePolicyPublic = {
    handle: "maya",
    sellerName: "Maya Lin",
    notice: "Sold by Maya Lin on Amped.bio. Your purchase is from Maya Lin, not from Amped.",
    version: 1,
    mode: "standard",
    text: "## 1. Who you are buying from",
    publishedAt: "2026-11-01T12:00:00Z",
    current: false,
    supersededAt: "2026-11-03T12:00:00Z",
  };
  it("shows the fixed notice, the text and a past version banner", () => {
    render(<StorePolicyView policy={policy} />);
    expect(screen.getByText(policy.notice)).toBeTruthy();
    expect(screen.getByText(/Version 1, in force 1 Nov 2026 to 3 Nov 2026\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See the current policy." }).getAttribute("href")).toBe(
      "/maya/store/policy"
    );
  });
});

describe("Report store (store policy 3.4, SP-Q48, C10)", () => {
  it("sends a store policy report for this store from the storefront footer", async () => {
    mocks.report.mockResolvedValue({ received: true });
    render(<StorefrontView store={store} />);
    fireEvent.click(screen.getByRole("button", { name: "Report store" }));
    fireEvent.click(screen.getByRole("radio", { name: "Store policy breaks the rules" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(mocks.report).toHaveBeenCalledWith({
        handle: "maya",
        reason: "store_policy",
        details: undefined,
      })
    );
    expect(await screen.findByText("Thanks. Our team reviews every report.")).toBeTruthy();
  });
});
