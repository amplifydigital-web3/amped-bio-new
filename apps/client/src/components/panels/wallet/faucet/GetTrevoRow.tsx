import { ArrowRight, Droplet } from "lucide-react";
import { useEditor } from "@/contexts/EditorContext";
import { useFaucet } from "./useFaucet";
import { HOME_FAUCET_PATH, faucetRowMeta } from "./fundRow";

/**
 * The Wallet keeps one row where Get tREVO used to sit. The Daily faucet and
 * Invite creators cards now live on Home; the row links there and shows the
 * faucet status so a ready faucet is not missed.
 */
export default function GetTrevoRow() {
  const faucet = useFaucet();
  const { setActivePanelAndNavigate } = useEditor();
  const meta = faucetRowMeta(faucet.state, faucet.doneCount, faucet.nextAvailable);
  return (
    <a
      href={HOME_FAUCET_PATH}
      onClick={event => {
        event.preventDefault();
        setActivePanelAndNavigate("home", undefined, { open: "faucet" });
      }}
      className="prism-glass-clear prism-focus flex min-h-commit items-center gap-[13px] !rounded-prism-21 px-[21px] py-[13px] font-prism"
    >
      <span
        aria-hidden
        className="flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-[rgba(39,170,225,0.14)] text-prism-create-ink"
      >
        <Droplet className="h-[21px] w-[21px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-prism-label font-bold text-prism-ink">Get tREVO</span>
        <span className="block text-prism-meta text-prism-ink-2">
          Daily faucet and invites are on Home.{meta ? ` Faucet: ${meta}.` : ""}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-prism-label font-semibold text-prism-nav max-sm:sr-only">
        Go to Home
      </span>
      <ArrowRight aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-nav" />
    </a>
  );
}
