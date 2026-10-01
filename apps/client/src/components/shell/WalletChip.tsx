import { Copy, ExternalLink, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import { toast } from "@/components/ui/toast";
import { useShellNavigation } from "./ShellNavigation";

// Screen Review 002 I07, section 7. Wallet chip on money destinations: G1
// navigate 55 high, inner wallet lens 43, network dot 8 with the indigo ring,
// wallet icon in value ink, address as 6 plus 4 in tabular figures. Shows an
// address only, never a balance. Opens Copy address, Open in explorer, Go to Wallet.
export function WalletChip() {
  const { address } = useWalletContext();
  const { chain } = useAccount();
  const { go } = useShellNavigation();
  if (!address) return null;

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const explorer = chain?.blockExplorers?.default.url;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.add({ type: "success", title: "Address copied" });
    } catch {
      toast.add({ type: "error", title: "Could not copy the address" });
    }
  };

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Wallet ${short}`}
        className="prism-glass-nav prism-focus hidden h-commit shrink-0 items-center rounded-full p-1.5 lg:inline-flex"
      >
        <span className="flex h-[43px] items-center gap-2 rounded-full bg-gradient-to-b from-white to-white/70 px-3 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.08)]">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-prism-create-light shadow-[0_0_0_1.5px_#5650A2]"
          />
          <Wallet
            aria-hidden
            className="h-[21px] w-[21px] text-prism-value-ink"
            strokeWidth={1.5}
          />
          <span className="text-prism-meta font-semibold tabular-nums text-prism-ink">{short}</span>
        </span>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={() => void copy()}>
          <Copy aria-hidden />
          Copy address
        </MenuItem>
        {explorer && (
          <MenuItem asChild>
            <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              <span className="flex-1">Open in explorer</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </MenuItem>
        )}
        <MenuItem onSelect={() => go("wallet")}>
          <Wallet aria-hidden />
          Go to Wallet
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
