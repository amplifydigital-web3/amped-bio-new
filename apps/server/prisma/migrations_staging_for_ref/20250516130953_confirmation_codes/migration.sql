-- AlterTable
ALTER TABLE `blocks` MODIFY `type` VARCHAR(255) NOT NULL;

-- CreateTable
CREATE TABLE `confirmation_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` CHAR(6) NOT NULL,
    `type` ENUM('EMAIL_CONFIRMATION', 'EMAIL_CHANGE', 'PASSWORD_RESET') NOT NULL,
    `userId` INTEGER NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NULL,

    INDEX `confirmation_codes_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `confirmation_codes` ADD CONSTRAINT `confirmation_codes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
