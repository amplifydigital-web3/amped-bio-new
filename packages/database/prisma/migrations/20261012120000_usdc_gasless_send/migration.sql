-- USDC in the wallet (Build Board #29), USDC-2 gasless send. Spec section 3.2.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- User: first time the fan opened USDC on Base
ALTER TABLE `users` ADD COLUMN `usdc_wallet_seen_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `usdc_sends` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `chainId` INTEGER NOT NULL,
    `fromAddress` VARCHAR(42) NOT NULL,
    `toAddress` VARCHAR(42) NOT NULL,
    `toUserId` INTEGER NULL,
    `amount` BIGINT NOT NULL,
    `nonce` VARCHAR(66) NOT NULL,
    `validBefore` DATETIME(3) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `screening` JSON NULL,
    `txHash` VARCHAR(66) NULL,
    `failureCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usdc_sends_chainId_nonce_key`(`chainId`, `nonce`),
    INDEX `usdc_sends_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `usdc_sends_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `usdc_sends_txHash_idx`(`txHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_events` (
    `id` BINARY(16) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `chainId` INTEGER NOT NULL,
    `txHash` VARCHAR(66) NOT NULL,
    `logIndex` INTEGER NOT NULL,
    `blockNumber` BIGINT NOT NULL,
    `fromAddress` VARCHAR(42) NOT NULL,
    `toAddress` VARCHAR(42) NOT NULL,
    `payerUserId` INTEGER NULL,
    `payeeUserId` INTEGER NULL,
    `amount` BIGINT NOT NULL,
    `fee` BIGINT NOT NULL DEFAULT 0,
    `refType` VARCHAR(16) NULL,
    `refId` BINARY(16) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payment_events_chainId_txHash_logIndex_key`(`chainId`, `txHash`, `logIndex`),
    INDEX `payment_events_payerUserId_occurredAt_idx`(`payerUserId`, `occurredAt`),
    INDEX `payment_events_payeeUserId_occurredAt_idx`(`payeeUserId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `screening_events` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NULL,
    `address` VARCHAR(42) NOT NULL,
    `context` VARCHAR(24) NOT NULL,
    `vendor` VARCHAR(24) NOT NULL,
    `reference` VARCHAR(128) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `screening_events_createdAt_idx`(`createdAt`),
    INDEX `screening_events_address_idx`(`address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usdc_sends` ADD CONSTRAINT `usdc_sends_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
