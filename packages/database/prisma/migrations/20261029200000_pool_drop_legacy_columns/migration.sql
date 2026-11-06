-- Pool list paging PL4 (Build Board D7, docs/features/pools-list-paging.md section 7).
-- Apply one release after PL3 is live. Every reader and writer of these
-- columns moved to total_stake_wei and active_fans in PL1 to PL4.
ALTER TABLE `creator_pools` DROP COLUMN `fans`,
    DROP COLUMN `revoStaked`;
