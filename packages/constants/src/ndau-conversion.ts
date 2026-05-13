// NDAU to REVO conversion constants
export const NDAU_TO_REVO_RATE = "6.872"; // 1 NDAU = 6.872 REVO

// NDAU Conversion types
export interface NdauConversionData {
  ndauAddress: string;
  ndauAmount: string;
  revoAmount: string;
  revoAddress: string;
  txid?: string;
  status: "pending" | "processed" | "failed";
  createdAt: Date;
  updatedAt?: Date;
}

export interface NdauConversionCreateInput {
  ndauAddress: string;
  ndauAmount: string;
  revoAddress: string;
}

export interface NdauConversionResponse {
  id: number;
  ndauAddress: string;
  ndauAmount: string;
  revoAmount: string;
  revoAddress: string;
  txid?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
}

/**
 * Calculate REVO amount from NDAU amount
 * @param ndauAmount - The amount of NDAU to convert
 * @returns The equivalent REVO amount
 */
export function calculateRevoAmount(ndauAmount: string): string {
  const ndau = parseFloat(ndauAmount);
  if (isNaN(ndau) || ndau <= 0) {
    return "0";
  }
  const revo = ndau * parseFloat(NDAU_TO_REVO_RATE);
  return revo.toFixed(3);
}
