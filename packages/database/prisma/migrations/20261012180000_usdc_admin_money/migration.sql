-- USDC in the wallet (Build Board #29), USDC-3 Admin, Money. Spec section 3.8.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- UsdcSend: relayer gas from the receipt
ALTER TABLE `usdc_sends`
  ADD COLUMN `gasUsed` BIGINT NULL,
  ADD COLUMN `gasCostWei` BIGINT NULL;

-- CreateTable
CREATE TABLE `relayer_funding_events` (
    `id` BINARY(16) NOT NULL,
    `chainId` INTEGER NOT NULL,
    `txHash` VARCHAR(66) NOT NULL,
    `fromAddress` VARCHAR(42) NOT NULL,
    `toAddress` VARCHAR(42) NOT NULL,
    `amountWei` BIGINT NOT NULL,
    `blockNumber` BIGINT NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(255) NULL,
    `recordedBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `relayer_funding_events_chainId_txHash_key`(`chainId`, `txHash`),
    INDEX `relayer_funding_events_chainId_createdAt_idx`(`chainId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
