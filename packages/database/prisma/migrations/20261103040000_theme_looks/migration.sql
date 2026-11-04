-- Theme Engine v2 (Build Board #28), PR TE-4a: looks and history. Spec docs/features/theme-engine-v2.md 3.9.
-- Applied by hand on staging and production after merge. Additive except users.theme, which
-- changes from a string holding a theme id to an integer foreign key.

-- themes: kind (look or marketplace) and the config version written last
ALTER TABLE `themes` ADD COLUMN `config_version` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `kind` VARCHAR(16) NOT NULL DEFAULT 'look';

-- Rows with no owner are the marketplace themes
UPDATE `themes` SET `kind` = 'marketplace' WHERE `user_id` IS NULL;

-- theme_versions: the last 20 saves of a look
CREATE TABLE `theme_versions` (
    `id` BINARY(16) NOT NULL,
    `theme_id` INTEGER NOT NULL,
    `config` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `theme_versions_theme_id_created_at_idx`(`theme_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `theme_versions` ADD CONSTRAINT `theme_versions_theme_id_fkey` FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Every look starts its history with the config it holds today. The id is a
-- UUID v7 built from the save time (48 bit ms timestamp, version 7, variant
-- 10, random bits), the same layout as apps/server/src/utils/uuid-v7.ts.
INSERT INTO `theme_versions` (`id`, `theme_id`, `config`, `created_at`)
    SELECT UNHEX(CONCAT(
               LPAD(HEX(FLOOR(UNIX_TIMESTAMP(`saved_at`) * 1000)), 12, '0'),
               '7', SUBSTRING(HEX(RANDOM_BYTES(2)), 2, 3),
               HEX(0x80 | (ASCII(RANDOM_BYTES(1)) & 0x3F)),
               SUBSTRING(HEX(RANDOM_BYTES(7)), 1, 14))),
           `id`, `config`, `saved_at`
    FROM (
        SELECT `id`, `config`, COALESCE(`updated_at`, `created_at`) AS `saved_at`
        FROM `themes`
        WHERE `user_id` IS NOT NULL AND `config` IS NOT NULL
    ) AS `looks`;

-- users.theme to an integer id. Values that are not a number, or name a theme
-- that no longer exists, become NULL first (the page then renders the default
-- theme, as it does today for a dangling id).
UPDATE `users` SET `theme` = NULL
    WHERE `theme` IS NOT NULL
      AND (`theme` NOT REGEXP '^[0-9]+$'
           OR NOT EXISTS (SELECT 1 FROM `themes` WHERE `themes`.`id` = CAST(`users`.`theme` AS UNSIGNED)));

ALTER TABLE `users` MODIFY `theme` INTEGER NULL;

ALTER TABLE `users` ADD CONSTRAINT `users_theme_fkey` FOREIGN KEY (`theme`) REFERENCES `themes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
