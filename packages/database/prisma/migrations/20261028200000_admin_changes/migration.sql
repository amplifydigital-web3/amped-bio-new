-- AmpedPay admin controls (Build Board #50), PAY-A1. Spec docs/features/ampedpay.md 3.7.
-- Every payments setting change: drafted, approved by a second payments_admin, applied.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- CreateTable
CREATE TABLE `admin_changes` (
    `id` BINARY(16) NOT NULL,
    `area` VARCHAR(24) NOT NULL,
    `target` VARCHAR(16) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `old_value` VARCHAR(1024) NOT NULL,
    `new_value` VARCHAR(1024) NOT NULL,
    `effective_at` DATETIME(3) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `drafted_by_id` INTEGER NOT NULL,
    `approved_by_id` INTEGER NULL,
    `decision_note` VARCHAR(500) NULL,
    `safe_tx_hash` VARCHAR(66) NULL,
    `tx_hash` VARCHAR(66) NULL,
    `chain_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decided_at` DATETIME(3) NULL,
    `applied_at` DATETIME(3) NULL,

    INDEX `admin_changes_area_created_at_idx`(`area`, `created_at`),
    INDEX `admin_changes_status_idx`(`status`),
    INDEX `admin_changes_area_key_status_idx`(`area`, `key`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
