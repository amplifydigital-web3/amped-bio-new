-- CreateTable
CREATE TABLE `site_settings` (
    `setting_key` VARCHAR(191) NOT NULL,
    `setting_value` VARCHAR(191) NOT NULL,
    `value_type` ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON') NOT NULL,

    UNIQUE INDEX `site_settings_setting_key_key`(`setting_key`),
    PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
