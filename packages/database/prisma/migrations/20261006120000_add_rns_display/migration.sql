-- Screen Review 108 I04: the owner's RNS display settings. NULL means the defaults (all on).
ALTER TABLE `users` ADD COLUMN `rns_display` JSON NULL;
