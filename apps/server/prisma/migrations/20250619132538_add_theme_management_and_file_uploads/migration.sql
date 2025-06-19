-- AlterTable
ALTER TABLE `themes` ADD COLUMN `category_id` INTEGER NULL,
    ADD COLUMN `description` LONGTEXT NULL,
    ADD COLUMN `thumbnail_file_id` INTEGER NULL,
    MODIFY `user_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `image_file_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `theme_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `visible` BOOLEAN NOT NULL DEFAULT false,
    `image_file_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `theme_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `uploaded_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `s3_key` VARCHAR(255) NOT NULL,
    `bucket` VARCHAR(100) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_type` VARCHAR(100) NULL,
    `size` BIGINT NULL,
    `user_id` INTEGER NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('PENDING', 'COMPLETED', 'DELETED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `uploaded_files_s3_key_idx`(`s3_key`),
    INDEX `uploaded_files_user_id_idx`(`user_id`),
    INDEX `uploaded_files_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_image_file_id_fkey` FOREIGN KEY (`image_file_id`) REFERENCES `uploaded_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `theme_categories` ADD CONSTRAINT `theme_categories_image_file_id_fkey` FOREIGN KEY (`image_file_id`) REFERENCES `uploaded_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `theme_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_thumbnail_file_id_fkey` FOREIGN KEY (`thumbnail_file_id`) REFERENCES `uploaded_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `uploaded_files` ADD CONSTRAINT `uploaded_files_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
