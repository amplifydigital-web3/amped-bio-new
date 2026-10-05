-- CreateTable
CREATE TABLE `analytics_events` (
    `id` BINARY(16) NOT NULL,
    `event_id` VARCHAR(36) NULL,
    `user_id` INTEGER NOT NULL,
    `block_id` INTEGER NULL,
    `campaign_id` BINARY(16) NULL,
    `type` ENUM('view', 'click', 'engage') NOT NULL,
    `visitor_hash` VARCHAR(32) NOT NULL,
    `persistent_visitor` VARCHAR(32) NULL,
    `session_id` VARCHAR(36) NULL,
    `visitor_user_id` INTEGER NULL,
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

    UNIQUE INDEX `analytics_events_event_id_key`(`event_id`),
    INDEX `analytics_events_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `analytics_events_user_id_type_created_at_idx`(`user_id`, `type`, `created_at`),
    INDEX `analytics_events_block_id_created_at_idx`(`block_id`, `created_at`),
    INDEX `analytics_events_user_id_persistent_visitor_created_at_idx`(`user_id`, `persistent_visitor`, `created_at`),
    INDEX `analytics_events_campaign_id_created_at_idx`(`campaign_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytics_campaigns` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `channel` VARCHAR(32) NOT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `analytics_campaigns_user_id_slug_key`(`user_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analytics_consents` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `visitor_hash` VARCHAR(32) NOT NULL,
    `persistent_visitor` VARCHAR(32) NULL,
    `analytics` BOOLEAN NOT NULL,
    `advertising` BOOLEAN NOT NULL,
    `policy_version` VARCHAR(16) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `analytics_consents_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tracking_pixels` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `ga4_measurement_id` VARCHAR(32) NULL,
    `meta_pixel_id` VARCHAR(32) NULL,
    `meta_capi_token_enc` TEXT NULL,
    `tiktok_pixel_id` VARCHAR(32) NULL,
    `tiktok_events_token_enc` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `tracking_pixels_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_block_id_fkey` FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `analytics_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_campaigns` ADD CONSTRAINT `analytics_campaigns_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_consents` ADD CONSTRAINT `analytics_consents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tracking_pixels` ADD CONSTRAINT `tracking_pixels_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
