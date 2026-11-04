-- Amped Messages (Build Board #2, revision 4), PR M4. Spec docs/features/messaging.md 7.4 item 3.
-- Applied by hand on staging and production after merge. Apply after 20261103010000_messages_server.
-- One pending email check per conversation, enforced by a unique key instead of a read then
-- insert. The key is set while the job is PENDING and cleared when the loop claims it; MySQL
-- allows any number of NULLs in a unique index.

-- AlterTable
ALTER TABLE `notification_jobs` ADD COLUMN `dedupeKey` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `notification_jobs_dedupeKey_key` ON `notification_jobs`(`dedupeKey`);
