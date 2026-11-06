-- Store catalog (content PR 9, C9): store settings, products, product items, store policy versions.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate
-- deploy). Apply after 20261103010000_messages_server.

-- CreateTable
CREATE TABLE `store_settings` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'draft',
    `name` VARCHAR(40) NULL,
    `tagline` VARCHAR(80) NULL,
    `layout` VARCHAR(12) NOT NULL DEFAULT 'grid',
    `section_order` JSON NOT NULL,
    `featured_offer_ids` JSON NOT NULL,
    `about` VARCHAR(600) NULL,
    `thank_you_note` VARCHAR(280) NULL,
    `policy_draft` JSON NULL,
    `live_policy_version_id` BINARY(16) NULL,
    `seller_terms_accepted_at` DATETIME(3) NULL,
    `went_live_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_settings_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `offers` (
    `id` BINARY(16) NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'draft',
    `slug` VARCHAR(60) NOT NULL,
    `title` VARCHAR(80) NOT NULL,
    `description` VARCHAR(2000) NULL,
    `cover_item_id` BINARY(16) NULL,
    `amount_units` BIGINT NOT NULL,
    `access_period_days` INTEGER NULL,
    `also_in_membership` BOOLEAN NOT NULL DEFAULT false,
    `adult` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `sales_count` INTEGER NOT NULL DEFAULT 0,
    `activated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `offers_creator_user_id_status_sort_order_idx`(`creator_user_id`, `status`, `sort_order`),
    UNIQUE INDEX `offers_creator_user_id_slug_key`(`creator_user_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `offer_items` (
    `id` BINARY(16) NOT NULL,
    `offer_id` BINARY(16) NOT NULL,
    `content_item_id` BINARY(16) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `offer_items_content_item_id_idx`(`content_item_id`),
    UNIQUE INDEX `offer_items_offer_id_content_item_id_key`(`offer_id`, `content_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_policy_versions` (
    `id` BINARY(16) NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `mode` VARCHAR(8) NOT NULL,
    `template_version` INTEGER NULL,
    `settings` JSON NOT NULL,
    `confirmations` JSON NULL,
    `rendered_text` TEXT NOT NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `store_policy_versions_creator_user_id_version_key`(`creator_user_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_settings` ADD CONSTRAINT `store_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offers` ADD CONSTRAINT `offers_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_items` ADD CONSTRAINT `offer_items_offer_id_fkey` FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `offer_items` ADD CONSTRAINT `offer_items_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_policy_versions` ADD CONSTRAINT `store_policy_versions_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
