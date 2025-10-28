-- AlterTable
ALTER TABLE `creator_pools` ALTER COLUMN `chainId` DROP DEFAULT;

-- CreateTable
CREATE TABLE `staked_pools` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userWalletId` INTEGER NOT NULL,
    `poolId` INTEGER NOT NULL,
    `stakeAmount` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `staked_pools_userWalletId_poolId_key`(`userWalletId`, `poolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `staked_pools` ADD CONSTRAINT `staked_pools_userWalletId_fkey` FOREIGN KEY (`userWalletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staked_pools` ADD CONSTRAINT `staked_pools_poolId_fkey` FOREIGN KEY (`poolId`) REFERENCES `creator_pools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
