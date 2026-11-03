-- Fan Library (#26) FL-2: saved items and creator visits.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- New tables only. No existing table changes. saved_items.id is UUID v7 in BINARY(16).

-- CreateTable
CREATE TABLE `saved_items` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `content_item_id` BINARY(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `saved_items_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `saved_items_content_item_id_idx`(`content_item_id`),
    UNIQUE INDEX `saved_items_user_id_content_item_id_key`(`user_id`, `content_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `library_creator_visits` (
    `user_id` INTEGER NOT NULL,
    `creator_id` INTEGER NOT NULL,
    `last_visited_at` DATETIME(3) NOT NULL,

    INDEX `library_creator_visits_creator_id_idx`(`creator_id`),
    PRIMARY KEY (`user_id`, `creator_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `saved_items` ADD CONSTRAINT `saved_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saved_items` ADD CONSTRAINT `saved_items_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `library_creator_visits` ADD CONSTRAINT `library_creator_visits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `library_creator_visits` ADD CONSTRAINT `library_creator_visits_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
