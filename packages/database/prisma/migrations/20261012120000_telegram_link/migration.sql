-- Messaging on Telegram (Build Board #2), PR 2 link and notify. Spec section 3.3.
-- Applied by hand on staging and production after merge.

-- NotificationPreference.telegramEnabled becomes nullable. On the global row
-- (creatorUserId 0) it is the user's opt in; on a creator row, null follows the
-- global row and false turns that creator off. Existing rows were all false,
-- which only ever meant "not set", so they become null.
ALTER TABLE `notification_preferences` MODIFY `telegramEnabled` BOOLEAN NULL;
UPDATE `notification_preferences` SET `telegramEnabled` = NULL WHERE `telegramEnabled` = false;

-- Broadcast: the creator ticked Telegram in the composer
ALTER TABLE `broadcasts` ADD COLUMN `sendTelegram` BOOLEAN NOT NULL DEFAULT false;
