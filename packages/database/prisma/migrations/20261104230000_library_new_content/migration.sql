-- FL-6 (Build Board #26): new content alerts in the bell.
-- The enum keeps MB-1's MEMBERSHIP_RENEWAL (#475, migration 20261104200000) and C12's
-- PROMOTER_CODE (migration 20261104220000), so the order of the merges does not drop a
-- value. This migration runs after both.
ALTER TABLE `notifications` MODIFY `kind` ENUM('MESSAGE', 'REQUEST', 'BROADCAST', 'MEMBERSHIP_RENEWAL', 'PROMOTER_CODE', 'CONTENT') NOT NULL;

-- null means on; false turns new content alerts off (global row creatorUserId 0, or one creator)
ALTER TABLE `notification_preferences` ADD COLUMN `newContentEnabled` BOOLEAN NULL;
