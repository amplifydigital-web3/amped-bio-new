-- Better Auth admin plugin (1.7): ban state on users and the impersonation
-- marker on sessions. The role column already existed; the plugin keeps using it.
--
-- Idempotent: this migration was renamed twice (20261011130000, 20261022120000)
-- and staging already applied an earlier name, so the columns can already
-- exist. The database is MySQL, which has no ADD COLUMN IF NOT EXISTS, so each
-- column is added through a prepared statement only when information_schema
-- does not list it yet.

SET @add_banned = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `users` ADD COLUMN `banned` BOOLEAN NOT NULL DEFAULT false',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'banned'
);
PREPARE add_banned_stmt FROM @add_banned;
EXECUTE add_banned_stmt;
DEALLOCATE PREPARE add_banned_stmt;

SET @add_ban_reason = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `users` ADD COLUMN `banReason` VARCHAR(1024) NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'banReason'
);
PREPARE add_ban_reason_stmt FROM @add_ban_reason;
EXECUTE add_ban_reason_stmt;
DEALLOCATE PREPARE add_ban_reason_stmt;

SET @add_ban_expires = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `users` ADD COLUMN `banExpires` DATETIME(3) NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'banExpires'
);
PREPARE add_ban_expires_stmt FROM @add_ban_expires;
EXECUTE add_ban_expires_stmt;
DEALLOCATE PREPARE add_ban_expires_stmt;

SET @add_impersonated_by = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `session` ADD COLUMN `impersonatedBy` VARCHAR(255) NULL',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'session' AND COLUMN_NAME = 'impersonatedBy'
);
PREPARE add_impersonated_by_stmt FROM @add_impersonated_by;
EXECUTE add_impersonated_by_stmt;
DEALLOCATE PREPARE add_impersonated_by_stmt;

-- An earlier name may have created these with other types; align them with the schema
ALTER TABLE `users`
  MODIFY COLUMN `banned` BOOLEAN NOT NULL DEFAULT false,
  MODIFY COLUMN `banReason` VARCHAR(1024) NULL,
  MODIFY COLUMN `banExpires` DATETIME(3) NULL;

ALTER TABLE `session` MODIFY COLUMN `impersonatedBy` VARCHAR(255) NULL;
