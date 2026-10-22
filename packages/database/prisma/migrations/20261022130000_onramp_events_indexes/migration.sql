-- Buy USDC through Coinbase (Build Board #5), USDC-4 follow-up: reads the
-- onramp_events indexes that were missing in 20261017120000_usdc_onramp_coinbase.
-- The webhook log grows on every Coinbase delivery, so these reads matter:
-- - the fan's purchases read the events of their sessions (sessionId IN (...))
-- - the admin log, the "last event" read and the weekly failures count all
--   filter by provider and order or bound by receivedAt
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- CreateIndex
CREATE INDEX `onramp_events_sessionId_idx` ON `onramp_events`(`sessionId`);

-- CreateIndex
CREATE INDEX `onramp_events_provider_receivedAt_idx` ON `onramp_events`(`provider`, `receivedAt`);

-- DropIndex
-- Superseded by the composite above: every read filters by provider first.
DROP INDEX `onramp_events_receivedAt_idx` ON `onramp_events`;
