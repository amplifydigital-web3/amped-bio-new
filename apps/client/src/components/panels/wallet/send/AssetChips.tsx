import { useSearchParams } from "react-router";
import { ChipGroup } from "@repo/ui";
import { USDC_SYMBOL } from "@repo/web3";
import { USDC_FLAGS } from "@/config/usdc/flags";

type Asset = "usdc" | "native";

/**
 * Spec 3.6, board w3: Send step 1 gains an asset chip row. USDC opens the USDC
 * send at ?send=usdc; the native token keeps the tREVO send at ?send=1. The
 * recipient in ?to= carries over. Renders nothing while the flag is off.
 */
export function AssetChips({ current, nativeSymbol }: { current: Asset; nativeSymbol: string }) {
  const [, setParams] = useSearchParams();
  if (!USDC_FLAGS.wallet) return null;
  return (
    <ChipGroup
      label="Asset"
      value={current}
      onChange={next =>
        setParams(
          params => {
            const updated = new URLSearchParams(params);
            updated.set("send", next === "usdc" ? "usdc" : "1");
            return updated;
          },
          { replace: true }
        )
      }
      options={[
        { value: "usdc", label: USDC_SYMBOL },
        { value: "native", label: nativeSymbol },
      ]}
    />
  );
}
