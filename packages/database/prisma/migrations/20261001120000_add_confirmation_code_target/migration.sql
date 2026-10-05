-- AlterTable: bind an email change code to the address it was sent to (Screen Review 019 I02)
ALTER TABLE `confirmation_codes` ADD COLUMN `target` VARCHAR(255) NULL;
