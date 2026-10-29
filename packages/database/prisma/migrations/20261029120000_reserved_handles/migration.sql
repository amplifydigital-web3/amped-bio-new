-- Reserved handles (Build Board D2), RH2. Spec docs/features/reserved-handles.md 7.9.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- Seeds the admin tier and touches no account. Run the launch audit
-- (pnpm --filter server handles:reserved-audit) on staging before production.

-- CreateTable
CREATE TABLE `reserved_handles` (
    `id` BINARY(16) NOT NULL,
    `word` VARCHAR(64) NOT NULL,
    `kind` ENUM('EXACT', 'PREFIX') NOT NULL,
    `category` ENUM('COMPANY', 'TRUST', 'BRAND', 'PARTNER', 'HOLD') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `assigned_user_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reserved_handles_word_key`(`word`),
    UNIQUE INDEX `reserved_handles_assigned_user_id_key`(`assigned_user_id`),
    INDEX `reserved_handles_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handle_notices` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `reserved_word` VARCHAR(64) NOT NULL,
    `tier` ENUM('SYSTEM', 'ADMIN') NOT NULL,
    `state` ENUM('NOTICE_SENT', 'CHOSE_NEW', 'RENAMED', 'EXEMPT', 'FAILED', 'CANCELLED') NOT NULL,
    `old_handle` VARCHAR(64) NOT NULL,
    `deadline` DATETIME(3) NULL,
    `extensions` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `handle_notices_user_id_reserved_word_key`(`user_id`, `reserved_word`),
    INDEX `handle_notices_state_deadline_idx`(`state`, `deadline`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handle_redirects` (
    `id` BINARY(16) NOT NULL,
    `old_handle` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `handle_redirects_old_handle_key`(`old_handle`),
    INDEX `handle_redirects_ends_at_idx`(`ends_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_audit_log` (
    `id` BINARY(16) NOT NULL,
    `actor_id` INTEGER NULL,
    `action` VARCHAR(48) NOT NULL,
    `target_user_id` INTEGER NULL,
    `subject` VARCHAR(64) NULL,
    `reason` VARCHAR(500) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_log_action_created_at_idx`(`action`, `created_at`),
    INDEX `admin_audit_log_target_user_id_idx`(`target_user_id`),
    INDEX `admin_audit_log_subject_created_at_idx`(`subject`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `reserved_handles` ADD CONSTRAINT `reserved_handles_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handle_notices` ADD CONSTRAINT `handle_notices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handle_redirects` ADD CONSTRAINT `handle_redirects_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the admin tier (decisions R2, R3). Matches ADMIN_TIER_SEED in
-- packages/constants/src/reservedHandles.ts. UUIDv7 ids, fixed so a rerun on
-- another environment gives the same rows.
INSERT INTO `reserved_handles` (`id`, `word`, `kind`, `category`, `reason`, `expires_at`, `assigned_user_id`, `created_by_id`, `created_at`, `updated_at`) VALUES
    (X'01A1878802007DC6A19079A14E0E7D9B', 'amped', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802017467A2E42772BBCA0362', 'ampedbio', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A187880202720383439747C1067583', 'amped-bio', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802037B6EAB8D26AB7CA66381', 'amplify', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A187880204770E8536739C6598BA3E', 'amplifydigital', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802057A169D362EED0588F3F8', 'revo', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802067711B5B136C18C063074', 'revolution', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020776B0BD4E319F6A32C47D', 'oneiro', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020878A6AC5008FE01437C30', 'cosimo', 'EXACT', 'COMPANY', 'Company name (seed)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802097C748BD6FD8D34DABE4F', 'official', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020A74D4BEA5EA6983F559EC', 'support', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020B7300ACCAB3D63846DF97', 'help', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020C761587FCBCD3003EB936', 'security', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020D773593DCFE5CAC598B47', 'safety', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020E78F880B251EC18119A97', 'moderator', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788020F755798E2488585A13B90', 'mod', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788021075E8A720C4BA44B7C830', 'staff', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802117A97893CA5EAF49DBE2C', 'team', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802127E8886646D4D74B68502', 'legal', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802137197B007E601056D8A7F', 'terms', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A187880214794D8B058E6ADA5D668E', 'abuse', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802157AF893CB4AB2AEC58BD9', 'billing', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802167434918E41D7E948A2C7', 'contact', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802177EFCB527BC0EE49EBF27', 'about', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A187880218751696D65CC09382BFAD', 'blog', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A1878802197A3199DB4E9845CA6615', 'press', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788021A7C18AE9D949A7BE53276', 'careers', 'EXACT', 'TRUST', 'Trust word (seed, R2)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788021B700383F81E86220DCBD9', 'amped-', 'PREFIX', 'TRUST', 'Reads as official (seed, R3)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788021C72ABB15D03EAD41A745A', 'amped_', 'PREFIX', 'TRUST', 'Reads as official (seed, R3)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788021D7BAD9D9B7F9591EC867F', 'admin-', 'PREFIX', 'TRUST', 'Reads as official (seed, R3)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    (X'01A18788021E75CE886E2D60035320EE', 'support-', 'PREFIX', 'TRUST', 'Reads as official (seed, R3)', NULL, NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
