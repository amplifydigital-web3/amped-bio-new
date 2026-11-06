-- Amped Messages (Build Board #2, revision 4), PR M1. Spec docs/features/messaging.md section 6.
-- Applied by hand on staging and production after merge (no deploy automation runs
-- migrate deploy). Apply after 20261030180000_checkout_intents.
-- Additive only: new tables and nullable or defaulted columns. Nothing reads them until M2.
-- The thread copy is a separate step with encryption, run by hand on staging:
--   pnpm --filter server messages:copy-threads
-- Production has no message_threads rows (TELEGRAM_ENABLED=false), so the copy is a no op there.

-- AlterTable
ALTER TABLE `notification_preferences`
    ADD COLUMN `pushEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `messageEmailEnabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `creator_messaging_settings`
    ADD COLUMN `readReceipts` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `message_reports`
    ADD COLUMN `conversationId` BINARY(16) NULL,
    ADD COLUMN `directMessageId` BINARY(16) NULL,
    ADD COLUMN `bodySnapshotEnc` TEXT NULL;

-- CreateIndex
CREATE INDEX `message_reports_conversationId_idx` ON `message_reports`(`conversationId`);

-- CreateTable
CREATE TABLE `conversations` (
    `id` BINARY(16) NOT NULL,
    `kind` ENUM('DIRECT') NOT NULL DEFAULT 'DIRECT',
    `pairKey` VARCHAR(32) NULL,
    `createdById` INTEGER NOT NULL,
    `lastMessageId` BINARY(16) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `conversations_pairKey_key`(`pairKey`),
    INDEX `conversations_lastMessageAt_idx`(`lastMessageAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_members` (
    `conversationId` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `folder` ENUM('PRIMARY', 'REQUESTS') NOT NULL DEFAULT 'PRIMARY',
    `state` ENUM('ACTIVE', 'BLOCKED', 'LEFT') NOT NULL DEFAULT 'ACTIVE',
    `acceptedAt` DATETIME(3) NULL,
    `lastReadId` BINARY(16) NULL,
    `lastReadAt` DATETIME(3) NULL,
    `unread` INTEGER NOT NULL DEFAULT 0,
    `mutedUntil` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `clearedBeforeId` BINARY(16) NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversation_members_userId_folder_archivedAt_idx`(`userId`, `folder`, `archivedAt`),
    PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `direct_messages` (
    `id` BINARY(16) NOT NULL,
    `conversationId` BINARY(16) NOT NULL,
    `senderId` INTEGER NULL,
    `bodyEnc` TEXT NOT NULL,
    `bodyLength` INTEGER NOT NULL,
    `idempotencyKey` VARCHAR(64) NULL,
    `flaggedTerms` JSON NULL,
    `unsentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `direct_messages_conversationId_idempotencyKey_key`(`conversationId`, `idempotencyKey`),
    INDEX `direct_messages_conversationId_id_idx`(`conversationId`, `id`),
    INDEX `direct_messages_senderId_createdAt_idx`(`senderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `kind` ENUM('MESSAGE', 'REQUEST', 'BROADCAST') NOT NULL,
    `actorId` INTEGER NULL,
    `refId` BINARY(16) NULL,
    `groupKey` VARCHAR(64) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `seenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notifications_userId_groupKey_seenAt_idx`(`userId`, `groupKey`, `seenAt`),
    INDEX `notifications_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `endpoint` VARCHAR(512) NOT NULL,
    `p256dh` VARCHAR(128) NOT NULL,
    `auth` VARCHAR(64) NOT NULL,
    `userAgent` VARCHAR(255) NULL,
    `failedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_jobs` (
    `id` BINARY(16) NOT NULL,
    `channel` VARCHAR(8) NOT NULL,
    `userId` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'CLAIMED', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `runAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimedAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,
    `error` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_jobs_status_runAfter_idx`(`status`, `runAfter`),
    INDEX `notification_jobs_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (Restrict: account deletion runs anonymizeMessagingForUser first)
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `direct_messages` ADD CONSTRAINT `direct_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (Restrict: account deletion detaches the sender first)
ALTER TABLE `direct_messages` ADD CONSTRAINT `direct_messages_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
