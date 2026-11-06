-- C12 store promoters (content spec 3.9 Promoters). New table, two nullable columns, one enum value.

-- AlterTable
ALTER TABLE `notifications` MODIFY `kind` ENUM('MESSAGE', 'REQUEST', 'BROADCAST', 'MEMBERSHIP_RENEWAL', 'PROMOTER_CODE') NOT NULL;

-- AlterTable
ALTER TABLE `memberships` ADD COLUMN `promoter_code_id` BINARY(16) NULL;

-- CreateTable
CREATE TABLE `promoter_codes` (
    `id` BINARY(16) NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `promoter_user_id` INTEGER NOT NULL,
    `code` VARCHAR(16) NOT NULL,
    `bps` INTEGER NOT NULL,
    `scope` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'active',
    `paused_reason` VARCHAR(12) NULL,
    `expires_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `promoter_codes_code_key`(`code`),
    INDEX `promoter_codes_creator_user_id_status_idx`(`creator_user_id`, `status`),
    INDEX `promoter_codes_promoter_user_id_idx`(`promoter_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `memberships_promoter_code_id_idx` ON `memberships`(`promoter_code_id`);

-- CreateIndex
CREATE INDEX `purchases_promoter_code_id_idx` ON `purchases`(`promoter_code_id`);

-- AddForeignKey
ALTER TABLE `promoter_codes` ADD CONSTRAINT `promoter_codes_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promoter_codes` ADD CONSTRAINT `promoter_codes_promoter_user_id_fkey` FOREIGN KEY (`promoter_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
