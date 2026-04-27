import { gql } from "graphql-request";
import { GraphQLClient } from "graphql-request";
import { Address } from "viem";
import { GetAllNamesResult, SubgraphResult } from "@/types/subgraph";
import { NameDetail, RevoName } from "@/types/rns/name";
import { RegistrationData } from "@/types/rns/registration";
import { z } from "zod";

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

export const queryGetAllRegisteredNamesOfOwnerWithoutExpiredName = gql`
  query getAllNames($owner: String!, $currentTimestamp: BigInt!) {
    revoNames(
      orderBy: expiryDateWithGrace
      orderDirection: desc
      where: { owner: $owner, name_not: null, expiryDateWithGrace_gt: $currentTimestamp }
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

export async function fetchAllRegisteredNamesOfOwner(
  owner: Address,
  graphClient?: GraphQLClient | null,
  unexpiredOnly: boolean = false
): Promise<SubgraphResult<RevoName[]>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    if (unexpiredOnly) {
      const currentTimestamp = Math.floor(Date.now() / 1000).toString();
      const data = await graphClient.request<GetAllNamesResult>(
        queryGetAllRegisteredNamesOfOwnerWithoutExpiredName,
        {
          owner,
          currentTimestamp,
        }
      );
      return { data: data.revoNames, error: null };
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

export async function fetchRegistrationData(
  labelHash: string,
  graphClient?: GraphQLClient | null
): Promise<SubgraphResult<RegistrationData>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    const variables = { labelHash };
    const data = await graphClient.request<RegistrationData>(
      queryRegistrationDetailForName,
      variables
    );

    return { data: data, error: null };
  } catch (err) {
    console.error("Error Fetching details", err);
    return { data: null, error: "Failed to get Registration Data" };
  }
}

// Fetch only ownership details - optimized for transfer refresh
export async function fetchOwnershipDetails(
  labelHash: string,
  graphClient?: GraphQLClient | null
): Promise<SubgraphResult<OwnershipDetailsResult>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    const variables = { labelHash };
    const data = await graphClient.request(queryOwnershipDetails, variables);

    return { data: data, error: null };
  } catch (err) {
    console.error("Error Fetching ownership details", err);
    return { data: null, error: "Failed to get Ownership Data" };
  }
}

// Fetch only dates details - optimized for renewal refresh
export async function fetchDateDetails(
  labelHash: string,
  graphClient?: GraphQLClient | null
): Promise<SubgraphResult<DateDetailsResult>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    const variables = { labelHash };
    const data = await graphClient.request(queryDateDetails, variables);

    return { data: data, error: null };
  } catch (err) {
    console.error("Error Fetching date details", err);
    return { data: null, error: "Failed to get Date Data" };
  }
}

export async function fetchGetNameDetails(
  labelName: string,
  graphClient?: GraphQLClient | null
): Promise<SubgraphResult<NameDetail[]>> {
  try {
    if (!graphClient) {
      return { data: null, error: "Subgraph client not available for current network" };
    }

    const data = await graphClient.request<{ revoNames: NameDetail[] }>(queryGetNameDetails, {
      labelName,
    });
    return { data: data.revoNames, error: null };
  } catch (err) {
    console.error("Error Fetching details", err);
    return { data: null, error: "Failed to Fetch Name Details" };
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
