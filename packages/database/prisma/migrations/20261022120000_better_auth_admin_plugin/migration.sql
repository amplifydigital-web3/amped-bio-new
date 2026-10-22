-- Better Auth admin plugin (1.7): ban state on users and the impersonation
-- marker on sessions. The role column already existed; the plugin keeps using it.

ALTER TABLE `users`
  ADD COLUMN `banned` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `banReason` VARCHAR(1024) NULL,
  ADD COLUMN `banExpires` DATETIME(3) NULL;

ALTER TABLE `session` ADD COLUMN `impersonatedBy` VARCHAR(255) NULL;
