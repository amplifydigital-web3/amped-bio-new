/*
  Warnings:

  - You are about to drop the column `userId` on the `creator_pools` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[walletId,chainId]` on the table `creator_pools` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `walletId` to the `creator_pools` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `creator_pools` DROP FOREIGN KEY `creator_pools_userId_fkey`;

-- DropIndex
DROP INDEX `creator_pools_userId_chainId_key` ON `creator_pools`;

-- AlterTable
ALTER TABLE `creator_pools` DROP COLUMN `userId`,
    ADD COLUMN `walletId` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `stake_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userWalletId` INTEGER NOT NULL,
    `poolId` INTEGER NOT NULL,
    `amount` BIGINT NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `transactionHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stake_events_transactionHash_userWalletId_poolId_key`(`transactionHash`, `userWalletId`, `poolId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `creator_pools_walletId_chainId_key` ON `creator_pools`(`walletId`, `chainId`);

-- AddForeignKey
ALTER TABLE `creator_pools` ADD CONSTRAINT `creator_pools_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stake_events` ADD CONSTRAINT `stake_events_userWalletId_fkey` FOREIGN KEY (`userWalletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stake_events` ADD CONSTRAINT `stake_events_poolId_fkey` FOREIGN KEY (`poolId`) REFERENCES `creator_pools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
