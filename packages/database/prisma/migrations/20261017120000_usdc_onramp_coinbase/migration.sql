-- Buy USDC through Coinbase (Build Board #5), USDC-4 Coinbase account path. Spec 3.2 and 3.5.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- User: the opaque partnerUserRef sent to Coinbase
ALTER TABLE `users` ADD COLUMN `onramp_ref` VARCHAR(32) NULL;
CREATE UNIQUE INDEX `users_onramp_ref_key` ON `users`(`onramp_ref`);

-- CreateTable
CREATE TABLE `onramp_sessions` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `mode` VARCHAR(24) NOT NULL,
    `sessionRef` VARCHAR(128) NULL,
    `partnerUserRef` VARCHAR(64) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `fiatAmount` INTEGER NULL,
    `fiatCurrency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `usdcAmount` BIGINT NULL,
    `quote` JSON NULL,
    `destination` VARCHAR(42) NOT NULL,
    `chainId` INTEGER NOT NULL,
    `txHash` VARCHAR(66) NULL,
    `failureCode` VARCHAR(64) NULL,
    `returnTo` VARCHAR(255) NULL,
    `sandbox` BOOLEAN NOT NULL DEFAULT false,
    `checkedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `onramp_sessions_provider_sessionRef_key`(`provider`, `sessionRef`),
    INDEX `onramp_sessions_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `onramp_sessions_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `onramp_sessions_txHash_idx`(`txHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `onramp_events` (
    `id` BINARY(16) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `eventId` VARCHAR(128) NOT NULL,
    `eventType` VARCHAR(64) NOT NULL,
    `sessionId` BINARY(16) NULL,
    `payload` JSON NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `error` VARCHAR(255) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `onramp_events_provider_eventId_key`(`provider`, `eventId`),
    INDEX `onramp_events_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable (written and read by USDC-5, Apple Pay and Google Pay)
CREATE TABLE `onramp_user_auth` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `tokenEnc` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `onramp_user_auth_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `onramp_user_auth` ADD CONSTRAINT `onramp_user_auth_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `onramp_sessions` ADD CONSTRAINT `onramp_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
