-- Screen Review 093 D2: record which Creator Analytics and Tracking Terms version
-- the creator accepted, and when. Existing rows stay null and are asked once.
ALTER TABLE `tracking_pixels` ADD COLUMN `terms_version` VARCHAR(32) NULL,
    ADD COLUMN `terms_accepted_at` DATETIME(3) NULL;
