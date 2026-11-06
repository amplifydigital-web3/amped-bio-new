/**
 * Daily airdrop batch (#225): a batch is paid at most once. The transaction is
 * signed locally, its hash is persisted before the broadcast, and settlement
 * follows that hash. A nonce is never trusted on its own because instant faucet
 * sends share the same account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  type Row = {
    id: Uint8Array;
    userWalletId: number;
    amount: string;
    txHash: string | null;
    claimedAt: Date | null;
    createdAt: Date;
    userWallet: { address: string };
  };

  const USER_ADDRESS = "0x00000000000000000000000000000000000000bb";
  const batchAbi = [
    {
      type: "function",
      name: "send",
      inputs: [
        { name: "recipients", type: "address[]" },
        { name: "amounts", type: "uint256[]" },
      ],
      outputs: [],
      stateMutability: "payable",
    },
  ] as const;

  const rows: Row[] = [];
  const chain = {
    minedCount: 5,
    pendingCount: 5,
    balance: 10n ** 24n,
    userAddress: USER_ADDRESS,
    userBalance: 0n,
    prepareError: null as Error | null,
    sendRawError: null as Error | null,
    instantError: null as Error | null,
    receipt: null as { status: "success" | "reverted" } | null,
    transactionFound: false,
    sends: [] as Array<{ nonce: number; recipients: string[] }>,
  };

  const idsOf = (where: any): Uint8Array[] | undefined => where?.id?.in;
  const matches = (row: Row, where: any) => {
    const ids = idsOf(where);
    if (ids && !ids.some(id => Buffer.from(id).equals(Buffer.from(row.id)))) return false;
    if (where && "txHash" in where && row.txHash !== where.txHash) return false;
    return true;
  };

  const db = {
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
    siteSettings: {
      findUnique: vi.fn(),
    },
    userWallet: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    block: { count: vi.fn() },
    theme: { findUnique: vi.fn() },
  };

  return { USER_ADDRESS, batchAbi, rows, chain, db };
});

const { USER_ADDRESS, batchAbi, rows, chain, db } = state;

vi.mock("../services/DB", () => ({ prisma: state.db }));

vi.mock("../utils/cache", () => {
  const keys = new Set<string>();
  return {
    cache: {
      setIfAbsent: vi.fn(async (key: string) => (keys.has(key) ? false : (keys.add(key), true))),
      delete: vi.fn(async (key: string) => keys.delete(key)),
    },
    CACHE_TTL: {},
    getMethodSignatureCacheKey: vi.fn(() => ""),
  };
});

vi.mock("../env", () => ({
  env: {
    FAUCET_PRIVATE_KEY: "0x" + "11".repeat(32),
    FAUCET_MOCK_MODE: "false",
    FAUCET_AMOUNT: "1",
    DAILY_AIRDROP_BATCH_HOUR: 14,
    APP_ENV: "development",
  },
}));

vi.mock("@repo/web3", () => ({
  SIMPLE_BATCH_SEND_ABI: state.batchAbi,
  CREATOR_POOL_ABI: [],
  getRpcTransport: () => ({}),
  getChainConfig: () => ({
    id: 1,
    rpcUrls: { default: { http: ["http://rpc"] } },
    nativeCurrency: { symbol: "tREVO" },
    contracts: { SIMPLE_BATCH_SEND: { address: "0x00000000000000000000000000000000000000aa" } },
  }),
}));

vi.mock("viem", async importOriginal => {
  const original = await importOriginal<typeof import("viem")>();
  return {
    ...original,
    createPublicClient: () => ({
      getBalance: async ({ address }: { address: string }) =>
        address.toLowerCase() === chain.userAddress.toLowerCase()
          ? chain.userBalance
          : chain.balance,
      getTransactionCount: async ({ blockTag }: { blockTag: string }) =>
        blockTag === "latest" ? chain.minedCount : chain.pendingCount,
      getTransactionReceipt: async ({ hash }: { hash: `0x${string}` }) => {
        if (!chain.receipt)
          throw new original.TransactionReceiptNotFoundError({ hash });
        return chain.receipt;
      },
      getTransaction: async ({ hash }: { hash: `0x${string}` }) => {
        if (!chain.transactionFound) throw new original.TransactionNotFoundError({ hash });
        return { hash };
      },
      sendRawTransaction: async ({
        serializedTransaction,
      }: {
        serializedTransaction: `0x${string}`;
      }) => {
        if (chain.sendRawError) throw chain.sendRawError;
        const payload = JSON.parse(
          Buffer.from(serializedTransaction.slice(2), "hex").toString()
        ) as { nonce: number; data: `0x${string}` };
        const decoded = original.decodeFunctionData({
          abi: batchAbi as never,
          data: payload.data,
        });
        const recipients = (decoded.args?.[0] ?? []) as readonly string[];
        chain.sends.push({ nonce: payload.nonce, recipients: [...recipients] });
        return `0x${"ab".repeat(32)}` as `0x${string}`;
      },
      waitForTransactionReceipt: async () => chain.receipt ?? { status: "success" as const },
    }),
    createWalletClient: () => {
      let request: { nonce: number; data: `0x${string}` };
      return {
        prepareTransactionRequest: async (args: { nonce: number; data: `0x${string}` }) => {
          if (chain.prepareError) throw chain.prepareError;
          request = args;
          return args;
        },
        signTransaction: async (args: { nonce: number; data: `0x${string}` }) => {
          request = args;
          const body = JSON.stringify({ nonce: request.nonce, data: request.data });
          return `0x${Buffer.from(body).toString("hex")}` as `0x${string}`;
        },
        sendTransaction: async () => {
          if (chain.instantError) throw chain.instantError;
          return `0x${"cd".repeat(32)}` as `0x${string}`;
        },
      };
    },
  };
});

const walletDeps = vi.hoisted(() => ({
  getFaucetRequirements: vi.fn(async () => ({
    photo: true,
    background: true,
    bio: true,
    minLinks: true,
  })),
  verifyWeb3AuthIdToken: vi.fn(async () => ({})),
  web3AuthPublicKeyToAddress: vi.fn(() => USER_ADDRESS),
}));

vi.mock("../trpc/wallet", () => walletDeps);
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));

import {
  processDailyAirdropClaim,
  sendPendingBatch,
} from "../services/dailyAirdrop";
import { dailyAirdropRouter } from "../trpc/dailyAirdrop";

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

const caller = dailyAirdropRouter.createCaller({ user: { sub: 7 } } as never);
const claimInput = { publicKey: "public-key", chainId: 1, idToken: "id-token" };

beforeEach(() => {
  rows.splice(0);
  vi.clearAllMocks();
  Object.assign(chain, {
    minedCount: 5,
    pendingCount: 5,
    balance: 10n ** 24n,
    userBalance: 0n,
    prepareError: null,
    sendRawError: null,
    instantError: null,
    receipt: null,
    transactionFound: false,
    sends: [],
  });
  db.siteSettings.findUnique.mockResolvedValue({ setting_value: "true" });
  db.userWallet.findFirst.mockResolvedValue({
    id: 7,
    address: USER_ADDRESS,
    last_airdrop_request: null,
  });
  db.userWallet.updateMany.mockResolvedValue({ count: 1 });
  db.userWallet.update.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({
    image: "photo.png",
    image_file_id: null,
    description: "bio",
    theme: "1",
  });
  db.block.count.mockResolvedValue(5);
  db.theme.findUnique.mockResolvedValue({
    config: { background: { type: "color", value: "#000000" } },
  });
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

  it("deletes the rows when the persisted batch hash mined", async () => {
    queue(2);
    chain.sendRawError = new Error("request timed out");
    await sendPendingBatch();
    expect(rows.every(row => row.txHash?.startsWith("sent:5:"))).toBe(true);

    // The transaction that timed out was mined after all
    chain.sendRawError = null;
    chain.receipt = { status: "success" };
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it("keeps the rows while the persisted batch hash is in the mempool", async () => {
    queue(2);
    chain.sendRawError = new Error("request timed out");
    await sendPendingBatch();
    chain.sendRawError = null;
    chain.transactionFound = true;
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });

  it("releases the rows when another faucet tx took the dropped batch nonce", async () => {
    queue(2);
    chain.sendRawError = new Error("request timed out");
    await sendPendingBatch();
    expect(rows.every(row => row.txHash?.startsWith("sent:5:"))).toBe(true);

    // Our signed tx was dropped and an instant send used nonce 5 instead.
    chain.sendRawError = null;
    chain.minedCount = 6;
    chain.pendingCount = 6;
    // The rebuild fails before broadcast so the released rows stay visible
    chain.prepareError = new Error("rpc unavailable");
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.txHash === null && row.claimedAt === null)).toBe(true);
  });

  it("releases and sends again when the signed batch was dropped", async () => {
    queue(2);
    chain.sendRawError = new Error("request timed out");
    await sendPendingBatch();
    chain.sendRawError = null;
    ageClaims();
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(1);
    expect(chain.sends[0].nonce).toBe(5);
    expect(rows).toHaveLength(0);
  });

  it("returns the rows to the queue at once when an instant send took the nonce", async () => {
    queue(2);
    chain.sendRawError = new Error("nonce too low");
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
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

  it("sends nothing while the faucet is disabled", async () => {
    queue(2);
    db.siteSettings.findUnique.mockResolvedValue({ setting_value: "false" });
    await sendPendingBatch();
    expect(chain.sends).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.txHash === null)).toBe(true);
  });
});

describe("claimDailyAirdrop", () => {
  it("keeps the cooldown when the instant send times out", async () => {
    chain.instantError = new Error("request timed out");
    await expect(caller.claimDailyAirdrop(claimInput)).rejects.toThrow(/may still arrive/);
    expect(db.userWallet.update).not.toHaveBeenCalled();
  });

  it("restores the cooldown when the node rejects the send before broadcast", async () => {
    chain.instantError = new Error("insufficient funds for gas * price + value");
    await expect(caller.claimDailyAirdrop(claimInput)).rejects.toThrow(
      /Failed to claim daily airdrop/
    );
    expect(db.userWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ last_airdrop_request: null }),
      })
    );
  });

  it("refuses to queue a claim on a chain the batch does not pay on", async () => {
    chain.userBalance = 1000n;
    await expect(
      processDailyAirdropClaim(7, USER_ADDRESS as `0x${string}`, 1)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.airdropQueueEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("wallet.requestAirdrop", () => {
  it("claims the cooldown with a conditional update before sending", async () => {
    const { walletRouter } = await vi.importActual<typeof import("../trpc/wallet")>(
      "../trpc/wallet"
    );
    const walletCaller = walletRouter.createCaller({ user: { sub: 7 } } as never);

    const result = await walletCaller.requestAirdrop({
      publicKey: "public-key",
      chainId: 1,
      address: USER_ADDRESS,
    });

    expect(result.success).toBe(true);
    expect(db.userWallet.updateMany).toHaveBeenCalledWith({
      where: { id: 7, last_airdrop_request: null },
      data: expect.objectContaining({ last_airdrop_request: expect.any(Date) }),
    });
  });
});
