-- #28 F1 (adult content review, revision 6): store when an item was found explicit.
-- Set by the classifier callback or a reviewer. While set, the owner can not turn the
-- 18+ label off. Nullable, no backfill: items processed before this column exist are
-- covered by the fallback in content.update (unlabeling a READY item holds it).
ALTER TABLE `content_items` ADD COLUMN `explicit_at` DATETIME(3) NULL;
