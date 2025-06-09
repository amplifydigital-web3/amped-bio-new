/*
  Warnings:

  - You are about to drop the column `category` on the `themes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `themes` DROP COLUMN `category`,
    ADD COLUMN `category_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `theme_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `theme_categories_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `theme_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
