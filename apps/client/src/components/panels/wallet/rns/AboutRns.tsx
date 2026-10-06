import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TESTNET_NOTICE, cn } from "@repo/ui";
import { Eyebrow } from "../../explore/pool-panel/sections";

// Screen Review 101 I14: four disclosures, one open at a time, the first open
// by default. Answers verbatim.
const QUESTIONS = [
  {
    q: "What is Revolution Name Service (RNS)?",
    a: "RNS gives your wallet a readable name, like mayalin.revo. It works like ENS on Ethereum. People can send to the name instead of a long address, and your Amped.Bio page can show it with a Verified badge.",
  },
  {
    q: "How long does an RNS name last?",
    a: "You register an RNS name for a term you choose. Extend it before it expires to keep it. A grace period follows expiry. When the grace period ends, anyone can register the name. Amped.Bio does not send expiry reminders.",
  },
  {
    q: "What does an RNS name cost?",
    a: `The price depends on the name and the term. You see the price and the estimated network fee before you confirm. ${TESTNET_NOTICE}`,
  },
  {
    q: "What does Verified mean?",
    a: "Authbase, an identity service, checked the ID of the person who owns the name. Verified means the identity check passed. It is not an endorsement.",
  },
];

export function AboutRns() {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();
  return (
    <section aria-labelledby={`${baseId}-title`} className="space-y-1 font-prism">
      <div id={`${baseId}-title`} className="pb-2">
        <Eyebrow>About Revolution Name Service</Eyebrow>
      </div>
      <ul className="divide-y divide-prism-line border-t border-prism-line">
        {QUESTIONS.map((item, index) => {
          const expanded = open === index;
          const panelId = `${baseId}-a${index}`;
          return (
            <li key={item.q}>
              <h4>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : index)}
                  className="prism-focus flex min-h-commit w-full items-center justify-between gap-3 rounded-prism-8 px-3 text-left text-prism-label font-semibold text-prism-ink"
                >
                  {item.q}
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "h-[21px] w-[21px] shrink-0 text-prism-ink-3 transition-transform duration-prism-control motion-reduce:transition-none",
                      expanded && "rotate-180"
                    )}
                  />
                </button>
              </h4>
              {expanded && (
                <div id={panelId} className="prism-glass-clear !rounded-prism-13 mb-3 p-[21px]">
                  <p className="text-prism-body text-prism-ink">{item.a}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
