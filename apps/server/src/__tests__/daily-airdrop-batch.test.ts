/**
 * Daily airdrop batch (#225): a batch is paid at most once. The batch goes out
 * with the nonce stored on its claim, so a send that fails after it reached the
 * chain is settled by that nonce on a later run and never sent again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: Uint8Array;
  userWalletId: number;
  amount: string;
  txHash: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  userWallet: { address: string };
};

const rows: Row[] = [];
const chain = {
  minedCount: 0,
  pendingCount: 0,
  balance: 10n ** 24n,
  writeError: null as Error | null,
  sends: [] as Array<{ nonce: number; recipients: string[] }>,
};

const idsOf = (where: any): Uint8Array[] | undefined => where?.id?.in;
const matches = (row: Row, where: any) => {
  const ids = idsOf(where);
  if (ids && !ids.some(id => Buffer.from(id).equals(Buffer.from(row.id)))) return false;
  if (where && "txHash" in where && row.txHash !== where.txHash) return false;
  return true;
};

vi.mock("../services/DB", () => ({
  prisma: {
    airdropQueueEntry: {
      findMany: vi.fn(async ({ where }: any = {}) =>
        rows.filter(row => matches(row, where)).map(row => ({ ...row }))
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows)
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const keep = rows.filter(row => !matches(row, where));
        const count = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { count };
      }),
    },
  },
}));

vi.mock("../utils/cache", () => {
  const keys = new Set<string>();
  return {
    cache: {
      setIfAbsent: vi.fn(async (key: string) => (keys.has(key) ? false : (keys.add(key), true))),
      delete: vi.fn(async (key: string) => keys.delete(key)),
    },
  };
});

vi.mock("../env", () => ({
  env: {
    FAUCET_PRIVATE_KEY: "0x" + "11".repeat(32),
    FAUCET_MOCK_MODE: "false",
    FAUCET_AMOUNT: "1",
    DAILY_AIRDROP_BATCH_HOUR: 14,
  },
}));

vi.mock("@repo/web3", () => ({
  SIMPLE_BATCH_SEND_ABI: [],
  getChainConfig: () => ({
    id: 1,
    rpcUrls: { default: { http: ["http://rpc"] } },
    nativeCurrency: { symbol: "tREVO" },
    contracts: { SIMPLE_BATCH_SEND: { address: "0x00000000000000000000000000000000000000aa" } },
  }),
}));

vi.mock("viem", async importOriginal => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({
    getBalance: async () => chain.balance,
    getTransactionCount: async ({ blockTag }: { blockTag: string }) =>
      blockTag === "latest" ? chain.minedCount : chain.pendingCount,
    waitForTransactionReceipt: async () => ({ status: "success" }),
  }),
  createWalletClient: () => ({
    writeContract: async ({ nonce, args }: { nonce: number; args: [string[], bigint[]] }) => {
      if (chain.writeError) throw chain.writeError;
      chain.sends.push({ nonce, recipients: args[0] });
      return ("0x" + "ab".repeat(32)) as `0x${string}`;
    },
  }),
}));

import { sendPendingBatch } from "../services/dailyAirdrop";

const queue = (n: number) => {
  for (let i = 0; i < n; i++)
    rows.push({
      id: new Uint8Array([i + 1]),
      userWalletId: i + 1,
      amount: "1000",
      txHash: null,
      claimedAt: null,
      createdAt: new Date(Date.now() + i),
      userWallet: { address: `0x${String(i + 1).padStart(40, "0")}` },
    });
};
const ageClaims = () => {
  for (const row of rows) if (row.claimedAt) row.claimedAt = new Date(Date.now() - 20 * 60 * 1000);
};

beforeEach(() => {
  rows.splice(0);
  Object.assign(chain, { minedCount: 5, pendingCount: 5, writeError: null, sends: [] });
});

describe("sendPendingBatch", () => {
  it("sends one batch with the claim's nonce and clears the queue", async () => {
    queue(3);
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(1);
    expect(chain.sends[0].nonce).toBe(5);
    expect(chain.sends[0].recipients).toHaveLength(3);
    expect(rows).toHaveLength(0);
  });

  it("never pays twice when the send fails after it reached the chain", async () => {
    queue(2);
    chain.writeError = new Error("request timed out");
    await sendPendingBatch();
    expect(rows.every(row => row.txHash?.startsWith("pending:5:"))).toBe(true);

    // The timed out send was mined with nonce 5
    chain.writeError = null;
    chain.minedCount = 6;
    chain.pendingCount = 6;
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it("waits while the send is still in the mempool", async () => {
    queue(2);
    chain.writeError = new Error("request timed out");
    await sendPendingBatch();
    chain.writeError = null;
    chain.pendingCount = 6;
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it("releases and sends again when the nonce was never used", async () => {
    queue(2);
    chain.writeError = new Error("request timed out");
    await sendPendingBatch();
    chain.writeError = null;
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(1);
    expect(rows).toHaveLength(0);
  });

  it("returns the rows to the queue at once when an instant send took the nonce", async () => {
    queue(2);
    chain.writeError = new Error("nonce too low");
    await sendPendingBatch();
    expect(rows.every(row => row.txHash === null && row.claimedAt === null)).toBe(true);
  });

  it("pays only the rows this run claimed", async () => {
    queue(3);
    // Another worker holds the second row
    rows[1].txHash = "pending:4:other";
    rows[1].claimedAt = new Date();
    chain.pendingCount = 6;
    await sendPendingBatch();
    expect(chain.sends[0].recipients).toHaveLength(2);
    expect(rows.map(row => row.userWalletId)).toEqual([2]);
  });
});
