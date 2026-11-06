-- Fan Library (#26) FL-5: offline download records.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- New table only. No existing table changes. download_records.id is UUID v7 in BINARY(16).

-- CreateTable
CREATE TABLE `download_records` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `content_item_id` BINARY(16) NOT NULL,
    `bytes` BIGINT NOT NULL DEFAULT 0,
    `grant_jti` VARCHAR(64) NOT NULL,
    `device` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removed_at` DATETIME(3) NULL,
    `removed_reason` VARCHAR(16) NULL,

    INDEX `download_records_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `download_records_user_id_device_idx`(`user_id`, `device`),
    INDEX `download_records_content_item_id_idx`(`content_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `download_records` ADD CONSTRAINT `download_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `download_records` ADD CONSTRAINT `download_records_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
