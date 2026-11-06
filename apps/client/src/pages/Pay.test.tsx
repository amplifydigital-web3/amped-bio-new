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
  amped: vi.fn(),
  forIntent: vi.fn(),
  policy: vi.fn(),
}));

vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  useAuth: () => ({ authUser: { id: 20, handle: "fan" }, isPending: false }),
  trpc: {
    identity: {
      myChecks: {
        queryOptions: () => ({
          queryKey: ["identity.myChecks"],
          queryFn: () => ({ ageOver18: { pass: true }, seller: { pass: false } }),
        }),
      },
    },
    checkout: {
      get: {
        queryOptions: (input: { id: string }) => ({
          queryKey: ["checkout.get", input],
          queryFn: () => mocks.get(input),
        }),
      },
    },
    store: {
      publicPolicy: {
        queryOptions: (input: object) => ({
          queryKey: ["store.publicPolicy", input],
          queryFn: () => mocks.policy(input),
        }),
      },
    },
  },
  trpcClient: { payments: { forIntent: { query: mocks.forIntent } } },
}));
vi.mock("@/components/panels/wallet/send/useUsdcSigner", () => ({
  usePaymentChainSigner: () => vi.fn(),
}));
vi.mock("@/contexts/WalletContext", () => ({ useWalletContext: () => ({ address: "0x1" }) }));
vi.mock("@/components/panels/wallet/hooks/useUsdcBalance", () => ({
  useUsdcBalance: () => ({ data: mocks.balance }),
}));
vi.mock("@/config/usdc/flags", () => ({ USDC_FLAGS: { wallet: true, onramp: true } }));
vi.mock("@/components/shell/CheckoutResumeBar", () => ({ CHECKOUT_ON: true }));
vi.mock("@/components/checkout/provider", async importOriginal => ({
  ...(await importOriginal<typeof import("@/components/checkout/provider")>()),
  mockOutcome: () => null,
  createAmpedPayProvider: () => ({
    id: "ampedpay",
    quote: () => mocks.quote(),
    pay: (...args: unknown[]) => mocks.amped(...args),
    balanceOverride: () => null,
    seedLastSeen: () => null,
  }),
  createMockProvider: () => ({
    id: "mock",
    quote: () => mocks.quote(),
    pay: () => mocks.pay(),
    balanceOverride: () => mocks.override,
    seedLastSeen: () => mocks.seed,
  }),
}));

import { PayPage } from "./Pay";

