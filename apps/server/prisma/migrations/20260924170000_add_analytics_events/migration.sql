-- CreateTable
CREATE TABLE `analytics_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `block_id` INTEGER NULL,
    `type` ENUM('view', 'click', 'engage') NOT NULL,
    `visitor_hash` VARCHAR(32) NOT NULL,
    `duration_ms` INTEGER NULL,
    `source` VARCHAR(32) NOT NULL,
    `referrer` VARCHAR(255) NULL,
    `utm_source` VARCHAR(100) NULL,
    `utm_medium` VARCHAR(100) NULL,
    `utm_campaign` VARCHAR(100) NULL,
    `country` VARCHAR(2) NULL,
    `city` VARCHAR(100) NULL,
    `device` VARCHAR(16) NOT NULL,
    `os` VARCHAR(32) NULL,
    `browser` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `analytics_events_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `analytics_events_user_id_type_created_at_idx`(`user_id`, `type`, `created_at`),
    INDEX `analytics_events_block_id_created_at_idx`(`block_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
