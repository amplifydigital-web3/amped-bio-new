import { useQuery } from "@tanstack/react-query";
import { ErrorCard, trpc } from "@repo/ui";
import { day, useMerchant } from "../merchant";
import { Badge, PageTitle, Panel, Table, td, th, tr } from "../parts";

// Board p6: who is on the team and every change. Owners and Finance need two factor. Amped.Bio
// support adds and removes members for now.
const ROLES: Record<string, string> = {
  owner: "Owner. Payout wallet, products, refunds, team",
  finance: "Finance. Products and refunds",
  developer: "Developer. API keys and webhooks",
  viewer: "Viewer. Reads everything",
};

export function Team() {
  const merchant = useMerchant();
  const team = useQuery(trpc.merchant.console.team.queryOptions({ merchantId: merchant.id }));
  if (team.isError)
    return <ErrorCard title="Team did not load" onRetry={() => void team.refetch()} />;
  return (
    <>
      <PageTitle>Team</PageTitle>
      <Panel title="Members">
        <ul className="space-y-2">
          {(team.data?.members ?? []).map(m => (
            <li
              key={m.userId}
              className="flex min-h-touch flex-wrap items-center justify-between gap-2"
            >
              <span>
                <span className="font-semibold">{m.name}</span>
                {m.email && (
                  <span className="block text-prism-meta text-prism-ink-2">{m.email}</span>
                )}
              </span>
              <Badge tone="ink">{ROLES[m.role] ?? m.role}</Badge>
            </li>
          ))}
        </ul>
        <p className="text-prism-meta text-prism-ink-2">
          To add or remove a member, contact Amped.Bio support.
        </p>
      </Panel>
      <Panel title="Audit log">
        <Table label="Audit log">
          <thead>
            <tr>
              <th className={th}>When</th>
              <th className={th}>Who</th>
              <th className={th}>What</th>
            </tr>
          </thead>
          <tbody>
            {(team.data?.audit ?? []).map((a, i) => (
              <tr key={i} className={tr}>
                <td className={td}>{day(a.createdAt)}</td>
                <td className={td}>{a.actorId === 0 ? "Amped.Bio" : `#${a.actorId}`}</td>
                <td className={`${td} font-mono text-prism-label`}>{a.action}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
