-- Content takedown (C7a, docs/features/content-takedown.md 4.3). Additive only.
ALTER TABLE `content_items`
    ADD COLUMN `edge_state` ENUM('OPEN', 'PRIVATE', 'BLOCKED') NOT NULL DEFAULT 'OPEN',
    ADD COLUMN `edge_dirty_at` DATETIME(3) NULL,
    ADD COLUMN `edge_attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `edge_error` VARCHAR(160) NULL,
    ADD COLUMN `hidden_at` DATETIME(3) NULL,
    ADD COLUMN `hidden_reason` VARCHAR(24) NULL;

-- CreateIndex
CREATE INDEX `content_items_edge_dirty_at_idx` ON `content_items`(`edge_dirty_at`);

-- Every existing item gets its edge state computed by the first sync run, so a
-- draft, gated, deleted or blocked item receives its KV key within minutes
UPDATE `content_items` SET `edge_dirty_at` = CURRENT_TIMESTAMP(3);
