import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { renderWithProviders } from "@/test/utils";

const ID = "ab".repeat(16);

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  quote: vi.fn(),
  pay: vi.fn(),
  balance: undefined as bigint | undefined,
  override: null as bigint | null,
  seed: null as string | null,
}));

vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  useAuth: () => ({ authUser: { id: 20, handle: "fan" }, isPending: false }),
  trpc: {
    checkout: {
      get: {
        queryOptions: (input: { id: string }) => ({
          queryKey: ["checkout.get", input],
          queryFn: () => mocks.get(input),
        }),
      },
    },
  },
}));
vi.mock("@/contexts/WalletContext", () => ({ useWalletContext: () => ({ address: "0x1" }) }));
vi.mock("@/components/panels/wallet/hooks/useUsdcBalance", () => ({
  useUsdcBalance: () => ({ data: mocks.balance }),
}));
vi.mock("@/config/usdc/flags", () => ({ USDC_FLAGS: { wallet: true, onramp: true } }));
vi.mock("@/components/shell/CheckoutResumeBar", () => ({ CHECKOUT_ON: true }));
vi.mock("@/components/checkout/provider", () => ({
  createMockProvider: () => ({
    id: "mock",
    quote: () => mocks.quote(),
    pay: () => mocks.pay(),
    balanceOverride: () => mocks.override,
    seedLastSeen: () => mocks.seed,
  }),
}));

import { PayPage } from "./Pay";

const quote = (overrides: object = {}) => ({
  id: ID,
  status: "open",
  state: "ready",
  provider: "mock",
  item: {
    title: "Episode 4",
    publicId: "abc123",
    kind: "VIDEO",
    adult: false,
    path: "/maya/c/abc123",
  },
  creator: {
    handle: "maya",
    name: "Maya",
    image: null,
    theme: { buttonColor: "#16152B", fontColor: "#FFFFFF", containerColor: "#16152B" },
  },
  amount: "3000000",
  fee: "150000",
  feeBps: 500,
  quotedAt: new Date().toISOString(),
  validUntil: new Date().toISOString(),
  ...overrides,
});

function renderPay() {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/pay/${ID}`]}>
      <Routes>
        <Route path="/pay/:intentId" element={<PayPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  mocks.get.mockResolvedValue({
    id: ID,
    status: "open",
    signedIn: true,
    item: { title: "Episode 4" },
  });
  mocks.quote.mockResolvedValue(quote());
  mocks.pay.mockResolvedValue({ result: "paid" });
  mocks.balance = 10_000_000n;
  mocks.override = null;
  mocks.seed = null;
});

// Mobile checkout CK-2 (docs/features/mobile-checkout.md 5 to 10, boards c1, c5, c7, c8)
describe("PayPage", () => {
  it("shows one screen to pay with the fee, the balance after and the explainer", async () => {
    renderPay();
    expect(await screen.findByRole("heading", { name: "Episode 4" })).toBeInTheDocument();
    expect(screen.getByText("Paying @maya")).toBeInTheDocument();
    expect(screen.getByText("Includes the Amped.Bio fee (5.00%)")).toBeInTheDocument();
    expect(screen.getByText("Balance after")).toBeInTheDocument();
    expect(screen.getByText(/USDC is a digital dollar/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Sold by .+ on Amped\.bio\. You buy from .+, not Amped\./)
    ).toBeInTheDocument();
    expect(screen.getByText("Test checkout. No USDC moves.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("checks, then shows paid with Open on the item page", async () => {
    let finish: (value: { result: "paid" }) => void = () => {};
    mocks.pay.mockReturnValue(new Promise(resolve => (finish = resolve)));
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(await screen.findByText(/It can only go through once/)).toBeInTheDocument();
    finish({ result: "paid" });
    expect(await screen.findByText("You paid @maya $3 USDC.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toMatch(
      /\/maya\/c\/abc123$/
    );
  });

  it("a short balance names the gap and hands off to Wallet with the intent", async () => {
    mocks.balance = 1_000_000n;
    renderPay();
    expect(await screen.findByText("You need $2 USDC more.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add USDC in Wallet" }).getAttribute("href")).toBe(
      `/wallet?fund=usdc&ci=${ID}&need=2000000`
    );
  });

  it("back from a sandbox purchase, the sheet reads the chain balance and stays short", async () => {
    // Coinbase sandbox delivers nothing on chain: Arrived in Wallet never enables Pay here
    mocks.get.mockResolvedValue({ id: ID, status: "awaiting_funds", signedIn: true, item: null });
    mocks.balance = 1_000_000n;
    renderPay();
    expect(await screen.findByText("You need $2 USDC more.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
    expect(screen.getByRole("link", { name: "Add USDC in Wallet" })).toBeInTheDocument();
  });

  it("a changed price shows Was and Now before Pay", async () => {
    mocks.seed = "2000000";
    renderPay();
    expect(
      await screen.findByText("The price changed. Was $2 USDC. Now $3 USDC.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Not now" })).toBeInTheDocument();
  });

  it("a failed payment says nothing was taken and offers Try again", async () => {
    mocks.pay.mockResolvedValue({ result: "failed" });
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(await screen.findByText(/did not go through/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Pay $3 USDC" })).toBeInTheDocument();
  });

  it.each([
    ["paused", /Payments are paused/],
    ["limit", /today's limit/],
    ["seller", /@maya cannot take payments/],
    ["removed", /no longer for sale/],
  ])("the %s state shows its message and no Pay", async (state, text) => {
    mocks.quote.mockResolvedValue(quote({ state }));
    renderPay();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
  });

  it("an ended checkout says so", async () => {
    mocks.get.mockResolvedValue({ id: ID, status: "expired", signedIn: true, item: null });
    renderPay();
    expect(await screen.findByText(/This checkout has ended/)).toBeInTheDocument();
  });
});
