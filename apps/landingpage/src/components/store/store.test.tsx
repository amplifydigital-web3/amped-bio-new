/**
 * Store pages on the public site (C9): storefront, product page and store policy. The API and
 * checkout start are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StorePolicyPublic, StoreProductPublic, StorePublic } from "@repo/constants";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/checkout", () => ({ startProductCheckout: mocks.start }));
vi.mock("@/lib/trpc", () => ({ trpcClient: {} }));

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
};

describe("ProductPageView", () => {
  it("buys through checkout with the product id, under the seller line", async () => {
    mocks.start.mockResolvedValue(undefined);
    render(<ProductPageView product={product} />);
    expect(screen.getByText("Episode 4 cut")).toBeTruthy();
    expect(screen.getByText(/Sold by Maya Lin\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buy $3 USDC" }));
    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledWith({ offerId: "0f".repeat(16), source: "store" })
    );
  });

  it("can't be bought in preview", () => {
    render(<ProductPageView product={{ ...product, preview: true }} />);
    expect(
      (screen.getByRole("button", { name: "Buy $3 USDC" }) as HTMLButtonElement).disabled
    ).toBe(true);
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
