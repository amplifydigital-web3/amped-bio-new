/**
 * Buy USDC from a short balance on the pay sheet (mobile checkout 8, PR CK-3). tRPC and
 * the wallet are mocked; the panel and its controls are real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "@/test/utils";

const ID = "ab".repeat(16);

const mocks = vi.hoisted(() => ({
  awaitFunds: vi.fn(async (_input: { id: string }) => ({ id: "", status: "awaiting_funds" })),
  status: null as unknown,
  minCents: 500,
  checkoutOn: true,
}));

const mutation = (fn?: (input: never) => Promise<unknown>) => ({
  mutationFn: fn ?? (async () => undefined),
});

vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  trpc: {
    checkout: { awaitFunds: { mutationOptions: () => mutation(mocks.awaitFunds) } },
    onramp: {
      options: {
        queryOptions: () => ({
          queryKey: ["onramp.options"],
          queryFn: async () => ({
            paused: false,
            region: { country: "US", subdivision: "NY" },
            needsRegion: false,
            regionSupported: true,
            countries: [],
            fiatCurrency: "USD",
            paths: {
              coinbase_account: {
                available: true,
                reason: null,
                minCents: mocks.minCents,
                maxCents: 500_000,
              },
              apple_pay: { available: false, reason: null, minCents: 500, maxCents: 50_000 },
              google_pay: { available: false, reason: null, minCents: 500, maxCents: 50_000 },
            },
          }),
        }),
      },
      quote: {
        queryOptions: (input: unknown) => ({
          queryKey: ["onramp.quote", input],
          queryFn: async () => ({ quote: null }),
        }),
      },
      status: {
        queryOptions: (input: unknown) => ({
          queryKey: ["onramp.status", input],
          queryFn: async () => mocks.status,
        }),
        queryKey: () => ["onramp.status"],
      },
      createSession: { mutationOptions: () => mutation() },
      createOrder: { mutationOptions: () => mutation() },
      frameEvent: { mutationOptions: () => mutation() },
      cancel: { mutationOptions: () => mutation() },
    },
    usdc: { activity: { queryKey: () => ["usdc.activity"] } },
  },
}));
vi.mock("@/contexts/WalletContext", () => ({ useWalletContext: () => ({ address: "0x1" }) }));
vi.mock("../dialogs/ReceiveDialog", () => ({ default: () => null }));
vi.mock("@/components/shell/CheckoutResumeBar", () => ({
  get CHECKOUT_ON() {
    return mocks.checkoutOn;
  },
}));

import BuyUsdcFlow from "./BuyUsdcFlow";

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <BuyUsdcFlow />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.awaitFunds.mockClear();
  mocks.checkoutOn = true;
  mocks.status = null;
  mocks.minCents = 500;
});

describe("Buy USDC from a checkout", () => {
  it("a shortfall under Coinbase's minimum prefills the minimum and says why", async () => {
    renderAt(`/wallet?fund=usdc&ci=${ID}&need=2000000`);
    expect(
      await screen.findByText("Coinbase's smallest purchase is $5. The rest stays in your wallet.")
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    await waitFor(() => expect(mocks.awaitFunds).toHaveBeenCalledTimes(1));
    expect(mocks.awaitFunds.mock.calls[0]![0]).toEqual({ id: ID });
  });

  it("a larger shortfall prefills the shortfall, rounded up to the cent, with no minimum line", async () => {
    renderAt(`/wallet?fund=usdc&ci=${ID}&need=7250001`);
    expect(await screen.findByDisplayValue("7.26")).toBeInTheDocument();
    expect(screen.queryByText(/smallest purchase/)).toBeNull();
  });

  it("with checkout off the intent is not moved to awaiting_funds", async () => {
    mocks.checkoutOn = false;
    renderAt(`/wallet?fund=usdc&ci=${ID}&need=1000000`);
    expect(await screen.findByDisplayValue("5")).toBeInTheDocument();
    expect(mocks.awaitFunds).not.toHaveBeenCalled();
  });

  it("without a checkout nothing is prefilled and no intent moves", async () => {
    renderAt("/wallet?fund=usdc");
    expect(await screen.findByDisplayValue("25")).toBeInTheDocument();
    expect(mocks.awaitFunds).not.toHaveBeenCalled();
  });

  it("Arrived offers Back to checkout for a purchase started from a checkout", async () => {
    mocks.status = {
      status: "success",
      chainConfirmed: true,
      mode: "coinbase_account",
      usdcAmount: "5000000",
      quote: null,
      fiatAmount: 500,
      fiatCurrency: "USD",
      orderRef: null,
      txHash: null,
      sandbox: true,
      returnTo: `/pay/${ID}`,
      failureCode: null,
    };
    renderAt(`/wallet?fund=usdc&session=s1&ci=${ID}`);
    expect(await screen.findByRole("button", { name: /Back to checkout/ })).toBeInTheDocument();
    expect(screen.getByText(/nothing was delivered on chain/)).toBeInTheDocument();
  });
});
