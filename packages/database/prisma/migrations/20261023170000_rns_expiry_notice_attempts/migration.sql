-- RNS name expiry notices: count the failed sends, so a broken mail transport
-- cannot flood SMTP2GO with the same reminder every hour. Applied by hand after
-- 20261023160000_rns_expiry_notices.

-- AlterTable
ALTER TABLE `rns_expiry_notices` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `rns_expiry_notices` ADD COLUMN `failedAt` DATETIME(3) NULL;
