CREATE DATABASE IF NOT EXISTS `u709836584_party`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `u709836584_party`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(40) NOT NULL,
  `srp_salt` CHAR(64) NOT NULL,
  `srp_verifier` VARCHAR(512) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `games` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `game_type` VARCHAR(60) NOT NULL DEFAULT 'chat',
  `status` ENUM('open', 'in_progress', 'closed') NOT NULL DEFAULT 'open',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_games_owner` (`owner_user_id`),
  KEY `idx_games_status_created` (`status`, `created_at`),
  CONSTRAINT `fk_games_owner_user`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_members` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('owner', 'player', 'observer') NOT NULL DEFAULT 'player',
  `joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`, `user_id`),
  KEY `idx_game_members_user` (`user_id`),
  CONSTRAINT `fk_game_members_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_messages_game_created` (`game_id`, `created_at`),
  CONSTRAINT `fk_game_messages_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_messages_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS `rumble_player_state` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `current_health` INT UNSIGNED NOT NULL DEFAULT 100,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`, `user_id`),
  KEY `idx_rumble_player_state_health` (`game_id`, `current_health`),
  CONSTRAINT `fk_rumble_player_state_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_player_state_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
