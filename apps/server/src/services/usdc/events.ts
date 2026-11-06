import { getAddress, parseEventLogs, type Hex, type Log } from "viem";
import { prisma } from "@repo/database";
import { USDC_EIP3009_ABI } from "@repo/web3";
import { uuidv7 } from "../../utils/uuid-v7";
import { paymentChain, usdcAddress } from "./chain";

/**
 * Writes PaymentEvent rows for USDC Transfer logs that touch an Amped.Bio
 * wallet (spec 3.4). Idempotent on (chainId, txHash, logIndex): the send
 * path, the status poll and the indexer can all see the same log.
 */

export type UsdcTransfer = {
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
};

export function transfersFromLogs(logs: Log[]): UsdcTransfer[] {
  const usdc = usdcAddress().toLowerCase();
  return parseEventLogs({ abi: USDC_EIP3009_ABI, eventName: "Transfer", logs })
    .filter(
      log => log.address.toLowerCase() === usdc && log.transactionHash && log.logIndex !== null
    )
    .map(log => ({
      txHash: log.transactionHash as Hex,
      logIndex: Number(log.logIndex),
      blockNumber: log.blockNumber ?? 0n,
      from: getAddress(log.args.from),
      to: getAddress(log.args.to),
      value: log.args.value,
    }));
}

/** Records transfers whose sender or recipient is a linked Amped.Bio wallet. Returns rows written. */
export async function recordUsdcTransfers(
  transfers: UsdcTransfer[],
  occurredAt: (blockNumber: bigint) => Promise<Date> | Date
): Promise<number> {
  if (transfers.length === 0) return 0;
  const addresses = [...new Set(transfers.flatMap(t => [t.from, t.to]))];
  const wallets = await prisma.userWallet.findMany({
    where: { address: { in: addresses } },
    select: { address: true, userId: true },
  });
  // Linked addresses are stored as entered, so match case insensitively
  const owner = new Map(wallets.map(w => [w.address.toLowerCase(), w.userId]));
  const sends = await prisma.usdcSend.findMany({
    where: { chainId: paymentChain.id, txHash: { in: [...new Set(transfers.map(t => t.txHash))] } },
    select: { id: true, txHash: true },
  });
  const sendByTx = new Map(sends.map(s => [s.txHash?.toLowerCase(), s.id]));
  // Buy USDC (#5): a Coinbase delivery already reported by the webhook shows as Received from Coinbase
  const purchases = await prisma.onrampSession.findMany({
    where: { chainId: paymentChain.id, txHash: { in: [...new Set(transfers.map(t => t.txHash))] } },
    select: { id: true, txHash: true, userId: true },
  });
  const purchaseByTx = new Map(purchases.map(p => [p.txHash?.toLowerCase(), p]));

  let written = 0;
  for (const transfer of transfers) {
    const payerUserId = owner.get(transfer.from.toLowerCase()) ?? null;
    const payeeUserId = owner.get(transfer.to.toLowerCase()) ?? null;
    if (payerUserId === null && payeeUserId === null) continue;
    const sendId = sendByTx.get(transfer.txHash.toLowerCase()) ?? null;
    const purchase = purchaseByTx.get(transfer.txHash.toLowerCase());
    const fromCoinbase = !sendId && purchase && purchase.userId === payeeUserId ? purchase : null;
    const refId = sendId ?? (fromCoinbase ? Buffer.from(fromCoinbase.id) : null);
    try {
      await prisma.paymentEvent.create({
        data: {
          id: uuidv7(),
          kind: "usdc_transfer",
          chainId: paymentChain.id,
          txHash: transfer.txHash,
          logIndex: transfer.logIndex,
          blockNumber: transfer.blockNumber,
          fromAddress: transfer.from,
          toAddress: transfer.to,
          payerUserId,
          payeeUserId,
          amount: transfer.value,
          refType: sendId ? "usdc_send" : fromCoinbase ? "onramp" : null,
          refId,
          occurredAt: await occurredAt(transfer.blockNumber),
        },
      });
      written += 1;
    } catch (error) {
      // Already recorded by another path
      if ((error as { code?: string } | null)?.code === "P2002") continue;
      throw error;
    }
  }
  return written;
}
