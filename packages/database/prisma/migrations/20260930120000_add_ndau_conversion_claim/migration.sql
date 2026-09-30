-- AlterTable
ALTER TABLE `ndau_conversions` ADD COLUMN `claimed_at` DATETIME(3) NULL,
    ADD COLUMN `claimed_by` INTEGER NULL;
