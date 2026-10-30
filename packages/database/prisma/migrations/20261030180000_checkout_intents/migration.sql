-- Checkout intents (Build Board #49 Mobile checkout, PR CK-1).
-- Applied by hand on staging and production after merge (no deploy automation
-- runs migrate deploy). Independent of the identity checks and gating
-- migrations; apply after 20261023170000_rns_expiry_notice_attempts.

-- CreateTable
CREATE TABLE `checkout_intents` (
    `id` BINARY(16) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `interval` VARCHAR(8) NULL,
    `via` VARCHAR(32) NULL,
    `source` VARCHAR(16) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `claimed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `checkout_intents_user_id_status_expires_at_idx`(`user_id`, `status`, `expires_at`),
    INDEX `checkout_intents_creator_user_id_created_at_idx`(`creator_user_id`, `created_at`),
    INDEX `checkout_intents_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `checkout_intents` ADD CONSTRAINT `checkout_intents_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checkout_intents` ADD CONSTRAINT `checkout_intents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
