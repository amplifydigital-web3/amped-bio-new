import { ProfileBasics } from "../profile/ProfileSections";
import { BlocksPanel } from "../blocks/BlocksPanel";
import { RevoNameIssueDialog } from "./RevoNameIssueDialog";

/**
 * Page destination (D01, D03). PR 3 composes the existing profile fields and
 * blocks here so the rail matches the approved structure; PR 3b replaces the
 * insides with the profile header card and inline block editing (rows 017 to
 * 020, 022, 034 to 037).
 */
export function PagePanel() {
  return (
    <div className="flex flex-col">
      <section aria-label="Profile" className="p-6 space-y-8">
        <ProfileBasics />
      </section>
      <BlocksPanel />
      <RevoNameIssueDialog />
    </div>
  );
}
