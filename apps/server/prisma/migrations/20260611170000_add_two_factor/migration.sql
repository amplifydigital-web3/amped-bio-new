-- AlterTable
ALTER TABLE `users` ADD COLUMN `two_factor_enabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `two_factor` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `secret` TEXT NOT NULL,
    `backup_codes` TEXT NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `two_factor_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `two_factor` ADD CONSTRAINT `two_factor_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
