-- Adult content review and Safety, PR R1 (Build Board #28,
-- docs/features/adult-content-review.md section 10, revision 6). Additive only.
-- Apply after 20261104120000_content_edge_state (C7a).

-- Existing tables
ALTER TABLE `content_items` ADD COLUMN `ai_label` BOOLEAN NULL;

ALTER TABLE `content_reports` ADD COLUMN `case_id` BINARY(16) NULL;

ALTER TABLE `blocked_content_hashes`
    ADD COLUMN `phash` VARCHAR(64) NULL,
    ADD COLUMN `case_id` BINARY(16) NULL,
    ADD COLUMN `added_by_id` INTEGER NULL,
    ADD COLUMN `removed_at` DATETIME(3) NULL;

CREATE INDEX `blocked_content_hashes_phash_idx` ON `blocked_content_hashes`(`phash`);

-- CreatorAdultProfile
CREATE TABLE `creator_adult_profiles` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `enabled_at` DATETIME(3) NULL,
    `policy_version` VARCHAR(16) NULL,
    `custodian_name` TEXT NULL,
    `custodian_address` TEXT NULL,
    `disabled_at` DATETIME(3) NULL,
    `disabled_by` INTEGER NULL,
    `disabled_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `creator_adult_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AppearingPerson
CREATE TABLE `appearing_people` (
    `id` BINARY(16) NOT NULL,
    `creator_user_id` INTEGER NOT NULL,
    `person_user_id` INTEGER NULL,
    `display_name` VARCHAR(80) NOT NULL,
    `invite_hash` CHAR(64) NULL,
    `invite_expires` DATETIME(3) NULL,
    `release_version` VARCHAR(16) NULL,
    `release_name` TEXT NULL,
    `release_options` JSON NULL,
    `id_given_confirmed_at` DATETIME(3) NULL,
    `release_at` DATETIME(3) NULL,
    `release_text` TEXT NULL,
    `release_hash` CHAR(64) NULL,
    `check_reference` VARCHAR(64) NULL,
    `check_date` DATETIME(3) NULL,
    `creator_signed_at` DATETIME(3) NULL,
    `withdrawn_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `appearing_people_invite_hash_key`(`invite_hash`),
    INDEX `appearing_people_creator_user_id_idx`(`creator_user_id`),
    INDEX `appearing_people_person_user_id_idx`(`person_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContentItemPerson
CREATE TABLE `content_item_people` (
    `content_item_id` BINARY(16) NOT NULL,
    `person_id` BINARY(16) NOT NULL,
    `release_id` BINARY(16) NOT NULL,
    `production_dates` JSON NOT NULL,

    PRIMARY KEY (`content_item_id`, `person_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SafetyCase
CREATE TABLE `safety_cases` (
    `id` BINARY(16) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `type` ENUM('CHILD_SAFETY', 'TAKE_IT_DOWN', 'AGE_RESULT', 'ADULT_REVIEW', 'CLASSIFIER_HOLD', 'STORE_POLICY', 'REPORT', 'APPEAL', 'ADULT_SETUP', 'COPYRIGHT') NOT NULL,
    `severity` INTEGER NOT NULL,
    `state` ENUM('OPEN', 'CLAIMED', 'WAITING_CREATOR', 'DECIDED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `content_item_id` BINARY(16) NULL,
    `offer_id` BINARY(16) NULL,
    `store_policy_version_id` BINARY(16) NULL,
    `creator_user_id` INTEGER NULL,
    `request_id` BINARY(16) NULL,
    `parent_case_id` BINARY(16) NULL,
    `assignee_id` INTEGER NULL,
    `claimed_at` DATETIME(3) NULL,
    `due_at` DATETIME(3) NOT NULL,
    `outcome` VARCHAR(24) NULL,
    `reason_code` VARCHAR(32) NULL,
    `decided_by_id` INTEGER NULL,
    `decided_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `safety_cases_number_key`(`number`),
    INDEX `safety_cases_state_due_at_idx`(`state`, `due_at`),
    INDEX `safety_cases_creator_user_id_created_at_idx`(`creator_user_id`, `created_at`),
    INDEX `safety_cases_content_item_id_idx`(`content_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SafetyEvent (append only)
CREATE TABLE `safety_events` (
    `id` BINARY(16) NOT NULL,
    `case_id` BINARY(16) NULL,
    `actor_id` INTEGER NULL,
    `action` VARCHAR(32) NOT NULL,
    `detail` JSON NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `safety_events_case_id_created_at_idx`(`case_id`, `created_at`),
    INDEX `safety_events_actor_id_created_at_idx`(`actor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- TakedownRequest
CREATE TABLE `takedown_requests` (
    `id` BINARY(16) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `kind` VARCHAR(12) NOT NULL DEFAULT 'ncii',
    `counter_of_id` BINARY(16) NULL,
    `status_key_hash` CHAR(64) NOT NULL,
    `relationship` VARCHAR(16) NOT NULL,
    `agent_detail` VARCHAR(160) NULL,
    `contact_email` TEXT NOT NULL,
    `contact_phone` TEXT NULL,
    `signature` TEXT NOT NULL,
    `statement` TEXT NULL,
    `work_description` TEXT NULL,
    `postal_address` TEXT NULL,
    `jurisdiction_consent` BOOLEAN NULL,
    `locations` JSON NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `due_at` DATETIME(3) NOT NULL,
    `restore_from` DATETIME(3) NULL,
    `restore_by` DATETIME(3) NULL,
    `suit_filed_at` DATETIME(3) NULL,
    `suit_reference` VARCHAR(120) NULL,
    `closed_at` DATETIME(3) NULL,
    `outcome` VARCHAR(16) NULL,

    UNIQUE INDEX `takedown_requests_number_key`(`number`),
    INDEX `takedown_requests_closed_at_due_at_idx`(`closed_at`, `due_at`),
    INDEX `takedown_requests_kind_closed_at_idx`(`kind`, `closed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Strike
CREATE TABLE `strikes` (
    `id` BINARY(16) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `case_id` BINARY(16) NOT NULL,
    `reason_code` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reversed_at` DATETIME(3) NULL,

    INDEX `strikes_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
