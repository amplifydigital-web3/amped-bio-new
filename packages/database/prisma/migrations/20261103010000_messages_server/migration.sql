-- Amped Messages (Build Board #2, revision 4), PR M2. Spec docs/features/messaging.md 5 and 7.1.
-- Applied by hand on staging and production after merge. Apply after 20261103000000_native_messaging.
-- creator_messaging_settings becomes messaging_settings for every account. The invite pilot
-- column goes. `enabled` is replaced by the NOBODY rule: accounts that had messages off keep
-- them off. NOBODY is added to the shared rule enum on telegram_groups too (Prisma shares the
-- enum); groups never use it and are removed in M8.

-- Keep messages off for accounts that had them off
ALTER TABLE `creator_messaging_settings`
    MODIFY `ruleKind` ENUM('ANYONE', 'FOLLOWER', 'PAID_MEMBER', 'POOL_MEMBER', 'STAKE_MIN', 'NOBODY') NOT NULL DEFAULT 'FOLLOWER';
UPDATE `creator_messaging_settings` SET `ruleKind` = 'NOBODY' WHERE `enabled` = false;

-- DropForeignKey
ALTER TABLE `creator_messaging_settings` DROP FOREIGN KEY `creator_messaging_settings_userId_fkey`;

-- AlterTable
ALTER TABLE `creator_messaging_settings` DROP COLUMN `enabled`, DROP COLUMN `invitedAt`;

-- RenameTable
RENAME TABLE `creator_messaging_settings` TO `messaging_settings`;

-- AddForeignKey
ALTER TABLE `messaging_settings` ADD CONSTRAINT `messaging_settings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (shared enum)
ALTER TABLE `telegram_groups`
    MODIFY `ruleKind` ENUM('ANYONE', 'FOLLOWER', 'PAID_MEMBER', 'POOL_MEMBER', 'STAKE_MIN', 'NOBODY') NOT NULL DEFAULT 'POOL_MEMBER';

-- AlterTable: reports on conversations carry no legacy thread
ALTER TABLE `message_reports` DROP FOREIGN KEY `message_reports_threadId_fkey`;
ALTER TABLE `message_reports` MODIFY `threadId` BINARY(16) NULL;
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `message_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
