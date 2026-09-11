import { gql } from "graphql-request";
import { GraphQLClient } from "graphql-request";
import { Address } from "viem";
import { GetAllNamesResult, SubgraphResult } from "@/types/subgraph";
import { NameDetail, RevoName } from "@/types/rns/name";
import { RegistrationData } from "@/types/rns/registration";
import { z } from "zod";
import {
  ChainConfig,
  onchainDateDetails,
  onchainNameDetails,
  onchainOwnershipDetails,
  onchainRegistrationData,
} from "./onchainFallback";

const NO_SUBGRAPH_ERROR = "Subgraph client not available for current network";

const OwnershipDetailsSchema = z.object({
  revoNames: z.array(
    z.object({
      owner: z.string(),
      resolver: z.object({ address: z.string() }).nullable(),
    })
  ),
});

const DateDetailsSchema = z.object({
  revoNames: z.array(
    z.object({
      expiryDateWithGrace: z.string(),
    })
  ),
  registration: z
    .object({
      registrationDate: z.string(),
      expiryDate: z.string(),
    })
    .nullable(),
});

export type OwnershipDetailsResult = z.infer<typeof OwnershipDetailsSchema>;
export type DateDetailsResult = z.infer<typeof DateDetailsSchema>;

export const queryGetAllRegisteredNamesOfOwner = gql`
  query getAllNames($owner: String!) {
    revoNames(
      orderBy: expiryDateWithGrace
      orderDirection: desc
      where: { owner: $owner, name_not: null }
    ) {
      name
      labelName
      expiryDateWithGrace
    }
  }
`;

export const queryGetActiveRegisteredNamesOfOwner = gql`
  query getActiveNames($owner: String!, $now: BigInt!) {
    revoNames(
      orderBy: expiryDateWithGrace
      orderDirection: desc
      where: { owner: $owner, name_not: null, expiryDateWithGrace_gt: $now }
    ) {
      name
      labelName
      expiryDateWithGrace
    }
  }
`;

export const queryRegistrationDetailForName = gql`
  query getRegistrationData($labelHash: String!) {
    revoNames(where: { labelHash: $labelHash }) {
      name
      owner
      expiryDateWithGrace
      resolver {
        texts
        address
      }
    }
    registration(id: $labelHash) {
      registrationDate
      expiryDate
    }
    nameRegistereds(
      where: { registration: $labelHash }
      orderBy: blockNumber
      orderDirection: desc
      first: 1
    ) {
      transactionID
    }
  }
`;

// Optimized query: fetch only ownership details (after transfer)
export const queryOwnershipDetails = gql`
  query getOwnershipDetails($labelHash: String!) {
    revoNames(where: { labelHash: $labelHash }) {
      owner
      resolver {
        address
      }
    }
  }
`;

// Optimized query: fetch only dates details (after renewal)
export const queryDateDetails = gql`
  query getDateDetails($labelHash: String!) {
    revoNames(where: { labelHash: $labelHash }) {
      expiryDateWithGrace
    }
    registration(id: $labelHash) {
      registrationDate
      expiryDate
    }
  }
`;

export const queryGetNameDetails = gql`
  query getNameDetails($labelName: String!) {
    revoNames(where: { labelName: $labelName }) {
      name
      labelHash
      expiryDateWithGrace
      owner
      resolver {
        address
      }
      registration {
        registrationDate
        expiryDate
      }
    }
  }
`;

export const queryGetRecords = gql`
  query getRecords($labelName: String!) {
    revoNames(where: { labelName: $labelName }) {
      labelHash
      resolver {
        address
      }
    }
  }
`;

// A synced subgraph that responds with no record for a name is indistinguishable
// from one that is simply lagging behind chain head (e.g. a name registered in a
// block it hasn't indexed yet). When the subgraph reports "empty", confirm on-chain
// and prefer that data if the token actually exists.
async function reconcileEmpty<T>(
  result: SubgraphResult<T>,
  isEmpty: boolean,
  fallback: () => Promise<SubgraphResult<T>>
): Promise<SubgraphResult<T>> {
  if (!isEmpty) return result;
  const fb = await fallback();
  return fb.data ? fb : result;
}

export async function fetchAllRegisteredNamesOfOwner(
  owner: Address,
  graphClient?: GraphQLClient | null
): Promise<SubgraphResult<RevoName[]>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    const variables = { owner };
    const data = await graphClient.request<GetAllNamesResult>(
      queryGetAllRegisteredNamesOfOwner,
      variables
    );

    return { data: data.revoNames, error: null };
  } catch (err) {
    console.error("Error Fetching names", err);
    return { data: null, error: "Failed to Fetch Names" };
  }
}

