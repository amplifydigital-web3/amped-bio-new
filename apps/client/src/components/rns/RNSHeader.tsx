/**
 * Screen Review 101 I01: the RNS header is gone; RNS lives in the Wallet RNS
 * tab with its own back lens. Layout still mounts this for the legacy rns
 * panel, which only redirects. Delete together with that Layout case.
 */
export function RNSHeader(props: { mobile?: boolean }) {
  void props;
  return null;
}

export default RNSHeader;
