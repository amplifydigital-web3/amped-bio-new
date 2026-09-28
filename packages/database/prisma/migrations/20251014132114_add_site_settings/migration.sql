-- CreateTable
CREATE TABLE `site_settings` (
    `setting_key` VARCHAR(191) NOT NULL,
    `setting_value` LONGTEXT NOT NULL,
    `value_type` ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON') NOT NULL,

    PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
