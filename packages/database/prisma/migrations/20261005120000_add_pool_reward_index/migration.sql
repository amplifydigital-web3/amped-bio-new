-- Screen Review 067 to 069: index pool reward events for My Pool
ALTER TABLE `creator_pools` ADD COLUMN `rewards_received` VARCHAR(78) NOT NULL DEFAULT '0',
    ADD COLUMN `rewards_indexed_block` VARCHAR(30) NULL;
