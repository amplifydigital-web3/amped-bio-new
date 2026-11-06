-- AB-6 Authbase storefront: creators need Enhanced to sell, with an admin override (M10, spec 3.2b)
CREATE TABLE `seller_overrides` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoked_by_id` INTEGER NULL,
    `reminder_sent_at` DATETIME(3) NULL,
    `ended_notice_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seller_overrides_user_id_ends_at_idx`(`user_id`, `ends_at`),
    INDEX `seller_overrides_ends_at_idx`(`ends_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
