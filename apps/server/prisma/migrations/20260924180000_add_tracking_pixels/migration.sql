-- CreateTable
CREATE TABLE `tracking_pixels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `ga4_measurement_id` VARCHAR(32) NULL,
    `meta_pixel_id` VARCHAR(32) NULL,
    `meta_capi_token_enc` TEXT NULL,
    `tiktok_pixel_id` VARCHAR(32) NULL,
    `tiktok_events_token_enc` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `tracking_pixels_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tracking_pixels` ADD CONSTRAINT `tracking_pixels_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
