-- CreateTable
CREATE TABLE `ndau_conversions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ndau_address` VARCHAR(255) NOT NULL,
    `ndau_amount` TEXT NOT NULL,
    `revo_amount` TEXT NOT NULL,
    `revo_address` VARCHAR(255) NOT NULL,
    `ampedbio_signature` TEXT NOT NULL,
    `ndau_signature` TEXT NOT NULL,
    `ndau_validation_key` TEXT NOT NULL,
    `txid` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    INDEX `ndau_conversions_status_idx`(`status`),
    INDEX `ndau_conversions_created_at_idx`(`created_at`),
    UNIQUE INDEX `ndau_conversions_ndau_address_key`(`ndau_address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
