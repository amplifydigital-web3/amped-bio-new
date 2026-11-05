-- AlterTable
ALTER TABLE `content_reports` ADD COLUMN `store_user_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `purchases` ADD COLUMN `refund_requested_at` DATETIME(3) NULL,
    ADD COLUMN `refund_tx_hash` VARCHAR(66) NULL,
    ADD COLUMN `store_policy_version_id` BINARY(16) NULL;

-- CreateIndex
CREATE INDEX `purchases_refund_tx_hash_idx` ON `purchases`(`refund_tx_hash`);

