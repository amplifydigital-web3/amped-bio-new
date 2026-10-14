-- QA-034: count fan-out runs so a broadcast that keeps failing stops at a cap and is marked FAILED.
ALTER TABLE `broadcasts` ADD COLUMN `sendAttempts` INTEGER NOT NULL DEFAULT 0;
