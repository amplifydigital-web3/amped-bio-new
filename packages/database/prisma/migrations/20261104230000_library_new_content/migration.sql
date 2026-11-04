-- FL-6 (Build Board #26): new content alerts in the bell.
-- The enum keeps MB-1's MEMBERSHIP_RENEWAL (#475, migration 20261104200000), so the
-- order of the two merges does not drop a value. Merge #475 before this PR.
ALTER TABLE `notifications` MODIFY `kind` ENUM('MESSAGE', 'REQUEST', 'BROADCAST', 'MEMBERSHIP_RENEWAL', 'CONTENT') NOT NULL;

-- null means on; false turns new content alerts off (global row creatorUserId 0, or one creator)
ALTER TABLE `notification_preferences` ADD COLUMN `newContentEnabled` BOOLEAN NULL;
