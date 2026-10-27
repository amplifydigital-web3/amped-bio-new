-- AlterTable
ALTER TABLE `ndau_conversions` ADD COLUMN `claimed_at` DATETIME(3) NULL,
    ADD COLUMN `claimed_by` INTEGER NULL,
    MODIFY `txid` VARCHAR(66) NULL;

-- CreateIndex: one on-chain transfer can pay only one conversion (NULLs are not unique)
CREATE UNIQUE INDEX `ndau_conversions_txid_key` ON `ndau_conversions`(`txid`);
