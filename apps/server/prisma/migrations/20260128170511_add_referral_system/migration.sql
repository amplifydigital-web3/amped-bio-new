-- CreateTable
CREATE TABLE `referrals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `referrer_id` INTEGER NOT NULL,
    `referred_id` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `referrals_referrer_id_idx`(`referrer_id`),
    INDEX `referrals_referred_id_idx`(`referred_id`),
    INDEX `referrals_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `referrals_referrer_id_referred_id_key`(`referrer_id`, `referred_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrer_id_fkey` FOREIGN KEY (`referrer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referred_id_fkey` FOREIGN KEY (`referred_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
