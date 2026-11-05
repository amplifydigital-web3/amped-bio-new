-- AlterTable
ALTER TABLE `notifications` MODIFY `kind` ENUM('MESSAGE', 'REQUEST', 'BROADCAST', 'MEMBERSHIP_RENEWAL') NOT NULL;

-- CreateTable
CREATE TABLE `membership_plans` (
    `id` BINARY(16) NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `description` VARCHAR(280) NULL,
    `benefits` JSON NOT NULL,
    `amount_every_30_days` BIGINT NOT NULL,
    `amount_yearly` BIGINT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `show_member_count` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `membership_plans_creator_user_id_key`(`creator_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `memberships` (
    `id` BINARY(16) NOT NULL,
    `plan_id` BINARY(16) NOT NULL,
    `plan_version` INTEGER NOT NULL,
    `fan_user_id` INTEGER NULL,
    `creator_user_id` INTEGER NULL,
    `interval` VARCHAR(16) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'prepared',
    `chain_id` INTEGER NOT NULL,
    `member` VARCHAR(42) NOT NULL,
    `creator_address` VARCHAR(42) NOT NULL,
    `price_per_period` BIGINT NOT NULL,
    `fee` BIGINT NOT NULL,
    `period_seconds` INTEGER NOT NULL,
    `join_table` JSON NOT NULL,
    `join_hash` CHAR(66) NOT NULL,
    `permit_value` BIGINT NOT NULL,
    `join_tx_hash` VARCHAR(66) NULL,
    `charge_count` INTEGER NOT NULL DEFAULT 0,
    `current_period_start` DATETIME(3) NULL,
    `current_period_end` DATETIME(3) NULL,
    `last_charge_tx_hash` VARCHAR(66) NULL,
    `not_ready_at` DATETIME(3) NULL,
    `past_due_since` DATETIME(3) NULL,
    `last_reminder_day` INTEGER NULL,
    `renewal_paused_at` DATETIME(3) NULL,
    `canceled_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `end_reason` VARCHAR(20) NULL,
    `end_tx_hash` VARCHAR(66) NULL,
    `failure_code` VARCHAR(64) NULL,
    `store_policy_version_id` BINARY(16) NULL,
    `checkout_intent_id` BINARY(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `memberships_fan_user_id_status_idx`(`fan_user_id`, `status`),
    INDEX `memberships_creator_user_id_status_created_at_idx`(`creator_user_id`, `status`, `created_at`),
    INDEX `memberships_plan_id_status_idx`(`plan_id`, `status`),
    INDEX `memberships_status_current_period_end_idx`(`status`, `current_period_end`),
    UNIQUE INDEX `memberships_chain_id_join_hash_key`(`chain_id`, `join_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `membership_plans` ADD CONSTRAINT `membership_plans_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_fan_user_id_fkey` FOREIGN KEY (`fan_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

