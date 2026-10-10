-- Messaging on Telegram (Build Board #2), PR 1 foundation. Spec section 3.3.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- NotificationPreference: deliver a creator's broadcasts to the user's Telegram
ALTER TABLE `notification_preferences` ADD COLUMN `telegramEnabled` BOOLEAN NOT NULL DEFAULT false;

-- BroadcastDelivery: Telegram delivery state
ALTER TABLE `broadcast_deliveries`
  ADD COLUMN `telegramStatus` ENUM('NOT_ELIGIBLE', 'PENDING', 'SENT', 'FAILED', 'BLOCKED') NOT NULL DEFAULT 'NOT_ELIGIBLE',
  ADD COLUMN `tgMessageId` BIGINT NULL;

-- UserOnboarding: Home checklist item 6
ALTER TABLE `user_onboarding` ADD COLUMN `telegram_setup_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `telegram_accounts` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `telegramUserId` BIGINT NOT NULL,
    `username` VARCHAR(255) NULL,
    `firstName` VARCHAR(255) NULL,
    `photoUrl` VARCHAR(1024) NULL,
    `botAccess` BOOLEAN NOT NULL DEFAULT false,
    `blockedAt` DATETIME(3) NULL,
    `showTelegramOnBio` BOOLEAN NOT NULL DEFAULT true,
    `shareUsername` BOOLEAN NOT NULL DEFAULT false,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NULL,

    UNIQUE INDEX `telegram_accounts_userId_key`(`userId`),
    UNIQUE INDEX `telegram_accounts_telegramUserId_key`(`telegramUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_link_events` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `telegramUserId` BIGINT NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `source` VARCHAR(24) NOT NULL,
    `policyVersion` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `telegram_link_events_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_update_log` (
    `updateId` BIGINT NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`updateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_inbox` (
    `id` BINARY(16) NOT NULL,
    `updateId` BIGINT NOT NULL,
    `chatId` BIGINT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'CLAIMED', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `claimedAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,
    `error` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `telegram_inbox_updateId_key`(`updateId`),
    INDEX `telegram_inbox_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `telegram_inbox_chatId_createdAt_idx`(`chatId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_outbox` (
    `id` BINARY(16) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `chatId` BIGINT NULL,
    `refId` BINARY(16) NULL,
    `deliveryId` INTEGER NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'CLAIMED', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `runAfter` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimedAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,
    `error` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `telegram_outbox_status_priority_runAfter_idx`(`status`, `priority`, `runAfter`),
    INDEX `telegram_outbox_deliveryId_idx`(`deliveryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `telegram_accounts` ADD CONSTRAINT `telegram_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_link_events` ADD CONSTRAINT `telegram_link_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
