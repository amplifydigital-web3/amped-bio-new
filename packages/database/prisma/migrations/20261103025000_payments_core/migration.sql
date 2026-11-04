-- AmpedPay payments core (PAY-2): purchases and indexed AmpedPay events.
-- Applied by hand on staging and production after merge (no deploy automation
-- runs migrate deploy). Apply after 20261030180000_checkout_intents.

-- CreateTable
CREATE TABLE `purchases` (
    `id` BINARY(16) NOT NULL,
    `checkout_intent_id` BINARY(16) NULL,
    `buyer_user_id` INTEGER NULL,
    `creator_user_id` INTEGER NULL,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `offer_id` BINARY(16) NULL,
    `promoter_code_id` BINARY(16) NULL,
    `chain_id` INTEGER NOT NULL,
    `payer` VARCHAR(42) NOT NULL,
    `creator_address` VARCHAR(42) NOT NULL,
    `amount` BIGINT NOT NULL,
    `fee` BIGINT NOT NULL,
    `split_hash` CHAR(66) NOT NULL,
    `split` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'prepared',
    `failure_code` VARCHAR(64) NULL,
    `tx_hash` VARCHAR(66) NULL,
    `block_number` BIGINT NULL,
    `block_hash` VARCHAR(66) NULL,
    `gas_used` BIGINT NULL,
    `gas_cost_wei` BIGINT NULL,
    `access_until` DATETIME(3) NULL,
    `soft_confirmed_at` DATETIME(3) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `receipt_sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchases_chain_id_split_hash_key`(`chain_id`, `split_hash`),
    INDEX `purchases_buyer_user_id_target_type_target_id_status_idx`(`buyer_user_id`, `target_type`, `target_id`, `status`),
    INDEX `purchases_creator_user_id_created_at_idx`(`creator_user_id`, `created_at`),
    INDEX `purchases_status_updated_at_idx`(`status`, `updated_at`),
    INDEX `purchases_tx_hash_idx`(`tx_hash`),
    INDEX `purchases_checkout_intent_id_idx`(`checkout_intent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: AmpedPay Paid, Share and Refunded logs share payment_events with USDC transfers
ALTER TABLE `payment_events` ADD COLUMN `paymentRef` CHAR(66) NULL,
    ADD COLUMN `role` INTEGER NULL,
    ADD COLUMN `splitHash` CHAR(66) NULL,
    ADD COLUMN `blockHash` VARCHAR(66) NULL;

-- CreateIndex
CREATE INDEX `payment_events_paymentRef_idx` ON `payment_events`(`paymentRef`);

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_buyer_user_id_fkey` FOREIGN KEY (`buyer_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_creator_user_id_fkey` FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
