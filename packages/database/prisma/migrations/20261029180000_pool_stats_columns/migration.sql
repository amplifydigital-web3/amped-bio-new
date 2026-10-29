-- Pool list paging (Build Board D7), PL1. Spec: docs/features/pools-list-paging.md section 3.2.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- Apply after 20261022140000_telegram_messages. Then run the backfill:
--   pnpm run --filter server pools:backfill-stats            (dry run, prints the diff)
--   pnpm run --filter server pools:backfill-stats --apply

-- hidden becomes not null. NULL meant visible, so it becomes false first.
UPDATE `creator_pools` SET `hidden` = false WHERE `hidden` IS NULL;
ALTER TABLE `creator_pools` MODIFY `hidden` BOOLEAN NOT NULL DEFAULT false;

-- Numeric stats, maintained by services/poolStats.ts
ALTER TABLE `creator_pools`
    ADD COLUMN `creator_stake_wei` DECIMAL(65, 0) NOT NULL DEFAULT 0,
    ADD COLUMN `fan_stake_wei` DECIMAL(65, 0) NOT NULL DEFAULT 0,
    ADD COLUMN `total_stake_wei` DECIMAL(65, 0) NOT NULL DEFAULT 0,
    ADD COLUMN `active_fans` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stats_updated_at` DATETIME(3) NULL,
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateIndex
CREATE INDEX `creator_pools_chainId_hidden_total_stake_wei_idx` ON `creator_pools`(`chainId`, `hidden`, `total_stake_wei`);
CREATE INDEX `creator_pools_chainId_hidden_active_fans_idx` ON `creator_pools`(`chainId`, `hidden`, `active_fans`);
CREATE INDEX `creator_pools_chainId_hidden_name_idx` ON `creator_pools`(`chainId`, `hidden`, `name`);
CREATE FULLTEXT INDEX `creator_pools_description_idx` ON `creator_pools`(`description`);
