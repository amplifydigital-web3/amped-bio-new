/**
 * Block Review v2 B0 on the public page: a scheduled block DTO renders as the
 * closed countdown row, and every block sits in a BlockFrame, only while the
 * blocksV2 flag is on.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { BlockType, FeatureFlagOverrides } from "@repo/constants";

vi.mock("@/lib/trpc", () => ({ trpcClient: {} }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ authUser: null, isPending: false }),
}));
vi.mock("@/hooks/useReferralHandler", () => ({
  useReferralHandler: () => ({ handleReferrerClick: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({
  recordConsent: vi.fn(),
  startEngagementTracking: vi.fn(),
  trackConsentedPageView: vi.fn(),
  trackLinkClick: vi.fn(),
  trackProfileView: vi.fn(),
}));
vi.mock("@/components/follow/useFollow", () => ({
  useFollow: () => ({ status: null, failed: false, toast: null, dismissToast: vi.fn() }),
}));
vi.mock("@/components/content/gating", () => ({
  usePageDecisions: () => Object.assign(() => null, { refresh: vi.fn() }),
  StakeNotices: () => null,
}));
vi.mock("@/components/ParticlesBackground", () => ({ ParticlesBackground: () => null }));
// Block renderers this page test does not use (some pull in CSS modules)
vi.mock("@/components/blocks/MediaBlock", () => ({ MediaBlock: () => null }));
vi.mock("@/components/content/ContentBlock", () => ({ ContentBlock: () => null }));
vi.mock("@/components/store/StoreBlock", () => ({ StoreBlock: () => null }));

// jsdom has no ResizeObserver; the consent card measures itself with one
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import { FeatureFlagsProvider } from "@/components/providers/FeatureFlagsProvider";
import { ProfileView } from "./ProfileView";
import type { ProfilePageData } from "@/lib/profilePageData";

const scheduled = {
  id: 41,
  type: "link",
  order: 0,
  config: { label: "Kiln sale preview" },
  scheduled: { start: "2099-11-06T20:00:00Z" },
} as unknown as BlockType;

const link = {
  id: 42,
  type: "link",
  order: 1,
  config: { label: "Book a studio visit", url: "https://example.com/book", platform: "custom" },
} as unknown as BlockType;

const data = (blocks: BlockType[]): ProfilePageData => ({
  profile: { id: 9, name: "Mara Vale", handle: "maravale", handleFormatted: "@maravale", bio: "" },
  blocks,
  theme: null,
  hasCreatorPool: false,
  creatorPoolAddress: null,
  trackingPixels: null,
  indexable: true,
  contentCards: {},
  hasAdult: false,
  fonts: null,
  storeBlock: null,
});

function renderPage(overrides: FeatureFlagOverrides) {
  return render(
    <FeatureFlagsProvider overrides={overrides}>
      <ProfileView handle="maravale" initialData={data([scheduled, link])} />
    </FeatureFlagsProvider>
  );
}

describe("ProfileView with blocksV2", () => {
  it("renders a scheduled DTO as a countdown row with no link or button", () => {
    const { container } = renderPage({ blocksV2: true, themeV2: true });
    const row = container.querySelector("[data-countdown-row]")!;
    expect(row).not.toBeNull();
    expect(row.textContent).toContain("Kiln sale preview");
    expect(row.textContent).toMatch(/Opens in \d+ days · .* your time/);
    expect(row.querySelector("a, button")).toBeNull();
    expect(screen.getByRole("link", { name: /Book a studio visit/ })).toHaveAttribute(
      "href",
      "https://example.com/book"
    );
    // Each block sits in its frame
    expect(container.querySelectorAll("[data-block-frame]")).toHaveLength(2);
  });

  it("renders no countdown row and no frame while the flag is off", () => {
    const { container } = renderPage({ blocksV2: false, themeV2: true });
    expect(container.querySelector("[data-countdown-row]")).toBeNull();
    expect(container.querySelector("[data-block-frame]")).toBeNull();
    expect(screen.queryByText("Kiln sale preview")).toBeNull();
    expect(screen.getByRole("link", { name: /Book a studio visit/ })).toBeInTheDocument();
  });
});
