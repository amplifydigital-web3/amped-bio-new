// Screen Review 074: words on the /sign popup, in one place.

/** 074 D1 (approved 29 Sep): the note under Sign message when a browser wallet confirms. */
export const SIGN_NOTE_BROWSER_WALLET =
  "You confirm in your wallet next. Signing a message does not send tokens.";

/**
 * 074 I23: the embedded Amped.Bio wallet sets no confirmation option
 * (lib/web3authContext.ts), so "You confirm in your wallet next" may be false
 * in the default mode. Until a staging recording shows a Web3Auth prompt, the
 * default mode uses the recheck wording. Rob confirms before release.
 */
export const SIGN_NOTE_EMBEDDED_WALLET =
  "Selecting Sign message signs with your Amped.Bio wallet. Signing a message does not send tokens.";

export type SignErrorKind =
  | "timeout"
  | "origin_unknown"
  | "unreadable"
  | "wallet"
  | "unregistered"
  | "check_failed";

export const SIGN_ERRORS: Record<
  SignErrorKind,
  { title: string; cause: (host: string) => string; retry: boolean }
> = {
  timeout: {
    title: "The requesting site did not respond",
    cause: () => "It did not send a message to sign within 30 seconds.",
    retry: true,
  },
  origin_unknown: {
    title: "We cannot verify which site sent this request",
    cause: () => "Nothing was signed.",
    retry: false,
  },
  unreadable: {
    title: "The requesting site sent a message this page cannot read",
    cause: () => "Nothing was signed.",
    retry: false,
  },
  wallet: {
    title: "Your wallet did not connect",
    cause: () => "Your Amped.Bio wallet did not respond.",
    retry: true,
  },
  unregistered: {
    title: "This site is not a registered Amped.Bio app",
    cause: host =>
      `${host} asked for a signature. Only registered apps can ask. Nothing was signed.`,
    retry: false,
  },
  check_failed: {
    title: "We could not check this site",
    cause: () => "Nothing was signed. Try again in a moment.",
    retry: true,
  },
};

export const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
};
