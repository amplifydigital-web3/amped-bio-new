/**
 * People, Access (G6, gating spec 3.10 deltas 7 to 9): totals only, "Under 5" for small
 * buckets, the empty state with the pilot line, and no fan detail anywhere.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { AccessRulesStats } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({ stats: vi.fn() }));

vi.mock("@repo/ui", async () => ({
  ...(await import("../content/testUi").then(m => m.prismUi())),
  trpc: {
    access: {
      rules: {
        stats: {
          queryOptions: (input: object) => ({
            queryKey: ["access.rules.stats", input],
            queryFn: () => mocks.stats(input),
          }),
        },
      },
    },
  },
}));

import { AccessView, countText, reasonText } from "./AccessView";

const row = (locked: number | "under_5", opened: number | "under_5", rate: number | null) => ({
  lockedViewers: locked,
  triedViewers: 20,
  openedViewers: opened,
  openRate: rate,
});

const stats: AccessRulesStats = {
  range: "30d",
  totals: row(120, 9, 45),
  rules: [
    {
      ...row(80, 9, 45),
      ruleId: "aa".repeat(16),
      kind: "follower",
      summary: "Followers",
      name: "Inner circle",
      uses: 3,
      opensToAllAt: "2099-12-01T05:00:00.000Z",
    },
    {
      ...row("under_5", 0, null),
      ruleId: "bb".repeat(16),
      kind: "member",
      summary: "Members",
      name: null,
      uses: 1,
      opensToAllAt: null,
    },
  ],
  reasons: [
    { reason: "not_follower", viewers: 70 },
    { reason: "blocked", viewers: "under_5" },
  ],
  items: [{ ...row(40, "under_5", null), type: "content", id: "abc123", label: "Studio session" }],
};

beforeEach(() => {
  mocks.stats.mockReset().mockResolvedValue(stats);
});

describe("AccessView", () => {
  it("shows totals, rules, items and reasons, with Under 5 for small buckets", async () => {
    renderWithProviders(<AccessView />);
    expect(await screen.findByText("Inner circle")).toBeInTheDocument();
    expect(mocks.stats).toHaveBeenCalledWith({ range: "30d" });
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Used on 3 items")).toBeInTheDocument();
    expect(screen.getByText("Open to everyone on Dec 1")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText("Studio session")).toBeInTheDocument();
    expect(screen.getByText("Not following you")).toBeInTheDocument();
    expect(screen.getByText("Blocked by you")).toBeInTheDocument();
    expect(screen.getAllByText("Under 5").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Not enough yet").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(/Totals only. You never see who saw, tried or opened a locked item./)
    ).toBeInTheDocument();
  });

  it("shows No rules yet with the pilot line when there are no rules", async () => {
    mocks.stats.mockResolvedValue({ ...stats, rules: [], reasons: [], items: [] });
    renderWithProviders(<AccessView />);
    expect(await screen.findByText("No rules yet")).toBeInTheDocument();
    expect(
      screen.getByText("Pool rules are open to pilot creators while counsel reviews them.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Period/ })).toBeNull();
  });

  it("offers Try again when the numbers do not load", async () => {
    mocks.stats.mockRejectedValue(new Error("down"));
    renderWithProviders(<AccessView />, {
      queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    });
    await waitFor(() =>
      expect(screen.getByText("Your access numbers did not load")).toBeInTheDocument()
    );
  });

  it("formats counts and reasons in plain words", () => {
    expect(countText("under_5")).toBe("Under 5");
    expect(countText(1234)).toBe("1,234");
    expect(reasonText("stake_below_min")).toBe("Stake below your minimum");
  });
});
