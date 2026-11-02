-- RNS name expiry emails. Applied by hand on staging and production after merge
-- (no deploy automation runs migrate deploy). Apply after 20261022140000_telegram_messages.

-- AlterTable
ALTER TABLE `notification_preferences` ADD COLUMN `rnsRemindersEnabled` BOOLEAN NULL;

-- CreateTable
CREATE TABLE `rns_expiry_notices` (
    `id` BINARY(16) NOT NULL,
    `userId` INTEGER NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `expiry` INTEGER NOT NULL,
    `stage` VARCHAR(8) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rns_expiry_notices_sentAt_idx`(`sentAt`),
    UNIQUE INDEX `rns_expiry_notices_userId_label_expiry_stage_key`(`userId`, `label`, `expiry`, `stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rns_expiry_notices` ADD CONSTRAINT `rns_expiry_notices_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
