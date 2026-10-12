-- QA-008: Not now on the Make your own page card. NULL means the card shows.
ALTER TABLE `user_onboarding` ADD COLUMN `publish_card_dismissed_at` DATETIME(3) NULL;
