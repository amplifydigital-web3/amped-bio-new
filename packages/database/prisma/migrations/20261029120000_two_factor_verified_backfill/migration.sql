-- Better Auth 1.4 never wrote `two_factor.verified`, so every 2FA setup made
-- before the 1.7 upgrade kept the column default (false). Better Auth 1.7
-- rejects authenticator codes at sign in when `verified` is false (backup codes
-- skip that check), which locked those users out of app codes.
-- A user only got `two_factor_enabled = true` after verifying a code, so those
-- setups are complete. Abandoned setups (user flag still false) stay unverified.
-- Applied by hand on staging and production after merge (no deploy automation runs migrate deploy).

-- Backfill
UPDATE `two_factor` AS `tf`
INNER JOIN `users` AS `u` ON `u`.`id` = `tf`.`user_id`
SET `tf`.`verified` = true
WHERE `tf`.`verified` = false
  AND `u`.`two_factor_enabled` = true;
