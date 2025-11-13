-- AlterTable
ALTER TABLE `creator_pools` MODIFY `revoStaked` TEXT NOT NULL DEFAULT '0';

-- AlterTable
ALTER TABLE `stake_events` MODIFY `amount` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `staked_pools` MODIFY `stakeAmount` TEXT NOT NULL DEFAULT '0';
