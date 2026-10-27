-- Fan Graph (Build Board #22, docs/features/fan-graph.md).
-- Existing accounts keep their public page (PUBLISHED).

-- AlterTable
ALTER TABLE `users` ADD COLUMN `page_status` ENUM('PUBLISHED', 'UNPUBLISHED') NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN `show_follower_count` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `follow_disclosure_seen_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `follows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `follower_id` INTEGER NOT NULL,
    `creator_id` INTEGER NOT NULL,
    `show_publicly` BOOLEAN NOT NULL DEFAULT false,
    `email_updates` BOOLEAN NOT NULL DEFAULT false,
    `email_updates_at` DATETIME(3) NULL,
    `source` VARCHAR(16) NOT NULL,
    `campaign_id` BINARY(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `follows_creator_id_created_at_idx`(`creator_id`, `created_at`),
    INDEX `follows_follower_id_created_at_idx`(`follower_id`, `created_at`),
    UNIQUE INDEX `follows_follower_id_creator_id_key`(`follower_id`, `creator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `follow_blocks` (
    `creator_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `follow_blocks_user_id_idx`(`user_id`),
    PRIMARY KEY (`creator_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `follow_removals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `creator_id` INTEGER NOT NULL,
    `reason` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `follow_removals_creator_id_created_at_idx`(`creator_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `follows` ADD CONSTRAINT `follows_follower_id_fkey` FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follows` ADD CONSTRAINT `follows_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follows` ADD CONSTRAINT `follows_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `analytics_campaigns`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_blocks` ADD CONSTRAINT `follow_blocks_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_blocks` ADD CONSTRAINT `follow_blocks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_removals` ADD CONSTRAINT `follow_removals_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
