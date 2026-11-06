-- Amped Messages M9 (spec 6, bc-audience): broadcasts go to pool stakers, followers, or both.
-- Existing ALL_MEMBERS rows were pool broadcasts and become POOL_MEMBERS.
ALTER TABLE `broadcasts` MODIFY `audienceKind` ENUM('ALL_MEMBERS', 'POOL_MEMBERS', 'FOLLOWERS', 'POOL_AND_FOLLOWERS') NOT NULL DEFAULT 'ALL_MEMBERS';
UPDATE `broadcasts` SET `audienceKind` = 'POOL_MEMBERS' WHERE `audienceKind` = 'ALL_MEMBERS';
ALTER TABLE `broadcasts` MODIFY `audienceKind` ENUM('POOL_MEMBERS', 'FOLLOWERS', 'POOL_AND_FOLLOWERS') NOT NULL DEFAULT 'POOL_MEMBERS';

