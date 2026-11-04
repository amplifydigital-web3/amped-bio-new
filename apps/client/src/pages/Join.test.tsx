import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { renderWithProviders } from "@/test/utils";

const ID = "cd".repeat(16);
const WALLET = "0x00000000000000000000000000000000000000a1" as const;

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  prepare: vi.fn(),
  submit: vi.fn(),
  status: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  trpc: {
    memberships: {
      public: {
        queryOptions: (input: { handle: string }) => ({
          queryKey: ["memberships.public", input],
          queryFn: () => mocks.plan(input),
        }),
      },
    },
  },
  trpcClient: {
    memberships: {
      join: {
        prepare: { mutate: mocks.prepare },
        submit: { mutate: mocks.submit },
        status: { query: mocks.status },
      },
    },
  },
}));
vi.mock("wagmi", async importOriginal => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => ({ address: WALLET }),
}));
vi.mock("@/components/panels/wallet/send/useUsdcSigner", () => ({
  usePaymentChainSigner: () => mocks.sign,
}));

import { JoinPage } from "./Join";

const plan = (overrides: object = {}) => ({
  id: "0f".repeat(16),
  handle: "maya",
  sellerName: "Maya Lin",
  policyVersion: 2,
  name: "Inner circle",
  description: null,
  benefits: ["Every episode a week early"],
  amountEvery30Days: "5000000",
  amountYearly: "48000000",
  yearlySavingPercent: 20,
  memberCount: null,
  viewer: null,
  ...overrides,
});

const domain = {
  name: "AmpedMemberships",
  version: "1",
  chainId: 84532,
  verifyingContract: WALLET,
};
const prepared = {
  refused: false,
  membershipId: ID,
  amount: "5000000",
  fee: "250000",
  interval: "every_30_days",
  allowance: "60000000",
  sellerName: "Maya Lin",
  storePolicyVersion: 2,
  signer: WALLET,
  typed: {
    join: {
      domain,
      message: {
        subscriptionRef: `0x${"00".repeat(16)}${ID}`,
        planRef: `0x${"11".repeat(32)}`,
        member: WALLET,
        price: "5000000",
        periodSeconds: 2592000,
        recipients: [],
        validBefore: "1900000000",
      },
    },
    permit: {
      domain: { ...domain, name: "USDC", version: "2" },
      message: {
        owner: WALLET,
        spender: WALLET,
        value: "60000000",
        nonce: "0",
        deadline: "1900000000",
      },
    },
  },
};

function renderJoin() {
  return renderWithProviders(
    <MemoryRouter initialEntries={["/join/@maya"]}>
      <Routes>
        <Route path="/join/:handle" element={<JoinPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
});

describe("JoinPage (MB-2)", () => {
  it("shows the amount, the seller line and an unticked consent that gates Join", async () => {
    mocks.plan.mockResolvedValue(plan());
    renderJoin();
    expect(await screen.findByRole("heading", { name: "Join @maya" })).toBeTruthy();
    expect(
      await screen.findByText(/\$5 USDC today, then \$5 USDC every 30 days from your wallet/)
    ).toBeTruthy();
    expect(screen.getByText(/Sold by Maya Lin on Amped\.bio/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Store policy" }).getAttribute("href")).toMatch(
      /\/maya\/store\/policy\?v=2$/
    );
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    const join = screen.getByRole("button", { name: "Join for $5 USDC" }) as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    fireEvent.click(box);
    expect(join.disabled).toBe(false);
    expect(document.body.textContent ?? "").not.toMatch(/price|monthly/i);
  });

  it("switches to yearly with the saving and the yearly consent", async () => {
    mocks.plan.mockResolvedValue(plan());
    renderJoin();
    fireEvent.click(await screen.findByRole("radio", { name: "Yearly, save 20%" }));
    expect(screen.getByRole("button", { name: "Join for $48 USDC" })).toBeTruthy();
    expect(
      screen.getByText(/I agree to yearly renewals and to Maya Lin's store policy\./)
    ).toBeTruthy();
  });

  it("signs the join table and the permit, submits, and lands as a member", async () => {
    mocks.plan.mockResolvedValue(plan());
    mocks.prepare.mockResolvedValue(prepared);
    mocks.sign
      .mockResolvedValueOnce(`0x${"aa".repeat(65)}`)
      .mockResolvedValueOnce(`0x${"bb".repeat(65)}`);
    mocks.submit.mockResolvedValue({
      refused: false,
      membershipId: ID,
      status: "active",
      txHash: "0x1",
    });
    renderJoin();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Join for $5 USDC" }));
    expect(await screen.findByText("You are a member.")).toBeTruthy();
    expect(mocks.prepare).toHaveBeenCalledWith({
      handle: "maya",
      interval: "every_30_days",
      signer: WALLET,
    });
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(mocks.sign.mock.calls[0][0].primaryType).toBe("JoinTable");
    expect(mocks.sign.mock.calls[1][0].primaryType).toBe("Permit");
    expect(mocks.submit).toHaveBeenCalledWith({
      membershipId: ID,
      memberSignature: `0x${"aa".repeat(65)}`,
      permitSignature: `0x${"bb".repeat(65)}`,
    });
  });

  it("offers Add USDC when the wallet is short", async () => {
    mocks.plan.mockResolvedValue(plan());
    mocks.prepare.mockResolvedValue({
      refused: true,
      reason: "insufficient_balance",
      shortBy: "2000000",
    });
    renderJoin();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Join for $5 USDC" }));
    expect(await screen.findByText(/Your wallet needs \$2 USDC more\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add USDC" }).getAttribute("href")).toContain(
      "need=2000000"
    );
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("reads Not taking new members right now for a lapsed seller or no active plan", async () => {
    mocks.plan.mockResolvedValue(plan());
    mocks.prepare.mockResolvedValue({ refused: true, reason: "seller" });
    renderJoin();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Join for $5 USDC" }));
    expect(await screen.findByText("Not taking new members right now")).toBeTruthy();
  });

  it("shows the member state instead of Join for a current member", async () => {
    mocks.plan.mockResolvedValue(
      plan({
        viewer: { status: "active", accessUntil: new Date(Date.now() + 86400000).toISOString() },
      })
    );
    renderJoin();
    expect(await screen.findByText("You are a member")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Join for/ })).toBeNull();
  });

  it("says nothing was taken when the wallet signature is cancelled", async () => {
    mocks.plan.mockResolvedValue(plan());
    mocks.prepare.mockResolvedValue(prepared);
    mocks.sign.mockRejectedValue(
      Object.assign(new Error("User rejected the request"), { code: 4001 })
    );
    renderJoin();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Join for $5 USDC" }));
    await waitFor(() =>
      expect(screen.getByText("You cancelled in your wallet. Nothing was taken.")).toBeTruthy()
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
