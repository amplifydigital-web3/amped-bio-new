-- CreateTable
CREATE TABLE `user_onboarding` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `url_confirmed_at` DATETIME(3) NULL,
    `shared_at` DATETIME(3) NULL,
    `checklist_dismissed_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `analytics_card_dismissed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_onboarding_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_onboarding` ADD CONSTRAINT `user_onboarding_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
