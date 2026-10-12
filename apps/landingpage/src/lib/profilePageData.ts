import type { BlockType, PublicTrackingPixels, ThemeConfig } from "@repo/constants";
import type { RouterOutputs } from "../../../server/src/trpc";

// Inferred directly from the tRPC router so the SSR page data can never drift
// from what the API actually returns.
type HandleOutput = RouterOutputs["handle"]["getHandle"];
type HandleUser = HandleOutput["user"];

export interface UserProfile {
  id: HandleUser["id"];
  name: NonNullable<HandleUser["name"]>;
  handle: string;
  handleFormatted: string;
  bio: string;
  photoUrl?: string;
  photoCmp?: string;
  /** 109 I01: the RNS chip and the sheet fields the owner allows */
  identity?: HandleUser["identity"];
  /** 112: the month the page joined, "YYYY-MM", for the RNS ID block */
  since?: string | null;
}

// Theme from tRPC, but with the JSON column typed as the app's ThemeConfig
export interface Theme {
  id: NonNullable<HandleOutput["theme"]>["id"];
  name: NonNullable<HandleOutput["theme"]>["name"];
  config: ThemeConfig;
}

export interface ProfilePageData {
  profile: UserProfile;
  blocks: BlockType[];
  theme: Theme | null;
  hasCreatorPool: HandleOutput["hasCreatorPool"];
  /** The creator's pool, for the page's View pool (Screen Review 039 I03) */
  creatorPoolAddress: string | null;
  trackingPixels: PublicTrackingPixels | null;
  /** Whether search engines may index this profile */
  indexable: boolean;
}

export const DEFAULT_HANDLE = "landingpage";

export const DEFAULT_PROFILE_DATA: ProfilePageData = {
  profile: {
    id: 0,
    name: "Amplify Digital",
    handle: "amped.bio",
    handleFormatted: "@amped.bio",
    bio: "Empowering individuals and communities, enabling seamless transactions without intermediaries",
  },
  blocks: [
    {
      id: 1,
      order: 0,
      type: "link",
      config: { platform: "twitter", url: "https://x.com/amped_bio", label: "Follow on X" },
    },
    {
      id: 2,
      order: 1,
      type: "link",
      config: {
        platform: "github",
        url: "https://github.com/amplifydigital-web3",
        label: "Check out our Github",
      },
    },
    {
      id: 3,
      order: 2,
      type: "link",
      config: {
        platform: "telegram",
        url: "https://t.me/npayme_network",
        label: "Connect on Telegram",
      },
    },
  ],
  theme: null,
  hasCreatorPool: false,
  creatorPoolAddress: null,
  trackingPixels: null,
  indexable: false,
};

/**
 * Map the raw getHandle tRPC output to the shape consumed by ProfileView.
 * The casts are limited to the boundary where Prisma's JSON columns (theme
 * config, block config) meet the app's typed schemas.
 */
export function mapGetHandleData(result: HandleOutput, handle: string): ProfilePageData {
  const {
    user,
    theme,
    blocks: blocksRaw,
    hasCreatorPool,
    creatorPoolAddress,
    trackingPixels,
    indexable,
  } = result;
  return {
    profile: {
      id: user.id,
      name: user.name ?? "",
      handle,
      handleFormatted: `@${handle}`,
      bio: user.description ?? "",
      photoUrl: user.image ?? "",
      photoCmp: "",
      identity: user.identity ?? null,
      since: user.since ?? null,
    },
    theme: theme ? (theme as unknown as Theme) : null,
    blocks: [...blocksRaw].sort((a, b) => a.order - b.order) as unknown as BlockType[],
    hasCreatorPool,
    creatorPoolAddress: creatorPoolAddress ?? null,
    trackingPixels: trackingPixels ?? null,
    indexable,
  };
}
