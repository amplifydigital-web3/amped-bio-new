-- CK-5: the store policy version the pay sheet showed (store policy 3.6)
ALTER TABLE `checkout_intents` ADD COLUMN `store_policy_version_id` BINARY(16) NULL;
