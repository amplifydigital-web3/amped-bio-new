-- Content system (Build Board #20), PR 2 foundation. Spec section 3.3.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).
-- New tables only. No existing table changes. All ids are UUID v7 in BINARY(16).

-- CreateTable
CREATE TABLE `content_items` (
    `id` BINARY(16) NOT NULL,
    `public_id` VARCHAR(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `kind` ENUM('VIDEO', 'AUDIO', 'IMAGE', 'DOCUMENT', 'FILE', 'LIVE') NOT NULL,
    `title` VARCHAR(140) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'BLOCKED', 'DELETED') NOT NULL DEFAULT 'UPLOADING',
    `processing_step` VARCHAR(40) NULL,
    `failure_reason` VARCHAR(255) NULL,
    `publish_state` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `access_rule_id` BINARY(16) NULL,
    `base_access_rule_id` BINARY(16) NULL,
    `preview_config` JSON NULL,
    `allow_download` BOOLEAN NOT NULL DEFAULT false,
    `adult` BOOLEAN NOT NULL DEFAULT false,
    `moderation_state` ENUM('PENDING', 'CLEAR', 'HELD', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `moderation_reason` VARCHAR(255) NULL,
    `duration_ms` INTEGER NULL,
    `page_count` INTEGER NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `total_bytes` BIGINT NOT NULL DEFAULT 0,
    `sha256` CHAR(64) NULL,
    `chapters` JSON NULL,
    `published_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `purge_after` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `content_items_public_id_key`(`public_id`),
    INDEX `content_items_user_id_status_idx`(`user_id`, `status`),
    INDEX `content_items_user_id_publish_state_published_at_idx`(`user_id`, `publish_state`, `published_at`),
    INDEX `content_items_access_rule_id_idx`(`access_rule_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_assets` (
    `id` BINARY(16) NOT NULL,
    `content_item_id` BINARY(16) NOT NULL,
    `role` ENUM('ORIGINAL', 'RENDITION', 'COVER', 'BLUR', 'PAGE_PREVIEW', 'WAVEFORM', 'AUDIO_PREVIEW', 'STREAM', 'PREVIEW_CLIP', 'CAPTION', 'BANNER') NOT NULL,
    `storage` ENUM('R2', 'STREAM') NOT NULL,
    `r2_key` VARCHAR(255) NULL,
    `stream_uid` VARCHAR(64) NULL,
    `lang` VARCHAR(8) NULL,
    `variant` VARCHAR(16) NULL,
    `mime_type` VARCHAR(100) NULL,
    `size` BIGINT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `duration_ms` INTEGER NULL,
    `scan_status` ENUM('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'ERROR') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `content_assets_content_item_id_role_idx`(`content_item_id`, `role`),
    INDEX `content_assets_stream_uid_idx`(`stream_uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_storage_quotas` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `bytes_limit` BIGINT NOT NULL,
    `bytes_used` BIGINT NOT NULL DEFAULT 0,
    `bytes_reserved` BIGINT NOT NULL DEFAULT 0,
    `video_minutes_limit` INTEGER NOT NULL,
    `video_minutes_used` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_storage_quotas_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_reports` (
    `id` BINARY(16) NOT NULL,
    `content_item_id` BINARY(16) NULL,
    `offer_id` BINARY(16) NULL,
    `reporter_user_id` INTEGER NULL,
    `reason` VARCHAR(20) NOT NULL,
    `details` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `content_reports_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `copyright_notices` (
    `id` BINARY(16) NOT NULL,
    `content_item_id` BINARY(16) NULL,
    `target_user_id` INTEGER NOT NULL,
    `claimant_name` VARCHAR(255) NOT NULL,
    `claimant_contact` TEXT NOT NULL,
    `work_described` TEXT NOT NULL,
    `sworn_statement` BOOLEAN NOT NULL,
    `valid` BOOLEAN NULL,
    `validated_at` DATETIME(3) NULL,
    `signature` VARCHAR(255) NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actioned_at` DATETIME(3) NULL,
    `counter_notice_at` DATETIME(3) NULL,
    `restored_at` DATETIME(3) NULL,
    `is_strike` BOOLEAN NOT NULL DEFAULT true,

    INDEX `copyright_notices_target_user_id_received_at_idx`(`target_user_id`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blocked_content_hashes` (
    `id` BINARY(16) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `blocked_content_hashes_sha256_key`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_assets` ADD CONSTRAINT `content_assets_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_storage_quotas` ADD CONSTRAINT `user_storage_quotas_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_reports` ADD CONSTRAINT `content_reports_content_item_id_fkey` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
