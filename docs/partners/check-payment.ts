/**
 * Independent proof of payment from the chain (partner spec section 10). No Amped.Bio server is
 * trusted: the script reads AmpedPay's Paid and Share events by payment_ref from your own RPC.
 * Run: RPC_URL=https://sepolia.base.org AMPEDPAY=0x... PAYMENT_REF=0x... PAYOUT=0x... npx tsx check-payment.ts
 */
import { createPublicClient, http, isAddressEqual, parseAbiItem, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });
const contract = process.env.AMPEDPAY as Address;
const paymentRef = process.env.PAYMENT_REF as Hex;
const payout = process.env.PAYOUT as Address;

const paid = parseAbiItem(
  "event Paid(bytes32 indexed paymentRef, address indexed payer, address indexed creator, uint256 amount, bytes32 splitHash)"
);
const share = parseAbiItem("event Share(bytes32 indexed paymentRef, address indexed to, uint8 role, uint256 amount)");

const head = await client.getBlockNumber();
const fromBlock = head > 200_000n ? head - 200_000n : 0n;
const [paidLogs, shareLogs] = await Promise.all([
  client.getLogs({ address: contract, event: paid, args: { paymentRef }, fromBlock }),
  client.getLogs({ address: contract, event: share, args: { paymentRef }, fromBlock }),
]);
const p = paidLogs[0];
if (!p) throw new Error("No Paid event for this payment_ref");
const confirmations = head - p.blockNumber + 1n;
// Role 4 is the merchant row (AmpedPay M11)
const merchantShare = shareLogs.find(l => l.args.role === 4 && isAddressEqual(l.args.to!, payout));
console.log({
  payer: p.args.payer,
  amount: p.args.amount?.toString(),
  merchantShare: merchantShare?.args.amount?.toString() ?? "missing",
  confirmations: confirmations.toString(),
  state: confirmations >= 12n ? "finalized" : "paid",
});
