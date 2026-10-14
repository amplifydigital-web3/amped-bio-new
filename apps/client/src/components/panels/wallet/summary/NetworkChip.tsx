import { useState } from "react";
import { useChainId, useChains, useSwitchChain } from "wagmi";
import { AlertCircle, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger, cn } from "@repo/ui";

// One line under each network name in the menu (049 network menu board)
const NETWORK_DESCRIPTIONS: Record<number, string> = {
  73863: "Amped.Bio testnet",
  73861: "Developer network",
};

const CHIP =
  "prism-chip prism-focus inline-flex h-touch max-w-full items-center gap-2 rounded-full px-4 font-prism text-prism-meta font-semibold text-prism-ink-2";

function NetworkDot() {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full bg-white shadow-[0_0_0_1.5px_#5650A2]"
    />
  );
}

/**
 * Screen Review 049 I05, I06. The network chip shows the chain the wallet is
 * connected to (useChainId) and switches it with switchChain. The label
 * changes only after the wallet confirms; until then the chip reads Switching.
 * A failed switch says so under the chip. With one enabled chain the chip is a
 * static label with no menu.
 */
export function NetworkChip() {
  const chainId = useChainId();
  const chains = useChains();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [failedOn, setFailedOn] = useState<string | null>(null);

  const current = chains.find(chain => chain.id === chainId);
  const name = current?.name ?? "Unknown network";

  if (chains.length < 2) {
    return (
      <span className={CHIP} aria-label={`Network: ${name}`}>
        <NetworkDot />
        <span className="truncate">{name}</span>
      </span>
    );
  }

  const choose = async (id: number) => {
    if (id === chainId) return;
    setFailedOn(null);
    try {
      await switchChainAsync({ chainId: id });
    } catch {
      setFailedOn(name);
    }
  };

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <Menu>
        <MenuTrigger
          disabled={isPending}
          aria-busy={isPending || undefined}
          aria-label={isPending ? "Network: switching" : `Network: ${name}`}
          className={cn(CHIP, "data-[state=open]:prism-lens-thumb")}
        >
          {isPending ? (
            <LoaderCircle
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <NetworkDot />
          )}
          <span className="truncate">{isPending ? "Switching" : name}</span>
          <ChevronDown aria-hidden className="h-[21px] w-[21px] shrink-0" strokeWidth={1.5} />
        </MenuTrigger>
        <MenuContent align="end" aria-label="Choose a network" className="min-w-[252px]">
          {chains.map(chain => {
            const selected = chain.id === chainId;
            return (
              <MenuItem
                key={chain.id}
                onSelect={() => void choose(chain.id)}
                aria-current={selected || undefined}
                className="py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-prism-label font-semibold text-prism-ink">
                    {chain.name}
                  </span>
                  {NETWORK_DESCRIPTIONS[chain.id] && (
                    <span className="block text-prism-meta text-prism-ink-2">
                      {NETWORK_DESCRIPTIONS[chain.id]}
                    </span>
                  )}
                </span>
                {selected && <Check aria-hidden className="!text-prism-ink" />}
                {selected && <span className="sr-only">, current network</span>}
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>
      {failedOn && (
        <p
          role="alert"
          className="flex max-w-[288px] items-start gap-2 text-prism-meta text-prism-danger"
        >
          <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
          <span className="pt-0.5">
            Network did not switch. Your wallet is still on {failedOn}.
          </span>
        </p>
      )}
    </div>
  );
}