// Counsel text verbatim (docs/legal/creator-storefront-policy.md A.2)
const SELLER_LINE = "Sold by Maya on Amped.bio. Your purchase is from Maya, not from Amped.";

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
    accessPeriodDays: null,
  },
  policy: null,
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
  mocks.amped.mockReset();
  mocks.forIntent.mockReset();
  mocks.policy.mockReset();
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
    expect(screen.getByText(SELLER_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/discretion|Payments are final/)).toBeNull();
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
    expect(screen.getByText(SELLER_LINE)).toBeInTheDocument();
  });

  it("names the creator handle in the seller line when there is no display name", async () => {
    mocks.quote.mockResolvedValue(quote({ creator: { ...quote().creator, name: "" } }));
    renderPay();
    expect(
      await screen.findByText(
        "Sold by @maya on Amped.bio. Your purchase is from @maya, not from Amped."
      )
    ).toBeInTheDocument();
  });

  it("a short balance names the gap and hands off to Wallet with the intent", async () => {
    mocks.balance = 1_000_000n;
    renderPay();
    expect(await screen.findByText("You need $2 USDC more.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add USDC in Wallet" }).getAttribute("href")).toBe(
      `/wallet?fund=usdc&ci=${ID}&need=2000000`
    );
    expect(screen.getByText(SELLER_LINE)).toBeInTheDocument();
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
    expect(screen.getByText(SELLER_LINE)).toBeInTheDocument();
  });

  it("a failed payment says nothing was taken and offers Try again", async () => {
    mocks.pay.mockResolvedValue({ result: "failed" });
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(await screen.findByText(/did not go through/)).toBeInTheDocument();
    expect(screen.getByText(SELLER_LINE)).toBeInTheDocument();
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

  it("a paid quote shows the paid screen and never offers Pay again", async () => {
    mocks.quote.mockResolvedValue(quote({ state: "paid", status: "paid" }));
    renderPay();
    expect(await screen.findByText("You paid @maya $3 USDC.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
  });

  it("an 18+ item fails closed until the Over 18 check exists", async () => {
    mocks.quote.mockResolvedValue(
      quote({ item: { title: "Episode 4", publicId: "abc123", kind: "VIDEO", adult: true } })
    );
    renderPay();
    expect(await screen.findByText(/This item is for over 18s/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
  });

  it("an ended checkout says so", async () => {
    mocks.get.mockResolvedValue({ id: ID, status: "expired", signedIn: true, item: null });
    renderPay();
    expect(await screen.findByText(/This checkout has ended/)).toBeInTheDocument();
  });
});

// CK-5: AmpedPay live, the store policy, Checking on return (mobile checkout 5, 9, 10)
describe("PayPage on AmpedPay (CK-5)", () => {
  const live = (overrides: object = {}) =>
    quote({
      provider: "ampedpay",
      policy: { version: 2, sellerName: "Maya Lin", changed: false },
      ...overrides,
    });

  it("pays through AmpedPay with no test checkout line, the Verified chip and the network fee", async () => {
    mocks.quote.mockResolvedValue(live());
    mocks.amped.mockResolvedValue({ result: "paid" });
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(await screen.findByText("You paid @maya $3 USDC.")).toBeInTheDocument();
    expect(mocks.amped).toHaveBeenCalledTimes(1);
    expect(mocks.pay).not.toHaveBeenCalled();
    expect(screen.queryByText("Test checkout. No USDC moves.")).toBeNull();
  });

  it("names the policy's seller, links the store policy and shows the access period", async () => {
    mocks.quote.mockResolvedValue(live({ item: { ...quote().item, accessPeriodDays: 30 } }));
    mocks.policy.mockResolvedValue({
      notice: "Maya Lin is the seller.",
      text: "1. Who you are buying from",
      version: 2,
    });
    renderPay();
    expect(
      await screen.findByText(/Sold by Maya Lin on Amped\.bio\. Your purchase is from Maya Lin/)
    ).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Network fee")).toBeInTheDocument();
    expect(screen.getByText("Paid by Amped.Bio")).toBeInTheDocument();
    expect(screen.getByText("Access for 30 days")).toBeInTheDocument();
    expect(screen.queryByText("Yours to keep")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Store policy" }));
    expect(await screen.findByText("1. Who you are buying from")).toBeInTheDocument();
    expect(mocks.policy).toHaveBeenCalledWith({ handle: "maya", v: 2 });
  });

  it("a changed store policy shows before Pay, and Pay sends the version the fan saw", async () => {
    mocks.quote.mockResolvedValue(
      live({ policy: { version: 3, sellerName: "Maya Lin", changed: true } })
    );
    mocks.amped.mockResolvedValue({ result: "paid" });
    renderPay();
    expect(await screen.findByText("Maya Lin updated their store policy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read the store policy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Not now" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay $3 USDC" }));
    await screen.findByText("You paid @maya $3 USDC.");
    expect(mocks.amped.mock.calls[0]![2]).toEqual({ policyVersion: 3 });
  });

  it("a short balance from the server turns Pay into Add USDC with the gap", async () => {
    mocks.quote.mockResolvedValue(live());
    mocks.amped.mockResolvedValue({
      result: "refused",
      reason: "insufficient_balance",
      shortBy: "2000000",
    });
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(await screen.findByText("You need $2 USDC more.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add USDC in Wallet" }).getAttribute("href")).toBe(
      `/wallet?fund=usdc&ci=${ID}&need=2000000`
    );
  });

  it("a refusal shows its one message; a wallet cancel says nothing was taken", async () => {
    mocks.quote.mockResolvedValue(live());
    mocks.amped.mockResolvedValueOnce({ result: "refused", reason: "seller" });
    const { unmount } = renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(await screen.findByText(/@maya cannot take payments/)).toBeInTheDocument();
    unmount();
    mocks.amped.mockResolvedValueOnce({ result: "rejected" });
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: "Pay $3 USDC" }));
    expect(
      await screen.findByText("You cancelled in your wallet. Nothing was taken from your wallet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $3 USDC" })).toBeInTheDocument();
  });

  it("a return to a submitted intent shows Checking, then paid when it lands", async () => {
    mocks.get.mockResolvedValue({ id: ID, status: "submitted", signedIn: true, item: null });
    mocks.quote.mockResolvedValue(live());
    mocks.forIntent.mockResolvedValueOnce({ status: "submitted" }).mockResolvedValue({
      status: "confirmed_soft",
    });
    renderPay();
    expect(await screen.findByText(/It can only go through once/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
    expect(
      await screen.findByText("You paid @maya $3 USDC.", undefined, { timeout: 5000 })
    ).toBeInTheDocument();
  });

  it("a signing intent with nothing sent opens the sheet as usual", async () => {
    mocks.get.mockResolvedValue({ id: ID, status: "signing", signedIn: true, item: null });
    mocks.quote.mockResolvedValue(live());
    mocks.forIntent.mockResolvedValue(null);
    renderPay();
    expect(await screen.findByRole("button", { name: "Pay $3 USDC" })).toBeInTheDocument();
  });
});
