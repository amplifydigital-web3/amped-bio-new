import { ProfileHeaderCard } from "./header/ProfileHeaderCard";
import { BlocksSection } from "./blocks/BlocksSection";
import { RnsSection } from "./rns/RnsSection";

const showRns = import.meta.env.VITE_SHOW_RNS === "true";

/**
 * Page destination (D01, D03, D18). The profile header card, the RNS section
 * (108, when RNS is on), then the blocks
 * in the order visitors see them, edited inline beside the live preview.
 * Screen Review 006, 017, 018, 022, 034 to 037.
 */
export function PagePanel() {
  return (
    <div className="flex flex-col gap-[34px]">
      <div className="flex flex-col gap-[13px]">
        <ProfileHeaderCard />
        {showRns && <RnsSection />}
      </div>
      <BlocksSection />
    </div>
  );
}
