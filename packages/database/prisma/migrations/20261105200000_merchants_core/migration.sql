-- AB-1 Authbase storefront: merchants, members, payout wallets, audit log (docs/features/authbase-storefront.md 3.10)
CREATE TABLE `merchants` (
    `id` BINARY(16) NOT NULL,
    `slug` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `fee_bps` INTEGER NOT NULL DEFAULT 2000,
    `business_check` JSON NULL,
    `store_policy_url` VARCHAR(500) NULL,
    `return_url` VARCHAR(500) NULL,
    `approved_at` DATETIME(3) NULL,
    `suspended_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `merchants_slug_key`(`slug`),
    INDEX `merchants_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_members` (
    `id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` VARCHAR(12) NOT NULL,
    `added_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `merchant_members_merchant_id_user_id_key`(`merchant_id`, `user_id`),
    INDEX `merchant_members_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_payout_wallets` (
    `id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `address` VARCHAR(42) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `proof_message` VARCHAR(500) NOT NULL,
    `proof_signature` TEXT NOT NULL,
    `proposed_by_id` INTEGER NOT NULL,
    `approved_by_id` INTEGER NULL,
    `rejected_by_id` INTEGER NULL,
    `effective_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `replaced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `merchant_payout_wallets_merchant_id_status_idx`(`merchant_id`, `status`),
    INDEX `merchant_payout_wallets_status_effective_at_idx`(`status`, `effective_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_audit_log` (
    `id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `actor_id` INTEGER NOT NULL,
    `action` VARCHAR(48) NOT NULL,
    `detail` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `merchant_audit_log_merchant_id_created_at_idx`(`merchant_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `offers` ADD COLUMN `merchant_id` BINARY(16) NULL;
CREATE INDEX `offers_merchant_id_status_idx` ON `offers`(`merchant_id`, `status`);
ALTER TABLE `purchases` ADD COLUMN `merchant_id` BINARY(16) NULL;
CREATE INDEX `purchases_merchant_id_created_at_idx` ON `purchases`(`merchant_id`, `created_at`);

ALTER TABLE `merchant_members` ADD CONSTRAINT `merchant_members_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `merchant_payout_wallets` ADD CONSTRAINT `merchant_payout_wallets_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `merchant_audit_log` ADD CONSTRAINT `merchant_audit_log_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `offers` ADD CONSTRAINT `offers_merchant_id_fkey` FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
