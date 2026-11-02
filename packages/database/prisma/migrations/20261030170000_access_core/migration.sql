-- Access gating engine core (Build Board #21, docs/features/access-gating-engine.md, PR G1).
-- Applied by hand on staging and production after merge (no deploy automation
-- runs migrate deploy). Apply after 20261030160000_identity_checks (PR I1).
-- No code writes content_items.access_rule_id yet, so the new foreign key
-- cannot fail on existing rows. Check first:
--   SELECT COUNT(*) FROM content_items WHERE access_rule_id IS NOT NULL;  -- expect 0

-- CreateTable
CREATE TABLE `access_rules` (
    `id` BINARY(16) NOT NULL,
    `owner_user_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NULL,
    `kind` VARCHAR(24) NOT NULL,
    `params` JSON NOT NULL,
    `opens_to_all_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `access_rules_owner_user_id_idx`(`owner_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `access_events` (
    `id` BINARY(16) NOT NULL,
    `rule_id` BINARY(16) NULL,
    `owner_user_id` INTEGER NOT NULL,
    `resource` VARCHAR(80) NOT NULL,
    `viewer_key` VARCHAR(24) NOT NULL,
    `type` VARCHAR(24) NOT NULL,
    `reason` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `access_events_owner_user_id_created_at_idx`(`owner_user_id`, `created_at`),
    INDEX `access_events_rule_id_created_at_idx`(`rule_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `blocks` ADD COLUMN `access_rule_id` BINARY(16) NULL;

-- CreateIndex
CREATE INDEX `blocks_access_rule_id_idx` ON `blocks`(`access_rule_id`);

-- AddForeignKey (NoAction, decision GQ2: never cascade a user delete into rules)
ALTER TABLE `access_rules` ADD CONSTRAINT `access_rules_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey (Restrict: a rule in use cannot be deleted)
ALTER TABLE `blocks` ADD CONSTRAINT `blocks_access_rule_id_fkey` FOREIGN KEY (`access_rule_id`) REFERENCES `access_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (Restrict: a rule in use cannot be deleted)
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_access_rule_id_fkey` FOREIGN KEY (`access_rule_id`) REFERENCES `access_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
