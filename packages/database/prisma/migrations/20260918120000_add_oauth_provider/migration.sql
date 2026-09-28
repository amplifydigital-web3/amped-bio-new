-- AlterTable
ALTER TABLE `jwks` ADD COLUMN `alg` VARCHAR(191) NULL,
    ADD COLUMN `crv` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `two_factor` ADD COLUMN `failed_verification_count` INTEGER NULL DEFAULT 0,
    ADD COLUMN `locked_until` DATETIME(3) NULL;

-- CreateTable: OAuth 2.1 provider tables
-- Primary keys use BINARY(16) for UUID v7 (RFC 9562) — unpredictable,
-- time-ordered, 16 bytes raw instead of 36-char hex strings.

CREATE TABLE `oauth_client` (
    `id` BINARY(16) NOT NULL,
    `client_id` VARCHAR(255) NOT NULL,
    `client_secret` TEXT NULL,
    `client_discovery_id` VARCHAR(191) NULL,
    `disabled` BOOLEAN NULL DEFAULT false,
    `skip_consent` BOOLEAN NULL,
    `enable_end_session` BOOLEAN NULL,
    `subject_type` VARCHAR(191) NULL,
    `scopes` TEXT NULL,
    `client_credentials_scopes` TEXT NULL,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `name` VARCHAR(191) NULL,
    `uri` VARCHAR(191) NULL,
    `icon` TEXT NULL,
    `contacts` TEXT NULL,
    `tos` VARCHAR(191) NULL,
    `policy` VARCHAR(191) NULL,
    `software_id` VARCHAR(191) NULL,
    `software_version` VARCHAR(191) NULL,
    `software_statement` TEXT NULL,
    `redirect_uris` TEXT NOT NULL,
    `post_logout_redirect_uris` TEXT NULL,
    `backchannel_logout_uri` VARCHAR(191) NULL,
    `backchannel_logout_session_required` BOOLEAN NULL,
    `token_endpoint_auth_method` VARCHAR(191) NULL,
    `application_type` VARCHAR(191) NULL,
    `jwks` TEXT NULL,
    `jwks_uri` VARCHAR(191) NULL,
    `grant_types` TEXT NULL,
    `response_types` TEXT NULL,
    `require_pkce` BOOLEAN NULL,
    `dpop_bound_access_tokens` BOOLEAN NULL DEFAULT false,
    `reference_id` VARCHAR(191) NULL,
    `metadata` JSON NULL,

    UNIQUE INDEX `oauth_client_client_id_key`(`client_id`),
    INDEX `oauth_client_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_resource` (
    `id` BINARY(16) NOT NULL,
    `identifier` VARCHAR(255) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `access_token_ttl` INTEGER NULL,
    `refresh_token_ttl` INTEGER NULL,
    `signing_algorithm` VARCHAR(191) NULL,
    `signing_key_id` VARCHAR(191) NULL,
    `allowed_scopes` TEXT NULL,
    `custom_claims` JSON NULL,
    `dpop_bound_access_tokens_required` BOOLEAN NULL DEFAULT false,
    `disabled` BOOLEAN NULL DEFAULT false,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,
    `policy_version` INTEGER NULL DEFAULT 1,
    `metadata` JSON NULL,

    UNIQUE INDEX `oauth_resource_identifier_key`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_client_resource` (
    `id` BINARY(16) NOT NULL,
    `client_id` VARCHAR(255) NOT NULL,
    `resource_id` VARCHAR(255) NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NULL,

    INDEX `oauth_client_resource_client_id_idx`(`client_id`),
    INDEX `oauth_client_resource_resource_id_idx`(`resource_id`),
    UNIQUE INDEX `oauth_client_resource_client_id_resource_id_key`(`client_id`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_refresh_token` (
    `id` BINARY(16) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `client_id` VARCHAR(255) NOT NULL,
    `session_id` INTEGER NULL,
    `user_id` INTEGER NOT NULL,
    `reference_id` VARCHAR(191) NULL,
    `authorization_code_id` VARCHAR(255) NULL,
    `resources` TEXT NULL,
    `requested_user_info_claims` TEXT NULL,
    `scopes` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `revoked` DATETIME(3) NULL,
    `rotated_at` DATETIME(3) NULL,
    `rotation_replay_response` TEXT NULL,
    `rotation_replay_expires_at` DATETIME(3) NULL,
    `auth_time` DATETIME(3) NULL,
    `confirmation` JSON NULL,

    UNIQUE INDEX `oauth_refresh_token_token_key`(`token`),
    INDEX `oauth_refresh_token_client_id_idx`(`client_id`),
    INDEX `oauth_refresh_token_session_id_idx`(`session_id`),
    INDEX `oauth_refresh_token_user_id_idx`(`user_id`),
    INDEX `oauth_refresh_token_authorization_code_id_idx`(`authorization_code_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_access_token` (
    `id` BINARY(16) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `client_id` VARCHAR(255) NOT NULL,
    `session_id` INTEGER NULL,
    `user_id` INTEGER NULL,
    `reference_id` VARCHAR(191) NULL,
    `authorization_code_id` VARCHAR(255) NULL,
    `resources` TEXT NULL,
    `requested_user_info_claims` TEXT NULL,
    `refresh_id` BINARY(16) NULL,
    `scopes` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `revoked` DATETIME(3) NULL,
    `confirmation` JSON NULL,

    UNIQUE INDEX `oauth_access_token_token_key`(`token`),
    INDEX `oauth_access_token_client_id_idx`(`client_id`),
    INDEX `oauth_access_token_session_id_idx`(`session_id`),
    INDEX `oauth_access_token_user_id_idx`(`user_id`),
    INDEX `oauth_access_token_refresh_id_idx`(`refresh_id`),
    INDEX `oauth_access_token_authorization_code_id_idx`(`authorization_code_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_consent` (
    `id` BINARY(16) NOT NULL,
    `client_id` VARCHAR(255) NOT NULL,
    `user_id` INTEGER NULL,
    `reference_id` VARCHAR(191) NULL,
    `resources` TEXT NULL,
    `requested_user_info_claims` TEXT NULL,
    `scopes` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `oauth_consent_client_id_idx`(`client_id`),
    INDEX `oauth_consent_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `oauth_client_assertion` (
    `id` BINARY(16) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `device_code` (
    `id` BINARY(16) NOT NULL,
    `device_code` VARCHAR(255) NOT NULL,
    `user_code` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(255) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `last_polled_at` DATETIME(3) NULL,
    `polling_interval` INTEGER NULL,
    `client_id` VARCHAR(255) NULL,
    `scope` TEXT NULL,
    `resources` TEXT NULL,
    `oauth_client_id` VARCHAR(255) NULL,

    UNIQUE INDEX `device_code_device_code_key`(`device_code`),
    INDEX `device_code_client_id_idx`(`client_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `oauth_client` ADD CONSTRAINT `oauth_client_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `oauth_client_resource` ADD CONSTRAINT `oauth_client_resource_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `oauth_client_resource` ADD CONSTRAINT `oauth_client_resource_resource_id_fkey` FOREIGN KEY (`resource_id`) REFERENCES `oauth_resource`(`identifier`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `oauth_refresh_token` ADD CONSTRAINT `oauth_refresh_token_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `oauth_refresh_token` ADD CONSTRAINT `oauth_refresh_token_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `oauth_refresh_token` ADD CONSTRAINT `oauth_refresh_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `oauth_access_token` ADD CONSTRAINT `oauth_access_token_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `oauth_access_token` ADD CONSTRAINT `oauth_access_token_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `oauth_access_token` ADD CONSTRAINT `oauth_access_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `oauth_access_token` ADD CONSTRAINT `oauth_access_token_refresh_id_fkey` FOREIGN KEY (`refresh_id`) REFERENCES `oauth_refresh_token`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `oauth_consent` ADD CONSTRAINT `oauth_consent_client_id_fkey` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `oauth_consent` ADD CONSTRAINT `oauth_consent_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;