import { useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowDownToLine, Plus, Send } from "lucide-react";
import { Button, cn } from "@repo/ui";
import { useWalletContext } from "@/contexts/WalletContext";
import FundWalletDialog from "../dialogs/FundWalletDialog";
import ReceiveDialog from "../dialogs/ReceiveDialog";

/**
 * Screen Review 050 I03 to I07. One filled button: Send (55) opens the Send
 * flow in the value panel through ?send=1 (D05, D12); Receive and Fund are
 * secondary lens buttons. At 0 tREVO, Fund takes the primary slot and Send
 * is disabled with its reason. At 390 the first button spans the width and
 * the other two share the row below.
 */
export function WalletActions() {
  const wallet = useWalletContext();
  const [, setParams] = useSearchParams();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);

  const zero = wallet.balance?.data?.value === 0n;

  const openSend = () =>
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.set("send", "1");
        return next;
      },
      { replace: true }
    );

  const fund = (primary: boolean) => (
    <Button
      key="fund"
      type="button"
      // Activity's empty state focuses this button (Screen Review 057 I11)
      data-get-trevo
      variant={primary ? "default" : "secondary"}
      size={primary ? "lg" : "default"}
      onClick={() => setFundOpen(true)}
      className={cn(primary ? "min-w-[144px] max-sm:col-span-2" : "max-sm:w-full")}
    >
      <Plus aria-hidden />
      Fund
    </Button>
  );

  const receive = (
    <Button
      key="receive"
      type="button"
      variant="secondary"
      onClick={() => setReceiveOpen(true)}
      className="max-sm:w-full"
    >
      <ArrowDownToLine aria-hidden />
      Receive
    </Button>
  );

  const send = zero ? (
    <Button
      key="send"
      type="button"
      variant="secondary"
      aria-disabled="true"
      aria-describedby="wallet-send-reason"
      onClick={event => event.preventDefault()}
      className="max-sm:w-full"
    >
      <Send aria-hidden />
      Send
    </Button>
  ) : (
    <Button
      key="send"
      type="button"
      size="lg"
      onClick={openSend}
      className="min-w-[144px] max-sm:col-span-2"
    >
      <Send aria-hidden />
      Send
    </Button>
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {zero ? [fund(true), receive, send] : [send, receive, fund(false)]}
      </div>
      {zero && (
        <p id="wallet-send-reason" className="mt-2 text-prism-meta text-prism-ink-2">
          Add tREVO to send.
        </p>
      )}

      <FundWalletDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        openReceiveModal={() => setReceiveOpen(true)}
      />
      <ReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} />
    </div>
  );
}
