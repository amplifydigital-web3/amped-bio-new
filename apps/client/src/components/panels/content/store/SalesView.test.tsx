/**
 * Store tab, Sales (C10, row 161, boards st5 and k2). The rules that matter: Pending until
 * final then Final; buyers by name and handle; the refund sheet shows the creator's store
 * policy summary and who pays what; the creator signs the refund and the permit with the
 * wallet the server names, then the server sends it; the CSV note names the policy version.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { STORE_SALES_COPY } from "@repo/constants";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  csv: vi.fn(),
  prepare: vi.fn(),
  submit: vi.fn(),
  sign: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@repo/ui", async () => {
  const UI = "../../../../../../../packages/ui/src";
  const base = await import("../testUi").then(m => m.prismUi());
  const sheet = await import(`${UI}/prism/bottom-sheet`);
  return {
    ...base,
    ...sheet,
    queryClient: { invalidateQueries: vi.fn() },
    trpcClient: { store: { sales: { csv: { query: mocks.csv } } } },
    trpc: {
      store: {
        sales: {
          pathKey: () => ["store.sales"],
          list: {
            infiniteQueryOptions: (input: object, opts: object) => ({
              queryKey: ["store.sales.list", input],
              queryFn: () => mocks.list(),
              initialPageParam: undefined,
              ...opts,
            }),
          },
          refund: {
            prepare: { mutationOptions: () => ({ mutationFn: mocks.prepare }) },
            submit: { mutationOptions: () => ({ mutationFn: mocks.submit }) },
          },
        },
      },
    },
  };
});
vi.mock("@/components/ui/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("@/utils/paymentChain", () => ({
  paymentChain: { id: 84532, blockExplorers: { default: { url: "https://sepolia.basescan.org" } } },
}));
vi.mock("../../wallet/send/useUsdcSigner", () => ({ usePaymentChainSigner: () => mocks.sign }));

import { SalesView } from "./SalesView";

const S = STORE_SALES_COPY;
const SIGNER = "0x1111111111111111111111111111111111111111";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "01".repeat(16),
    buyer: { name: "Jordan Ellis", handle: "jordan" },
    title: "Field Kit sample pack",
    kind: "product",
    amount: "18000000",
    fee: "900000",
    promoter: null,
    net: "17100000",
    state: "pending",
    paidAt: "2026-11-01T12:00:00Z",
    refundedAt: null,
    txHash: "0xabc",
    refundable: true,
    ...over,
  };
}

const quote = {
  purchaseId: "01".repeat(16),
  buyerName: "Jordan Ellis",
  title: "Field Kit sample pack",
  amount: "18000000",
  fromWallet: "17100000",
  ampedReturns: "900000",
  notPulledBack: "1800000",
  balanceAfter: "95400000",
  policySummary: "You buy from Maya Lin. Sales are final.",
  signer: SIGNER,
  typed: {
    refund: {
      domain: { name: "AmpedPay", version: "1", chainId: 84532, verifyingContract: SIGNER },
      message: { paymentRef: `0x${"00".repeat(16)}${"01".repeat(16)}`, deadline: "1793800000" },
    },
    permit: {
      domain: { name: "USDC", version: "2", chainId: 84532, verifyingContract: SIGNER },
      message: {
        owner: SIGNER,
        spender: SIGNER,
        value: "17100000",
        nonce: "3",
        deadline: "1793800000",
      },
    },
  },
};

function renderSales() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <MemoryRouter>
      <SalesView />
    </MemoryRouter>,
    { queryClient }
  );
}

async function openRefund() {
  const trigger = await screen.findAllByRole("button", { name: S.rowMenu("Jordan Ellis") });
  fireEvent.pointerDown(trigger[0]!, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("menuitem", { name: S.refund }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({
    totals: { netThisMonth: "412300000", salesThisMonth: 38 },
    rows: [
      row(),
      row({ id: "02".repeat(16), state: "final", buyer: { name: "Tomas Reyes", handle: "tomas" } }),
    ],
    nextCursor: null,
    refundWindowDays: 30,
  });
  mocks.prepare.mockResolvedValue({ refused: false, quote });
  mocks.submit.mockResolvedValue({ refused: false, state: "refunding", txHash: "0xfeed" });
  mocks.sign
    .mockResolvedValueOnce(`0x${"aa".repeat(65)}`)
    .mockResolvedValueOnce(`0x${"bb".repeat(65)}`);
});

describe("Sales (board k2a)", () => {
  it("shows this month after fees and each sale as Pending or Final", async () => {
    renderSales();
    expect(await screen.findByText("$412.30 USDC")).toBeTruthy();
    expect(screen.getByText("38")).toBeTruthy();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Final").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Jordan Ellis").length).toBeGreaterThan(0);
    expect(screen.getByText(S.exportNote)).toBeTruthy();
  });

  it("names a deleted buyer without a name", async () => {
    mocks.list.mockResolvedValue({
      totals: { netThisMonth: "0", salesThisMonth: 0 },
      rows: [row({ buyer: null })],
      nextCursor: null,
      refundWindowDays: 30,
    });
    renderSales();
    expect((await screen.findAllByText(S.someone)).length).toBeGreaterThan(0);
  });

  it("has an empty state", async () => {
    mocks.list.mockResolvedValue({
      totals: { netThisMonth: "0", salesThisMonth: 0 },
      rows: [],
      nextCursor: null,
      refundWindowDays: 30,
    });
    renderSales();
    expect(await screen.findByText(S.emptyTitle)).toBeTruthy();
  });

  it("exports the chosen month", async () => {
    mocks.csv.mockResolvedValue({ month: "2026-11", csv: "Date\r\n" });
    renderSales();
    fireEvent.click(await screen.findByRole("button", { name: S.exportCsv }));
    await waitFor(() => expect(mocks.csv).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith({ type: "info", title: S.exportEmpty });
  });
});

describe("Refund (board k2b)", () => {
  it("shows the store policy summary and who pays what, then signs twice and sends", async () => {
    renderSales();
    const sheet = await openRefund();
    expect(await within(sheet).findByText(quote.policySummary)).toBeTruthy();
    expect(within(sheet).getByText("$17.10 USDC")).toBeTruthy();
    expect(within(sheet).getByText("$0.90 USDC")).toBeTruthy();
    expect(
      within(sheet).getByText(/promoter share of \$1.80 USDC is not pulled back/)
    ).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Refund $18 USDC" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.sign).toHaveBeenCalledTimes(2);
    expect(mocks.sign.mock.calls[0][0]).toMatchObject({ account: SIGNER, primaryType: "Refund" });
    expect(mocks.sign.mock.calls[1][0]).toMatchObject({ account: SIGNER, primaryType: "Permit" });
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({
      purchaseId: quote.purchaseId,
      refundSignature: `0x${"aa".repeat(65)}`,
      permitSignature: `0x${"bb".repeat(65)}`,
    });
    expect(mocks.toast).toHaveBeenCalledWith({ type: "success", title: S.sheet.done });
  });

  it("says why when the wallet is short and offers only Keep the sale", async () => {
    mocks.prepare.mockResolvedValue({
      refused: true,
      reason: "insufficient_balance",
      shortBy: "500000",
    });
    renderSales();
    const sheet = await openRefund();
    expect(
      await within(sheet).findByText("Your wallet needs $0.50 USDC more to refund.")
    ).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: /^Refund \$/ })).toBeNull();
  });

  it("sends nothing when the creator cancels in the wallet", async () => {
    mocks.sign.mockReset();
    mocks.sign.mockRejectedValue(
      Object.assign(new Error("User rejected"), { name: "UserRejectedRequestError" })
    );
    renderSales();
    const sheet = await openRefund();
    fireEvent.click(await within(sheet).findByRole("button", { name: "Refund $18 USDC" }));
    await waitFor(() => expect(mocks.sign).toHaveBeenCalled());
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
