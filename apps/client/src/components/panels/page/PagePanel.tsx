import { ProfileHeaderCard } from "./header/ProfileHeaderCard";
import { BlocksSection } from "./blocks/BlocksSection";

/**
 * Page destination (D01, D03, D18). The profile header card, then the blocks
 * in the order visitors see them, edited inline beside the live preview.
 * Screen Review 006, 017, 018, 022, 034 to 037.
 */
export function PagePanel() {
  return (
    <div className="flex flex-col gap-[34px]">
      <ProfileHeaderCard />
      <BlocksSection />
    </div>
  );
}
