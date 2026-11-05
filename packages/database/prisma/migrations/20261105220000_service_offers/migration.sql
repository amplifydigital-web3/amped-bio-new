-- AB-2 Authbase storefront: service offers with external fulfillment (docs/features/authbase-storefront.md 3.3, 3.10)
ALTER TABLE `offers`
    ADD COLUMN `fulfillment` VARCHAR(12) NOT NULL DEFAULT 'library',
    ADD COLUMN `external_code` VARCHAR(32) NULL,
    ADD COLUMN `placement` VARCHAR(32) NULL,
    ADD COLUMN `features` JSON NULL,
    ADD COLUMN `tag` VARCHAR(24) NULL,
    ADD COLUMN `rank` INTEGER NOT NULL DEFAULT 0;
CREATE INDEX `offers_placement_status_idx` ON `offers`(`placement`, `status`);

ALTER TABLE `purchases`
    ADD COLUMN `fulfillment_state` VARCHAR(16) NULL,
    ADD COLUMN `rns_name` VARCHAR(64) NULL;

ALTER TABLE `checkout_intents` ADD COLUMN `rns_name` VARCHAR(64) NULL;
