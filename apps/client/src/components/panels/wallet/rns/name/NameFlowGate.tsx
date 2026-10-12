import { Wallet } from "lucide-react";
import { Button, Notice } from "@repo/ui";
import { formatRnsName } from "@repo/web3";
import { useWalletContext } from "@/contexts/WalletContext";
import { TestnetLine } from "../../../explore/pool-panel/sections";
import { WrongNetworkNotice } from "../FindRnsName";
import { useRnsNetwork } from "../hooks";
import { shortAddress } from "../format";
import type { RnsNameState } from "./useRnsName";

/**
 * 080 I06, 111 I13, 102 I22: the name page renders without a wallet; each
 * flow checks the connection, the network and, when the owner must sign, the
 * owner. Returns null when the flow can go on, else the body and footer.
 */
export function useNameFlowGate(
  name: RnsNameState,
  chainId: number,
  { ownerOnly, verb }: { ownerOnly: boolean; verb: string }
) {
  const network = useRnsNetwork();
  const wallet = useWalletContext();
  const fullName = formatRnsName(name.label, chainId);
  const signer = network.address?.toLowerCase();
  const isOwnerSigner = !!signer && !!name.owner && signer === name.owner.toLowerCase();

  if (!network.isConnected) {
    return {
      body: <Notice variant="info">{`Connect your wallet to ${verb} ${fullName}.`}</Notice>,
      footer: (
        <>
          <TestnetLine />
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void wallet.connect()}
            disabled={wallet.connecting}
          >
            <Wallet aria-hidden />
            Connect wallet
          </Button>
        </>
      ),
    };
  }
  if (network.wrongNetwork) {
    return {
      body: (
        <WrongNetworkNotice onSwitch={network.switchToLibertas} switching={network.switching} />
      ),
      footer: <TestnetLine />,
    };
  }
  if (ownerOnly && !isOwnerSigner) {
    return {
      body: (
        <Notice variant="info">
          {`Connect the wallet that owns ${fullName}${
            name.owner ? ` (${shortAddress(name.owner)})` : ""
          } to ${verb} it.`}
        </Notice>
      ),
      footer: <TestnetLine />,
    };
  }
  return null;
}
