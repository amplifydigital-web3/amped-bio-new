-- CreateTable
CREATE TABLE `oauthClient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` VARCHAR(191) NOT NULL,
    `clientSecret` TEXT NULL,
    `disabled` BOOLEAN NULL DEFAULT false,
    `skipConsent` BOOLEAN NULL,
    `enableEndSession` BOOLEAN NULL,
    `scopes` VARCHAR(191) NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NULL,
    `name` TEXT NULL,
    `uri` TEXT NULL,
    `icon` TEXT NULL,
    `contacts` VARCHAR(191) NULL,
    `tos` TEXT NULL,
    `policy` TEXT NULL,
    `softwareId` TEXT NULL,
    `softwareVersion` TEXT NULL,
    `softwareStatement` TEXT NULL,
    `redirectUris` VARCHAR(191) NOT NULL,
    `postLogoutRedirectUris` VARCHAR(191) NULL,
    `tokenEndpointAuthMethod` TEXT NULL,
    `grantTypes` VARCHAR(191) NULL,
    `responseTypes` VARCHAR(191) NULL,
    `public` BOOLEAN NULL,
    `type` TEXT NULL,
    `referenceId` TEXT NULL,
    `metadata` VARCHAR(191) NULL,

    UNIQUE INDEX `oauthClient_clientId_key`(`clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauthRefreshToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` TEXT NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `sessionId` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `referenceId` TEXT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NULL,
    `revoked` DATETIME(3) NULL,
    `scopes` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauthAccessToken` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `sessionId` INTEGER NULL,
    `userId` INTEGER NULL,
    `referenceId` TEXT NULL,
    `refreshId` INTEGER NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NULL,
    `scopes` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `oauthAccessToken_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauthConsent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` INTEGER NULL,
    `referenceId` TEXT NULL,
    `scopes` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `oauthClient` ADD CONSTRAINT `oauthClient_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthRefreshToken` ADD CONSTRAINT `oauthRefreshToken_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthRefreshToken` ADD CONSTRAINT `oauthRefreshToken_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthRefreshToken` ADD CONSTRAINT `oauthRefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthAccessToken` ADD CONSTRAINT `oauthAccessToken_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthAccessToken` ADD CONSTRAINT `oauthAccessToken_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthAccessToken` ADD CONSTRAINT `oauthAccessToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthAccessToken` ADD CONSTRAINT `oauthAccessToken_refreshId_fkey` FOREIGN KEY (`refreshId`) REFERENCES `oauthRefreshToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthConsent` ADD CONSTRAINT `oauthConsent_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthConsent` ADD CONSTRAINT `oauthConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
