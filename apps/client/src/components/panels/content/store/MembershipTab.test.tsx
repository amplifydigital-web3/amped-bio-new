/**
 * Store tab, Membership (MB-2, row 160, board st4): the plan editor saves amounts in USDC units,
 * shows the yearly saving and what the creator receives per renewal, and starts or pauses
 * new members.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({ get: vi.fn(), upsert: vi.fn(), setStatus: vi.fn() }));

vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  queryClient: { invalidateQueries: vi.fn() },
  trpc: {
    memberships: {
      plan: {
        get: {
          queryKey: () => ["memberships.plan.get"],
          queryOptions: () => ({ queryKey: ["memberships.plan.get"], queryFn: () => mocks.get() }),
        },
      },
    },
  },
  trpcClient: {
    memberships: {
      plan: { upsert: { mutate: mocks.upsert }, setStatus: { mutate: mocks.setStatus } },
    },
  },
}));

import { MembershipTab } from "./MembershipTab";

beforeEach(() => Object.values(mocks).forEach(mock => mock.mockReset()));

describe("MembershipTab (MB-2)", () => {
  it("creates a plan with amounts in USDC units and shows the saving and the per renewal line", async () => {
    mocks.get.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
    renderWithProviders(<MembershipTab />);
    expect(await screen.findByRole("heading", { name: "Set up a membership" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Inner circle" } });
    fireEvent.change(screen.getByLabelText(/Every 30 days, USDC/), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/A year, USDC/), { target: { value: "48" } });
    expect(screen.getByText("Members save 20% a year.")).toBeTruthy();
    expect(screen.getByText(/You receive \$4\.75 USDC per renewal/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create membership" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      name: "Inner circle",
      amountEvery30Days: "5000000",
      amountYearly: "48000000",
    });
    expect(document.body.textContent ?? "").not.toMatch(/price|monthly/i);
  });

  it("starts taking members for a draft and pauses an active plan", async () => {
    const saved = {
      id: "0f".repeat(16),
      name: "Inner circle",
      description: null,
      benefits: [],
      amountEvery30Days: "5000000",
      amountYearly: null,
      status: "draft",
      version: 1,
      showMemberCount: true,
    };
    mocks.get.mockResolvedValue(saved);
    mocks.setStatus.mockResolvedValue({});
    const { unmount } = renderWithProviders(<MembershipTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Start taking members" }));
    await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith({ status: "active" }));
    unmount();
    mocks.get.mockResolvedValue({ ...saved, status: "active" });
    renderWithProviders(<MembershipTab />);
    expect(await screen.findByText("Taking members")).toBeTruthy();
    expect(screen.getByText("New amounts apply to new members only.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause new members" }));
    await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith({ status: "paused" }));
  });
});
