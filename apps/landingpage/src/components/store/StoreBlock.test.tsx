/**
 * Store block on the creator's page (board st10): up to 6 products, the count, Visit store,
 * and nothing at all while the server sends no store.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StoreBioBlock, StoreBlock as StoreBlockType } from "@repo/constants";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { StoreBlock } from "./StoreBlock";

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

const store: StoreBioBlock = {
  handle: "maya",
  name: "Maya's Shop",
  productCount: 8,
  products: [
    card,
    { ...card, id: "0e".repeat(16), slug: "pack", title: "Pack", amountUnits: "12500000" },
  ],
};

const block = (label = ""): StoreBlockType => ({
  id: 1,
  type: "store",
  order: 0,
  config: { label },
});

describe("StoreBlock", () => {
  it("lists the products as links with $N USDC, the count and Visit store", () => {
    render(<StoreBlock block={block()} theme={undefined} store={store} />);
    expect(screen.getByRole("heading", { name: "Maya's Shop" })).toBeTruthy();
    expect(screen.getAllByText("8 products").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Episode 4/ }).getAttribute("href")).toBe(
      "/maya/store/episode-4"
    );
    expect(screen.getByText("$3 USDC")).toBeTruthy();
    expect(screen.getByText("$12.50 USDC")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Visit store" }).getAttribute("href")).toBe(
      "/maya/store"
    );
  });

  it("uses the block heading when the creator set one", () => {
    render(<StoreBlock block={block("New drops")} theme={undefined} store={store} />);
    expect(screen.getByRole("heading", { name: "New drops" })).toBeTruthy();
  });

  it("renders nothing while the store is not live or has no products", () => {
    const { container, rerender } = render(
      <StoreBlock block={block()} theme={undefined} store={null} />
    );
    expect(container.innerHTML).toBe("");
    rerender(<StoreBlock block={block()} theme={undefined} store={{ ...store, products: [] }} />);
    expect(container.innerHTML).toBe("");
  });

  it("never says price, monthly or a month (acceptance 5)", () => {
    const { container } = render(<StoreBlock block={block()} theme={undefined} store={store} />);
    expect(container.textContent).not.toMatch(/price|monthly|a month/i);
  });
});
