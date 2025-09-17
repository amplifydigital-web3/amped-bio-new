-- AlterTable
ALTER TABLE `creator_pools` ADD COLUMN `chainId` VARCHAR(191) NOT NULL DEFAULT '1';

-- CreateIndex
CREATE UNIQUE INDEX `creator_pools_userId_chainId_key` ON `creator_pools`(`userId`, `chainId`);

-- DropIndex
DROP INDEX `creator_pools_userId_key` ON `creator_pools`;