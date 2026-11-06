-- Better Auth admin plugin (1.7): ban state on users and the impersonation
-- marker on sessions. The role column already existed; the plugin keeps using it.
--
-- Idempotent: this migration was renamed twice (20261011130000, 20261022120000)
-- and staging already applied an earlier name, so the columns can already
-- exist. MariaDB's IF NOT EXISTS skips them instead of failing with 1060.

ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `banned` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `banReason` VARCHAR(1024) NULL,
  ADD COLUMN IF NOT EXISTS `banExpires` DATETIME(3) NULL;

-- An earlier name created banReason as TEXT; align it with the schema
ALTER TABLE `users` MODIFY COLUMN `banReason` VARCHAR(1024) NULL;

ALTER TABLE `session` ADD COLUMN IF NOT EXISTS `impersonatedBy` VARCHAR(255) NULL;
ALTER TABLE `session` MODIFY COLUMN `impersonatedBy` VARCHAR(255) NULL;
