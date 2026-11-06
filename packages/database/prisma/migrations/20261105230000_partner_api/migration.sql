-- AB-4 Authbase storefront: Partner API keys, webhooks and deliveries (spec 3.9, partner spec 8 and 9)
CREATE TABLE `merchant_api_keys` (
    `id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `mode` VARCHAR(8) NOT NULL,
    `prefix` VARCHAR(16) NOT NULL,
    `key_hash` CHAR(64) NOT NULL,
    `created_by_id` INTEGER NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `merchant_api_keys_key_hash_key`(`key_hash`),
    INDEX `merchant_api_keys_merchant_id_idx`(`merchant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webhook_endpoints` (
    `id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `secret_box` TEXT NOT NULL,
    `events` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'active',
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `webhook_endpoints_merchant_id_status_idx`(`merchant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webhook_deliveries` (
    `id` BINARY(16) NOT NULL,
    `endpoint_id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `event_id` VARCHAR(40) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `order_ref` VARCHAR(40) NULL,
    `payload` JSON NOT NULL,
    `attempt` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `next_attempt_at` DATETIME(3) NOT NULL,
    `claimed_until` DATETIME(3) NULL,
    `response_code` INTEGER NULL,
    `last_error` VARCHAR(255) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `webhook_deliveries_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `webhook_deliveries_merchant_id_created_at_idx`(`merchant_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `partner_idempotency_keys` (
    `id` BINARY(16) NOT NULL,
    `merchant_id` BINARY(16) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `route` VARCHAR(80) NOT NULL,
    `status` INTEGER NOT NULL,
    `response` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `partner_idempotency_keys_merchant_id_key_key`(`merchant_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
