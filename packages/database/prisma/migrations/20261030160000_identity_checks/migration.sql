-- Identity checks (Build Board #47, docs/features/identity-checks.md, PR I1).
-- Applied by hand on staging and production after merge (no deploy automation
-- runs migrate deploy). Apply after 20261023170000_rns_expiry_notice_attempts.

-- CreateTable
CREATE TABLE `identity_checks` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `wallet_address` VARCHAR(42) NOT NULL,
    `pass` BOOLEAN NOT NULL,
    `reason` VARCHAR(16) NULL,
    `tier` VARCHAR(16) NULL,
    `valid_until` DATETIME(3) NULL,
    `checked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `identity_checks_user_id_kind_key`(`user_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identity_review_cases` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `kind` VARCHAR(16) NOT NULL DEFAULT 'under_18',
    `opened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_result_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `results` INTEGER NOT NULL DEFAULT 1,
    `alerted_at` DATETIME(3) NULL,
    `decided_at` DATETIME(3) NULL,
    `decided_by` INTEGER NULL,
    `note` VARCHAR(500) NULL,

    INDEX `identity_review_cases_user_id_status_idx`(`user_id`, `status`),
    INDEX `identity_review_cases_status_opened_at_idx`(`status`, `opened_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `identity_checks` ADD CONSTRAINT `identity_checks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_review_cases` ADD CONSTRAINT `identity_review_cases_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
