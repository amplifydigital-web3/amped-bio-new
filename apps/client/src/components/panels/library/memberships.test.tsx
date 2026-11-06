/**
 * Library, Memberships (FL-7, MB-3; row 125, boards r1, mb-q1): cards most urgent first, one
 * filled button on the screen, Add $N USDC to the Wallet prefilled with the shortfall,
 * Rejoin, and the Manage sheet with receipts, the store policy at join and Cancel (one
 * signature).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/utils";
import { LIBRARY_MONEY_COPY } from "./copy";
import type { LibraryMembershipCard } from "@repo/constants";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  membership: vi.fn(),
  prepare: vi.fn(),
  submit: vi.fn(),
  sign: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/ui", async () => {
  const UI = "../../../../../../packages/ui/src";
  const base = await import("../content/testUi").then(m => m.prismUi());
  const sheet = await import(`${UI}/prism/bottom-sheet`);
  return {
    ...base,
    ...sheet,
    queryClient: { invalidateQueries: vi.fn() },
    trpcClient: {
      memberships: {
        cancel: { prepare: { mutate: mocks.prepare }, submit: { mutate: mocks.submit } },
      },
    },
    trpc: {
      library: {
        pathKey: () => ["library"],
        memberships: {
          queryOptions: () => ({ queryKey: ["library.memberships"], queryFn: mocks.memberships }),
        },
        membership: {
          queryOptions: (input: unknown) => ({
            queryKey: ["library.membership", input],
            queryFn: () => mocks.membership(input),
          }),
        },
      },
    },
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("../wallet/send/useUsdcSigner", () => ({ usePaymentChainSigner: () => mocks.sign }));

import { MembershipsPage } from "./MembershipsPage";

const owner = (handle: string) => ({
  handle,
  name: handle.toUpperCase(),
  image: null,
  accent: null,
});

function card(over: Partial<LibraryMembershipCard> = {}): LibraryMembershipCard {
  return {
    id: "01".repeat(16),
    owner: owner("maya"),
    planName: "Inner circle",
    interval: "every_30_days",
    amount: "5000000",
    state: "covered",
    accessUntil: "2026-11-14T12:00:00.000Z",
    nextChargeAt: "2026-11-14T12:00:00.000Z",
    graceDay: null,
    coveredThrough: "2026-12-14T12:00:00.000Z",
    need: null,
    allowanceShort: false,
    chargesLeft: 10,
    storePolicyVersion: 3,
    joinedAt: "2026-10-01T12:00:00.000Z",
    ...over,
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage(path = "/library/memberships") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <MembershipsPage />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
    { queryClient }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Memberships (row 125)", () => {
  it("shows each card's state with one filled button, the most urgent card's", async () => {
    mocks.memberships.mockResolvedValue({
      items: [
        card({
          id: "02".repeat(16),
          owner: owner("lio"),
          state: "past_due",
          graceDay: 3,
          need: "3000000",
        }),
        card({ id: "03".repeat(16), owner: owner("rae"), state: "not_covered", need: "5000000" }),
        card(),
        card({ id: "04".repeat(16), owner: owner("ana"), state: "ends", nextChargeAt: null }),
      ],
    });
    renderPage();
    expect(
      await screen.findByText("Past due, day 3 of 7. You keep access while you add USDC.")
    ).toBeTruthy();
    expect(screen.getByText("Covered through Dec 14, 2026")).toBeTruthy();
    expect(screen.getByText("Ends Nov 14, 2026. No more charges.")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add $3 USDC" });
    const second = screen.getByRole("button", { name: "Add $5 USDC" });
    expect(add.className).toContain("prism-btn-primary");
    expect(second.className).not.toContain("prism-btn-primary");
    // Canceled but still in force: Join would be refused, so no Rejoin is offered
    expect(screen.queryByRole("button", { name: "Rejoin" })).toBeNull();
    fireEvent.click(add);
    expect(screen.getByTestId("where").textContent).toBe(
      "/wallet?fund=usdc&need=3000000&returnTo=%2Flibrary%2Fmemberships"
    );
  });

  it("says when there are none", async () => {
    mocks.memberships.mockResolvedValue({ items: [] });
    renderPage();
    expect(await screen.findByText("No memberships yet")).toBeTruthy();
  });

  it("offers Rejoin only after the membership ended, never while one is in force", async () => {
    mocks.memberships.mockResolvedValue({
      items: [
        card({ id: "04".repeat(16), owner: owner("ana"), state: "ends", nextChargeAt: null }),
        card({
          id: "05".repeat(16),
          owner: owner("rae"),
          state: "not_covered",
          need: null,
          allowanceShort: true,
        }),
        card({
          id: "06".repeat(16),
          owner: owner("lio"),
          state: "ended",
          accessUntil: null,
          nextChargeAt: null,
        }),
      ],
    });
    renderPage();
    expect(await screen.findByText(LIBRARY_MONEY_COPY.states.allowanceShort)).toBeTruthy();
    const rejoin = await screen.findByRole("button", { name: "Rejoin" });
    fireEvent.click(rejoin);
    expect(screen.getByTestId("where").textContent).toBe("/join/@lio");
  });

  it("opens Manage with receipts and the policy, and cancels with one signature", async () => {
    mocks.memberships.mockResolvedValue({ items: [card()] });
    mocks.membership.mockResolvedValue({
      card: card(),
      receipts: [{ at: "2026-10-15T12:00:00.000Z", amount: "5000000", txHash: "0xabc" }],
    });
    mocks.prepare.mockResolvedValue({
      refused: false,
      membershipId: "01".repeat(16),
      signer: "0x00000000000000000000000000000000000000f1",
      accessUntil: "2026-11-14T12:00:00.000Z",
      typed: {
        domain: { name: "AmpedMemberships", version: "1", chainId: 84532 },
        message: { subscriptionRef: "0x" + "01".repeat(32), deadline: "1790000000" },
      },
    });
    mocks.sign.mockResolvedValue("0x" + "ab".repeat(65));
    mocks.submit.mockResolvedValue({
      refused: false,
      membershipId: "01".repeat(16),
      status: "canceled",
      txHash: null,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Oct 15, 2026, $5 USDC")).toBeTruthy();
    expect(within(sheet).getByText("Store policy, version 3, the one you agreed to")).toBeTruthy();
    expect(within(sheet).getByText("10")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel membership" }));
    expect(
      within(sheet).getByText(
        "Cancel this membership? No more charges. You keep access until Nov 14, 2026."
      )
    ).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel membership" }));
    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith({
        membershipId: "01".repeat(16),
        deadline: "1790000000",
        signature: "0x" + "ab".repeat(65),
      })
    );
    expect(mocks.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryType: "Cancel",
        account: "0x00000000000000000000000000000000000000f1",
      })
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Membership canceled. No more charges." })
    );
  });
});
