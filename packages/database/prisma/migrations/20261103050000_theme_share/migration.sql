-- Theme Engine v2 (Build Board #28), PR TE-4b: share links. Spec docs/features/theme-engine-v2.md 3.9.
-- Applied by hand on staging and production after merge. Apply after 20261103040000_theme_looks.
-- Additive: no look is shared until its creator makes a link.

-- AlterTable
ALTER TABLE `themes` ADD COLUMN `share_credit` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `share_download` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `share_slug` VARCHAR(48) NULL,
    ADD COLUMN `share_uses` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `themes_share_slug_key` ON `themes`(`share_slug`);
