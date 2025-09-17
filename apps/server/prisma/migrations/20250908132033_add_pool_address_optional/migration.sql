-- CreateTable
CREATE TABLE `creator_pools` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `creatorCut` INTEGER NOT NULL,
    `image_file_id` INTEGER NULL,
    `description` LONGTEXT NULL,
    `fans` INTEGER NOT NULL DEFAULT 0,
    `revoStaked` INTEGER NOT NULL DEFAULT 0,
    `poolAddress` VARCHAR(191) NULL,

    UNIQUE INDEX `creator_pools_userId_key`(`userId`),
    UNIQUE INDEX `creator_pools_poolAddress_key`(`poolAddress`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `creator_pools` ADD CONSTRAINT `creator_pools_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `creator_pools` ADD CONSTRAINT `creator_pools_image_file_id_fkey` FOREIGN KEY (`image_file_id`) REFERENCES `uploaded_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
