import { AddNetworkContent } from "@/components/network/AddNetworkContent";
import { DISPLAY_TITLE_CLASS, PublicPage } from "@/components/layout/PublicPage";

// Screen Review 073 I02, I10: a one task page on the room in a 610 column. The
// visitor adds Libertas Testnet to a browser wallet; the settings stay visible
// for adding it by hand.
export default function NetworkPage() {
  return (
    <PublicPage>
      <div className="mx-auto w-full max-w-[610px] pt-[34px] sm:pt-[21px]">
        <h1 className={`uppercase sm:whitespace-nowrap ${DISPLAY_TITLE_CLASS}`}>Add the network</h1>
        <p className="mt-[21px] text-prism-body text-prism-ink-2">
          Add Libertas Testnet to your wallet to hold tREVO and use Amped.Bio.
        </p>
        <div className="mt-[34px]">
          <AddNetworkContent />
        </div>
      </div>
    </PublicPage>
  );
}
