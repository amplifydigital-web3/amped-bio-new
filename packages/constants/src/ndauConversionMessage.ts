import { NDAU_TO_REVO_RATE } from "./ndau-conversion";
import yaml from "yaml";

export interface ConversionMessageParams {
  ndauAddress: string;
  revoAddress: string;
  ndauAmount: string;
  revoAmount: string;
  documentHash: string;
  timestamp: number;
  ndauValidationKey?: string;
}

export interface NdauConversionPayload {
  vote: string;
  proposal: {
    proposal_id: string;
    proposal_heading: string;
    voting_option_id: number;
    voting_option_heading: string;
  };
  wallet_address: string;
  validation_key: string;
  timestamp: number;
}

export function createConversionMessage(params: ConversionMessageParams): string {
  const { ndauAmount, revoAmount, ndauAddress, revoAddress, documentHash, timestamp } = params;
  return `I agree to convert ${ndauAmount} NDAU to ${revoAmount} REVO (rate: 1 NDAU = ${NDAU_TO_REVO_RATE} REVO) from ${ndauAddress} to ${revoAddress}. Document hash: ${documentHash}. Timestamp: ${timestamp}`;
}

export function createNdauConversionPayload(
  params: ConversionMessageParams
): NdauConversionPayload {
  const message = createConversionMessage(params);
  return {
    vote: "yes",
    proposal: {
      proposal_id: "ndau-to-revo-conversion",
      proposal_heading: message,
      voting_option_id: 1,
      voting_option_heading: "Confirm Conversion",
    },
    wallet_address: params.ndauAddress,
    validation_key: params.ndauValidationKey || params.ndauAddress,
    timestamp: params.timestamp,
  };
}

export function createNdauConversionPayloadYaml(params: ConversionMessageParams): string {
  const payload = createNdauConversionPayload(params);
  return yaml.stringify(payload);
}

export function createWalletBallotYaml(params: ConversionMessageParams): string {
  const message = createConversionMessage(params);
  const ballot = {
    vote: "yes",
    proposal: {
      proposal_id: "ndau-to-revo-conversion",
      proposal_heading: message,
      voting_option_id: 1,
      voting_option_heading: "Confirm Conversion",
    },
    wallet_address: params.ndauAddress,
    validation_key: params.ndauValidationKey,
  };
  return yaml.stringify(ballot);
}
