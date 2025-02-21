CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `email_verified_at` datetime DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `littlelink_name` varchar(255) DEFAULT NULL,
  `littlelink_description` longtext DEFAULT NULL,
  `role` varchar(255) NOT NULL DEFAULT 'user',
  `block` varchar(255) NOT NULL DEFAULT 'no',
  `remember_token` varchar(255) DEFAULT NULL,
  `theme` varchar(255) DEFAULT NULL,
  `auth_as` int(11) DEFAULT NULL,
  `provider` varchar(255) DEFAULT NULL,
  `provider_id` varchar(255) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `reward_business_id` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  UNIQUE KEY (email),
  UNIQUE KEY (littlelink_name),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `themes` (
	`id` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`user_id` int(11) NOT NULL,
	`share_level` varchar(255) NOT NULL DEFAULT 'private',
	`share_config` JSON,
	`name` VARCHAR(255),
	`config` JSON,
	`created_at` datetime DEFAULT current_timestamp(),
    `updated_at` datetime DEFAULT NULL,
	CONSTRAINT `fk_theme_user`
		FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
		on DELETE CASCADE
		on UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE `blocks` (
	`id` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`user_id` int(11) NOT NULL,
	`block_type` varchar(255) NOT NULL,
	`order` int(11) DEFAULT 0,
	`clicks` int(11) DEFAULT 0,
	`config` JSON,
	`created_at` datetime DEFAULT current_timestamp(),
    `updated_at` datetime DEFAULT NULL,
	CONSTRAINT `fk_block_user`
		FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
		on DELETE CASCADE
		on UPDATE RESTRICT
) ENGINE=InnoDB;