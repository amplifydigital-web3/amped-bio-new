/**
 * People, Members (MB-1, row 369, board mb1): the plan line with the per renewal amount,
 * filters, and each member's state in words (In grace, day N of 7; Not ready, reminded).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({ members: vi.fn() }));

vi.mock("@repo/ui", async () => ({
  ...(await import("../content/testUi").then(m => m.prismUi())),
  trpc: {
    memberships: {
      members: {
        infiniteQueryOptions: (input: object, opts: object) => ({
          queryKey: ["memberships.members", input],
          queryFn: () => mocks.members(input),
          initialPageParam: undefined,
          ...opts,
        }),
      },
    },
  },
}));

import { MembersView, stateLabel } from "./MembersView";

const plan = {
  id: "05".repeat(16),
  name: "Tide Circle",
  description: null,
  benefits: [],
  amountEvery30Days: "5000000",
  amountYearly: "48000000",
  yearlySavingPercent: 20,
  status: "active" as const,
  showMemberCount: true,
  version: 1,
  activeMembers: 2,
};

function member(over: Record<string, unknown> = {}) {
  return {
    id: "01".repeat(16),
    member: { name: "Priya Natarajan", handle: "priya.n" },
    interval: "every_30_days",
    amount: "5000000",
    state: "active",
    graceDay: null,
    accessUntil: null,
    endedAt: null,
    joinedAt: "2026-10-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mocks.members.mockResolvedValue({
    rows: [
      member(),
      member({
        id: "02".repeat(16),
        member: { name: "Marcus Lee", handle: "marcuslee" },
        state: "in_grace",
        graceDay: 2,
        accessUntil: "2026-11-09T00:00:00Z",
      }),
    ],
    nextCursor: null,
  });
});

function renderMembers() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <MemoryRouter>
      <MembersView plan={plan} />
    </MemoryRouter>,
    { queryClient }
  );
}

describe("People, Members (board mb1)", () => {
  it("shows the plan with what the creator receives per renewal", async () => {
    renderMembers();
    expect(screen.getByText("Tide Circle")).toBeTruthy();
    expect(screen.getByText("$5 USDC every 30 days, $48 USDC a year")).toBeTruthy();
    expect(screen.getByText("You receive $4.75 USDC per renewal.")).toBeTruthy();
  });

  it("lists members with their state in words", async () => {
    renderMembers();
    expect(await screen.findByText("Priya Natarajan")).toBeTruthy();
    expect(screen.getByText("In grace, day 2 of 7")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });

  it("filters on the server", async () => {
    renderMembers();
    fireEvent.click(await screen.findByRole("button", { name: "In grace" }));
    await waitFor(() => expect(mocks.members).toHaveBeenCalledWith({ filter: "in_grace" }));
  });

  it("words every state without dashes", () => {
    const states = [
      member({ state: "not_ready" }),
      member({ state: "renewal_paused" }),
      member({ state: "ended", endedAt: "2026-11-01T12:00:00Z" }),
    ].map(row => stateLabel(row as never));
    expect(states).toEqual(["Not ready, reminded", "Renewal paused", "Ended Nov 1"]);
  });
});
