-- Creator Pool Broadcast (Build Board #1), phase 1: Amped inbox only.

-- CreateTable
CREATE TABLE `broadcasts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `creatorUserId` INTEGER NOT NULL,
    `poolId` INTEGER NULL,
    `audienceKind` ENUM('ALL_MEMBERS') NOT NULL DEFAULT 'ALL_MEMBERS',
    `title` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `sendEmail` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('IN_REVIEW', 'QUEUED', 'SENDING', 'SENT', 'REJECTED', 'CANCELED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `flaggedTerms` JSON NULL,
    `reviewReason` VARCHAR(16) NULL,
    `reviewNote` TEXT NULL,
    `reviewedById` INTEGER NULL,
    `reviewedAt` DATETIME(3) NULL,
    `queuedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `recipientEstimate` INTEGER NOT NULL DEFAULT 0,
    `recipientCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `broadcasts_creatorUserId_idempotencyKey_key`(`creatorUserId`, `idempotencyKey`),
    INDEX `broadcasts_poolId_createdAt_idx`(`poolId`, `createdAt`),
    INDEX `broadcasts_creatorUserId_createdAt_idx`(`creatorUserId`, `createdAt`),
    INDEX `broadcasts_status_updatedAt_idx`(`status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `broadcastId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `emailStatus` ENUM('NOT_ELIGIBLE', 'PENDING', 'SENT', 'DELIVERED', 'DEFERRED', 'BOUNCED', 'COMPLAINED', 'FAILED') NOT NULL DEFAULT 'NOT_ELIGIBLE',
    `emailSkipReason` VARCHAR(32) NULL,
    `emailAttempts` INTEGER NOT NULL DEFAULT 0,
    `providerMessageId` VARCHAR(255) NULL,
    `emailSentAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `broadcast_deliveries_broadcastId_userId_key`(`broadcastId`, `userId`),
    INDEX `broadcast_deliveries_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `broadcast_deliveries_broadcastId_emailStatus_idx`(`broadcastId`, `emailStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `broadcastId` INTEGER NOT NULL,
    `reporterUserId` INTEGER NOT NULL,
    `reason` ENUM('FINANCIAL_PROMISE', 'SPAM', 'HARASSMENT', 'OTHER') NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `broadcast_reports_broadcastId_reporterUserId_key`(`broadcastId`, `reporterUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broadcast_sender_status` (
    `userId` INTEGER NOT NULL,
    `invitedAt` DATETIME(3) NULL,
    `firstApprovedAt` DATETIME(3) NULL,
    `pausedAt` DATETIME(3) NULL,
    `pausedReason` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_preferences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `creatorUserId` INTEGER NOT NULL DEFAULT 0,
    `emailEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mutedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_preferences_userId_creatorUserId_key`(`userId`, `creatorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_creatorUserId_fkey` FOREIGN KEY (`creatorUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcasts` ADD CONSTRAINT `broadcasts_poolId_fkey` FOREIGN KEY (`poolId`) REFERENCES `creator_pools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_deliveries` ADD CONSTRAINT `broadcast_deliveries_broadcastId_fkey` FOREIGN KEY (`broadcastId`) REFERENCES `broadcasts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_deliveries` ADD CONSTRAINT `broadcast_deliveries_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_reports` ADD CONSTRAINT `broadcast_reports_broadcastId_fkey` FOREIGN KEY (`broadcastId`) REFERENCES `broadcasts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broadcast_reports` ADD CONSTRAINT `broadcast_reports_reporterUserId_fkey` FOREIGN KEY (`reporterUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
