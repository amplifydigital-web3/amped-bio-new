/*
  Warnings:

  - You are about to drop the column `creatorCut` on the `creator_pools` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `creator_pools` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `creator_pools` DROP COLUMN `creatorCut`,
    DROP COLUMN `name`;
