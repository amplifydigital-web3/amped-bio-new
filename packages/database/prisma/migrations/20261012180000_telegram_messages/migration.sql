-- Messaging on Telegram (Build Board #2), PR 3: fan to creator messages. Spec section 3.3.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- Apply after 20261012120000_telegram_link.

-- CreateTable
CREATE TABLE `creator_messaging_settings` (
    `userId` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `ruleKind` ENUM('ANYONE', 'FOLLOWER', 'PAID_MEMBER', 'POOL_MEMBER', 'STAKE_MIN') NOT NULL DEFAULT 'FOLLOWER',
    `stakeMin` VARCHAR(80) NULL,
    `dailyNewThreadCap` INTEGER NOT NULL DEFAULT 50,
    `replyFromTelegram` BOOLEAN NOT NULL DEFAULT true,
    `invitedAt` DATETIME(3) NULL,
    `pausedAt` DATETIME(3) NULL,
    `pausedReason` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messaging_sender_status` (
    `userId` INTEGER NOT NULL,
    `pausedAt` DATETIME(3) NULL,
    `pausedUntil` DATETIME(3) NULL,
    `pausedReason` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_threads` (
    `id` BINARY(16) NOT NULL,
    `creatorUserId` INTEGER NOT NULL,
    `fanUserId` INTEGER NOT NULL,
    `status` ENUM('OPEN', 'BLOCKED_BY_CREATOR', 'BLOCKED_BY_FAN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `lastMessageAt` DATETIME(3) NULL,
    `creatorReadAt` DATETIME(3) NULL,
    `fanReadAt` DATETIME(3) NULL,
    `creatorUnread` INTEGER NOT NULL DEFAULT 0,
    `fanUnread` INTEGER NOT NULL DEFAULT 0,
    `mutedUntil` DATETIME(3) NULL,
    `blockedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `message_threads_creatorUserId_fanUserId_key`(`creatorUserId`, `fanUserId`),
    INDEX `message_threads_creatorUserId_lastMessageAt_idx`(`creatorUserId`, `lastMessageAt`),
    INDEX `message_threads_fanUserId_lastMessageAt_idx`(`fanUserId`, `lastMessageAt`),
    INDEX `message_threads_creatorUserId_createdAt_idx`(`creatorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` BINARY(16) NOT NULL,
    `threadId` BINARY(16) NOT NULL,
    `sender` ENUM('FAN', 'CREATOR') NOT NULL,
    `channel` ENUM('TELEGRAM', 'WEB') NOT NULL,
    `body` TEXT NOT NULL,
    `idempotencyKey` VARCHAR(64) NULL,
    `tgMessageId` BIGINT NULL,
    `tgForwardMessageId` BIGINT NULL,
    `deliveredAt` DATETIME(3) NULL,
    `failedReason` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `messages_threadId_idempotencyKey_key`(`threadId`, `idempotencyKey`),
    INDEX `messages_threadId_createdAt_idx`(`threadId`, `createdAt`),
    INDEX `messages_tgForwardMessageId_idx`(`tgForwardMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_reports` (
    `id` BINARY(16) NOT NULL,
    `threadId` BINARY(16) NOT NULL,
    `messageId` BINARY(16) NULL,
    `reporterUserId` INTEGER NOT NULL,
    `reason` ENUM('SPAM', 'HARASSMENT', 'FINANCIAL_PROMISE', 'OTHER') NOT NULL,
    `note` VARCHAR(500) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `message_reports_threadId_idx`(`threadId`),
    INDEX `message_reports_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `creator_messaging_settings` ADD CONSTRAINT `creator_messaging_settings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messaging_sender_status` ADD CONSTRAINT `messaging_sender_status_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_threads` ADD CONSTRAINT `message_threads_creatorUserId_fkey` FOREIGN KEY (`creatorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_threads` ADD CONSTRAINT `message_threads_fanUserId_fkey` FOREIGN KEY (`fanUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `message_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `message_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reports` ADD CONSTRAINT `message_reports_reporterUserId_fkey` FOREIGN KEY (`reporterUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
