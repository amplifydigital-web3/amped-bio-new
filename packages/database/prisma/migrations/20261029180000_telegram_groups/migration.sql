-- Messaging on Telegram (Build Board #2), PR 5 groups. Spec r3 sections 3.2 to 3.6.
-- Applied by hand on staging and production after merge.

CREATE TABLE `telegram_groups` (
    `id` BINARY(16) NOT NULL,
    `creatorUserId` INTEGER NOT NULL,
    `tgChatId` BIGINT NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `ruleKind` ENUM('ANYONE', 'FOLLOWER', 'PAID_MEMBER', 'POOL_MEMBER', 'STAKE_MIN') NOT NULL DEFAULT 'POOL_MEMBER',
    `stakeMin` VARCHAR(80) NULL,
    `inviteLink` VARCHAR(255) NULL,
    `botIsAdmin` BOOLEAN NOT NULL DEFAULT false,
    `removeUnverified` BOOLEAN NOT NULL DEFAULT false,
    `memberCount` INTEGER NOT NULL DEFAULT 0,
    `addedByTelegramUserId` BIGINT NOT NULL,
    `connectedAt` DATETIME(3) NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `disconnectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_groups_tgChatId_key`(`tgChatId`),
    INDEX `telegram_groups_creatorUserId_idx`(`creatorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `telegram_group_members` (
    `id` BINARY(16) NOT NULL,
    `groupId` BINARY(16) NOT NULL,
    `userId` INTEGER NULL,
    `telegramUserId` BIGINT NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `declinedAt` DATETIME(3) NULL,
    `removedAt` DATETIME(3) NULL,
    `removedReason` VARCHAR(32) NULL,
    `lastVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `telegram_group_members_groupId_telegramUserId_key`(`groupId`, `telegramUserId`),
    INDEX `telegram_group_members_groupId_removedAt_idx`(`groupId`, `removedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `telegram_groups` ADD CONSTRAINT `telegram_groups_creatorUserId_fkey` FOREIGN KEY (`creatorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `telegram_group_members` ADD CONSTRAINT `telegram_group_members_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `telegram_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
