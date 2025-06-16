/*
  Warnings:

  - You are about to drop the column `image` on the `theme_categories` table. All the data in the column will be lost.
  - You are about to alter the column `description` on the `theme_categories` table. The data in that column could be lost. The data in that column will be cast from `VarChar(240)` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `theme_categories` DROP COLUMN `image`,
    MODIFY `description` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `themes` ADD COLUMN `thumbnail_file_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `themes` ADD CONSTRAINT `themes_thumbnail_file_id_fkey` FOREIGN KEY (`thumbnail_file_id`) REFERENCES `uploaded_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
