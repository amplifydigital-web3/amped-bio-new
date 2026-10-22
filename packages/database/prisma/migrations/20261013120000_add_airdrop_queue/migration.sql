-- Daily airdrop batch queue (SIMPLE_BATCH_SEND). New entity, so the id is
-- UUID v7 stored as BINARY(16) per the repo primary key strategy. txHash and
-- claimedAt persist the in-flight batch so a crash can never cause a resend.

-- CreateTable
CREATE TABLE `airdrop_queue` (
    `id` BINARY(16) NOT NULL,
    `userWalletId` INTEGER NOT NULL,
    `amount` TEXT NOT NULL,
    `txHash` TEXT NULL,
    `claimedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `airdrop_queue_userWalletId_key`(`userWalletId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `airdrop_queue` ADD CONSTRAINT `airdrop_queue_userWalletId_fkey` FOREIGN KEY (`userWalletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
