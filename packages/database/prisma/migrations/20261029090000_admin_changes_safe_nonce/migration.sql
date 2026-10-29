-- AmpedPay admin controls (Build Board #50), PAY-A2. Spec docs/features/ampedpay.md 3.6.
-- The Safe nonce of a proposed on chain change, so a later executed nonce marks it Superseded.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- AlterTable
ALTER TABLE `admin_changes` ADD COLUMN `safe_nonce` INTEGER NULL;
