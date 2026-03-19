export type TabType = "tokens" | "nfts" | "transactions" | "transfers";

export interface NFT {
  id: string;
  name: string;
  collection: string;
  image: string;
  floorPrice: number;
  tokenId?: string;
  description?: string;
}

export interface Transaction {
  hash: string;
  to: string;
  from: string;
  data: string;
  value: string;
  isL1Originated: boolean;
  fee: string;
  nonce: number;
  gasLimit: string;
  gasPrice: string;
  gasPerPubdata: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  blockNumber: number;
  l1BatchNumber: number;
  blockHash: string;
  type: number;
  transactionIndex: number;
  receivedAt: string;
  error: string | null;
  revertReason: string | null;
  status: "included" | "pending" | "failed";
  commitTxHash: string | null;
  executeTxHash: string | null;
  proveTxHash: string | null;
  isL1BatchSealed: boolean;
  gasUsed: string;
  contractAddress: string | null;
}

export interface TransactionsMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface TransactionsLinks {
  first: string;
  previous: string;
  next: string;
  last: string;
}

export interface TransactionsResponse {
  items: Transaction[];
  meta: TransactionsMeta;
  links: TransactionsLinks;
}

export interface ProfileTabsProps {
  isEmpty?: boolean;
  loading?: boolean;
  onNavigateToExplore?: (tab?: "creators" | "pools" | "nfts") => void;
}

export interface TransferToken {
  name: string;
  symbol: string;
  decimals: number;
  l1Address: string;
  l2Address: string;
  liquidity: number;
  iconURL: string;
}

export interface Transfer {
  from: string;
  to: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: string;
  amount: string;
  token: TransferToken;
  tokenAddress: string;
  type: string;
  tokenType: string;
  fields: string | null;
  isInternal: boolean;
}

export interface TransfersMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface TransfersLinks {
  first: string;
  previous: string;
  next: string;
  last: string;
}

export interface TransfersResponse {
  items: Transfer[];
  meta: TransfersMeta;
  links: TransfersLinks;
}