export async function fetchActiveRegisteredNamesOfOwner(
  owner: Address,
  graphClient?: GraphQLClient | null
): Promise<SubgraphResult<RevoName[]>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }
    const now = Math.floor(Date.now() / 1000).toString();
    const variables = { owner, now };
    const data = await graphClient.request<GetAllNamesResult>(
      queryGetActiveRegisteredNamesOfOwner,
      variables
    );

    return { data: data.revoNames, error: null };
  } catch (err) {
    console.error("Error Fetching active names", err);
    return { data: null, error: "Failed to Fetch Names" };
  }
}

export async function fetchRegistrationData(
  labelHash: string,
  graphClient?: GraphQLClient | null,
  chainConfig?: ChainConfig | null
): Promise<SubgraphResult<RegistrationData>> {
  const fallback = (): Promise<SubgraphResult<RegistrationData>> =>
    chainConfig
      ? onchainRegistrationData(chainConfig, labelHash)
      : Promise.resolve({ data: null, error: NO_SUBGRAPH_ERROR });

  try {
    if (!graphClient) return fallback();

    const variables = { labelHash };
    const data = await graphClient.request<RegistrationData>(
      queryRegistrationDetailForName,
      variables
    );

    return reconcileEmpty({ data, error: null }, !data.revoNames?.length, fallback);
  } catch (err) {
    console.warn("Subgraph registration fetch failed, falling back to on-chain read", err);
    return fallback();
  }
}

// Fetch only ownership details - optimized for transfer refresh
export async function fetchOwnershipDetails(
  labelHash: string,
  graphClient?: GraphQLClient | null,
  chainConfig?: ChainConfig | null
): Promise<SubgraphResult<OwnershipDetailsResult>> {
  const fallback = (): Promise<SubgraphResult<OwnershipDetailsResult>> =>
    chainConfig
      ? onchainOwnershipDetails(chainConfig, labelHash)
      : Promise.resolve({ data: null, error: NO_SUBGRAPH_ERROR });

  try {
    if (!graphClient) return fallback();

    const variables = { labelHash };
    const data = await graphClient.request<OwnershipDetailsResult>(queryOwnershipDetails, variables);

    return reconcileEmpty({ data, error: null }, !data.revoNames?.length, fallback);
  } catch (err) {
    console.warn("Subgraph ownership fetch failed, falling back to on-chain read", err);
    return fallback();
  }
}

// Fetch only dates details - optimized for renewal refresh
export async function fetchDateDetails(
  labelHash: string,
  graphClient?: GraphQLClient | null,
  chainConfig?: ChainConfig | null
): Promise<SubgraphResult<DateDetailsResult>> {
  const fallback = (): Promise<SubgraphResult<DateDetailsResult>> =>
    chainConfig
      ? onchainDateDetails(chainConfig, labelHash)
      : Promise.resolve({ data: null, error: NO_SUBGRAPH_ERROR });

  try {
    if (!graphClient) return fallback();

    const variables = { labelHash };
    const data = await graphClient.request<DateDetailsResult>(queryDateDetails, variables);

    return reconcileEmpty({ data, error: null }, !data.revoNames?.length, fallback);
  } catch (err) {
    console.warn("Subgraph date fetch failed, falling back to on-chain read", err);
    return fallback();
  }
}

export async function fetchGetNameDetails(
  labelName: string,
  graphClient?: GraphQLClient | null,
  chainConfig?: ChainConfig | null
): Promise<SubgraphResult<NameDetail[]>> {
  const fallback = (): Promise<SubgraphResult<NameDetail[]>> =>
    chainConfig
      ? onchainNameDetails(chainConfig, labelName)
      : Promise.resolve({ data: null, error: NO_SUBGRAPH_ERROR });

  try {
    if (!graphClient) return fallback();

    const data = await graphClient.request<{ revoNames: NameDetail[] }>(queryGetNameDetails, {
      labelName,
    });
    return reconcileEmpty({ data: data.revoNames, error: null }, !data.revoNames?.length, fallback);
  } catch (err) {
    console.warn("Subgraph name-details fetch failed, falling back to on-chain read", err);
    return fallback();
  }
}

export async function fetchRecords(labelName: string, graphClient?: GraphQLClient | null) {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    const data = await graphClient.request(queryGetRecords, { labelName });

    return { data, error: null };
  } catch (err) {
    console.error("Error Fetching details", err);
    return { data: null, error: "Failed to fetch Resovler Details" };
  }
}
