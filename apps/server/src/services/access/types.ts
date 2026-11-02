import type { AccessResourceType } from "@repo/constants";

/** Always built on the server from the session (ctx.user), never from client input. */
export type Viewer = {
  userId: number | null;
  wallet: string | null;
  /** For signed out viewers: the request, to derive the daily salted visitor key */
  request?: { ip: string; userAgent: string };
};

/** What a resolver says about one resource. */
export type Gate = {
  ownerUserId: number;
  ruleId: Buffer | null;
  adult: boolean;
  /** False when the resource is missing from public view (draft, deleted, wrong type) */
  available: boolean;
};

export type Resolver = { get(id: string): Promise<Gate | null> };

export type ResolverRegistry = Map<AccessResourceType, Resolver>;
