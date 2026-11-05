# R5: Creators, strikes, suspend, appeals, log and settings

Spec: `docs/features/adult-content-review.md` (revision 6), sections 5.4, 8.4, 8.6, 8.7 and 13.
Branch: `feat/safety-creators-appeals`, stacked on R4 (`feat/adult-setup`, #500). No migration.

## Server (`services/safety/creators.ts`)

| Procedure | Role | What it does |
| --- | --- | --- |
| `safety.creators.get` | moderator, safety_lead | Safety profile: Over 18 and seller with valid until, 18+ status and policy version, custodian named (never the address), people and release states, strikes in 12 months, cases, suspend state |
| `safety.creators.disableAdult` | same | Amped turns 18+ off: every 18+ item becomes a draft, the creator is emailed the reason, the setup shows "18+ turned off by Amped.Bio" |
| `safety.creators.suspendRequest` | same | Logs a request. `immediate` only with an open child safety case or a confirmed upload without consent (removed `non_consent`, or a Take It Down removal), and still asks for approval (D6) |
| `safety.creators.suspendApprove` | safety_lead, not the requester | `User.block = "yes"`, `hideCreator` (every item BLOCKED at the edge), creator emailed |
| `adult.appeal` | the item's owner | One per decision, within 30 days, 10 to 1,000 characters. Child safety and escalated decisions are final (`appeal_not_allowed`) |
| `safety.appeals.decide` | safety_lead, not the first reviewer | Uphold, or Reverse: the strike is reversed and the item restored. A Take It Down Reverse emails the requester first, logs `requester_notified`, and waits 2 business days |
| `safety.appeals.restore` | safety_lead | The Take It Down restore. Refused without `requester_notified` or before the window ends |
| `safety.log.list` | moderator own actions, safety_lead all | Filter by case number, actor, action |
| `safety.log.export` | safety_lead | CSV for counsel, logged as `export` |

Settings (`safety.settings.get` and `.update`) came with R1; R5 adds the admin form.

## Admin

New tabs on Review:
- **Creators:** open by handle. Turn off 18+, Request suspend, Suspend now, Approve suspend.
- **Appeals:** Uphold, Reverse, and Restore after notice.
- **Log:** filter by case, Export CSV for a safety lead.
- **Settings:** safety lead only. Due times, wellbeing limits, thresholds, and the on call list for child safety alerts.

## Not in R5

- **Pause store and Remove custom store policy.** These need the store tables (store PR 9, memberships). They are not on this branch chain, so they wait for the store branch.
- **Age result cases.** These still live in `identity_review_cases` with the email alert (identity checks 4.5); moving them into the queue needs the identity case actions.
- **Creator item states and Inbox notices (5.4).** The email notices go today. The in-app outcome panel on the item (board ar6) is next.
- **Strike thresholds.** `strikesToSuspend` is stored, but upload suspension on strikes is not enforced yet.
- **36 hour Take It Down banner.** `safety.requests.late` gives the count; the dashboard tile is next.

## Tests

`safety-creators.test.ts` (6) covers:
- Suspend needs a second lead.
- Immediate suspend only with a D6 case.
- Appeal rules: once, 30 days, never child safety.
- A different reviewer decides the appeal; Reverse restores the item and the strike.
- Take It Down Reverse notifies the requester and waits 2 business days.
- Log visibility and export.

Server and admin typecheck clean.
