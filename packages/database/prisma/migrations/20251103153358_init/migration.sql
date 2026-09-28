-- CreateTable
CREATE TABLE `creator_pools` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `walletId` INTEGER NOT NULL,
    `chainId` VARCHAR(191) NOT NULL,
    `image_file_id` INTEGER NULL,
    `description` LONGTEXT NULL,
    `fans` INTEGER NOT NULL DEFAULT 0,
    `revoStaked` BIGINT NOT NULL DEFAULT 0,
    `poolAddress` VARCHAR(191) NULL,

    UNIQUE INDEX `creator_pools_poolAddress_key`(`poolAddress`),
    UNIQUE INDEX `creator_pools_walletId_chainId_key`(`walletId`, `chainId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- AddForeignKey
ALTER TABLE `creator_pools` ADD CONSTRAINT `creator_pools_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creator_pools` ADD CONSTRAINT `creator_pools_image_file_id_fkey` FOREIGN KEY (`image_file_id`) REFERENCES `uploaded_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staked_pools` ADD CONSTRAINT `staked_pools_userWalletId_fkey` FOREIGN KEY (`userWalletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staked_pools` ADD CONSTRAINT `staked_pools_poolId_fkey` FOREIGN KEY (`poolId`) REFERENCES `creator_pools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stake_events` ADD CONSTRAINT `stake_events_userWalletId_fkey` FOREIGN KEY (`userWalletId`) REFERENCES `user_wallets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stake_events` ADD CONSTRAINT `stake_events_poolId_fkey` FOREIGN KEY (`poolId`) REFERENCES `creator_pools`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
