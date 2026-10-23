-- Fan Library (#26) phase A, PR 6a: playback position per account and item.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- New table only. No existing table changes. The id is UUID v7 in BINARY(16).

-- CreateTable
CREATE TABLE `viewer_progress` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `content_item_id` BINARY(16) NOT NULL,
    `position_ms` INTEGER NOT NULL DEFAULT 0,
    `duration_ms` INTEGER NULL,
    `completed` BOOLEAN NOT NULL DEFAULT false,
    `last_played_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `viewer_progress_user_id_last_played_at_idx`(`user_id`, `last_played_at`),
    INDEX `viewer_progress_content_item_id_idx`(`content_item_id`),
    UNIQUE INDEX `viewer_progress_user_id_content_item_id_key`(`user_id`, `content_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `viewer_progress` ADD CONSTRAINT `viewer_progress_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `viewer_progress` ADD CONSTRAINT `viewer_progress_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
