-- CreateIndex
CREATE INDEX `verification_identifier_idx` ON `verification`(`identifier`(191));

-- CreateIndex
CREATE INDEX `two_factor_secret_idx` ON `two_factor`(`secret`(191));
