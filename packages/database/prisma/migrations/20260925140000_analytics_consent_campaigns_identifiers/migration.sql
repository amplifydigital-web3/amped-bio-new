-- AlterTable
ALTER TABLE `analytics_events` ADD COLUMN `campaign_id` INTEGER NULL,
    ADD COLUMN `event_id` VARCHAR(36) NULL,
    ADD COLUMN `persistent_visitor` VARCHAR(32) NULL,
    ADD COLUMN `session_id` VARCHAR(36) NULL,
    ADD COLUMN `visitor_user_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `analytics_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
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
    `id` BIGINT NOT NULL AUTO_INCREMENT,
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

-- CreateIndex
CREATE UNIQUE INDEX `analytics_events_event_id_key` ON `analytics_events`(`event_id`);

-- CreateIndex
CREATE INDEX `analytics_events_user_id_persistent_visitor_created_at_idx` ON `analytics_events`(`user_id`, `persistent_visitor`, `created_at`);

-- CreateIndex
CREATE INDEX `analytics_events_campaign_id_created_at_idx` ON `analytics_events`(`campaign_id`, `created_at`);

-- AddForeignKey
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `analytics_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_campaigns` ADD CONSTRAINT `analytics_campaigns_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analytics_consents` ADD CONSTRAINT `analytics_consents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
