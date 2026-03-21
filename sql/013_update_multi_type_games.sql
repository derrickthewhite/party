USE `u709836584_party`;

-- Incremental migration for multi-type games + lifecycle controls.
-- This script is idempotent and intended for existing installations.

SET @schema_name := DATABASE();

-- users.is_admin
SET @has_is_admin := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'is_admin'
);
SET @sql := IF(
  @has_is_admin = 0,
  'ALTER TABLE `users` ADD COLUMN `is_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`',
  'SELECT ''users.is_admin exists'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- game_members.role add observer
SET @role_column_type := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'game_members'
    AND COLUMN_NAME = 'role'
  LIMIT 1
);
SET @sql := IF(
  @role_column_type LIKE '%observer%',
  'SELECT ''game_members.role already supports observer''',
  'ALTER TABLE `game_members` MODIFY COLUMN `role` ENUM(''owner'', ''player'', ''observer'') NOT NULL DEFAULT ''player''' 
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Normalize legacy generic game type to chat
UPDATE `games`
SET `game_type` = 'chat'
WHERE LOWER(`game_type`) = 'generic';

-- game_state
CREATE TABLE IF NOT EXISTS `game_state` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `phase` VARCHAR(40) NOT NULL DEFAULT 'chat',
  `current_round` INT UNSIGNED NOT NULL DEFAULT 1,
  `started_at` TIMESTAMP NULL DEFAULT NULL,
  `ended_at` TIMESTAMP NULL DEFAULT NULL,
  `winner_summary` VARCHAR(255) NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`),
  CONSTRAINT `fk_game_state_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- game_actions
CREATE TABLE IF NOT EXISTS `game_actions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `action_type` VARCHAR(40) NOT NULL,
  `payload` JSON NOT NULL,
  `round_number` INT UNSIGNED NOT NULL DEFAULT 1,
  `phase` VARCHAR(40) NOT NULL DEFAULT 'chat',
  `revealed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_game_actions_game_id` (`game_id`),
  KEY `idx_game_actions_game_round` (`game_id`, `round_number`),
  KEY `idx_game_actions_game_revealed` (`game_id`, `revealed_at`),
  CONSTRAINT `fk_game_actions_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_actions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- game_roles
CREATE TABLE IF NOT EXISTS `game_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role_key` VARCHAR(40) NOT NULL,
  `is_hidden` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_game_roles_game_user_role` (`game_id`, `user_id`, `role_key`),
  KEY `idx_game_roles_game` (`game_id`),
  CONSTRAINT `fk_game_roles_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_roles_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill game_state for existing games.
INSERT INTO `game_state` (`game_id`, `phase`, `current_round`, `started_at`, `ended_at`)
SELECT
  g.id,
  CASE
    WHEN LOWER(g.game_type) = 'mafia' THEN 'day'
    WHEN LOWER(g.game_type) = 'diplomacy' THEN 'orders'
    WHEN LOWER(g.game_type) = 'rumble' THEN 'bidding'
    ELSE 'chat'
  END,
  1,
  CASE WHEN g.status = 'in_progress' THEN NOW() ELSE NULL END,
  CASE WHEN g.status = 'closed' THEN NOW() ELSE NULL END
FROM `games` g
LEFT JOIN `game_state` gs ON gs.game_id = g.id
WHERE gs.game_id IS NULL;
