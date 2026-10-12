import { TESTNET_NOTICE } from "@repo/ui";
import { Eyebrow } from "../kit/parts";
import { StatTiles } from "../components/dashboard/StatTiles";
import { FaucetCard } from "../components/dashboard/FaucetCard";
import { ReferralRewardsCard } from "../components/dashboard/ReferralRewardsCard";
import { AnnouncementCard } from "../components/dashboard/AnnouncementCard";
import { ContentRow } from "../components/dashboard/ContentRow";
import { NewestUsers } from "../components/dashboard/NewestUsers";

// Screen Review 087. The dashboard: Platform tiles, Operations (faucet and
// referral rewards), Announcement, Content, Newest users; 34 between rows.
// Every widget loads, fails and retries on its own (I06): there is no page
// wide spinner and no page wide Failed to load data.
export function AdminDashboard() {
  return (
    <div className="space-y-8">
      <StatTiles />
      <section aria-labelledby="dash-operations" className="space-y-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow id="dash-operations">Operations</Eyebrow>
          <p className="text-prism-meta text-prism-ink-2">{TESTNET_NOTICE}</p>
        </div>
        <div className="grid items-stretch gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          <FaucetCard />
          <ReferralRewardsCard />
        </div>
      </section>
      <AnnouncementCard />
      <ContentRow />
      <NewestUsers />
    </div>
  );
}
