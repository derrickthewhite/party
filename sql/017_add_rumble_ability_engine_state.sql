USE `u709836584_party`;

-- Incremental migration for modular rumble ability engine state.
-- This script is idempotent and intended for existing installations.

CREATE TABLE IF NOT EXISTS `rumble_ability_instances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `owner_user_id` BIGINT UNSIGNED NOT NULL,
  `ability_id` VARCHAR(64) NOT NULL,
  `template_key` VARCHAR(80) NOT NULL,
  `template_params` JSON NOT NULL,
  `runtime_state` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `consumed_at_round` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rumble_ability_instance_owner_ability` (`game_id`, `owner_user_id`, `ability_id`),
  KEY `idx_rumble_ability_instances_game_owner` (`game_id`, `owner_user_id`),
  KEY `idx_rumble_ability_instances_game_active` (`game_id`, `is_active`),
  CONSTRAINT `fk_rumble_ability_instances_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_ability_instances_owner`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rumble_round_effects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `round_number` INT UNSIGNED NOT NULL,
  `owner_user_id` BIGINT UNSIGNED NOT NULL,
  `target_user_id` BIGINT UNSIGNED NULL,
  `ability_instance_id` BIGINT UNSIGNED NULL,
  `effect_key` VARCHAR(80) NOT NULL,
  `trigger_timing` VARCHAR(40) NOT NULL,
  `payload` JSON NOT NULL,
  `is_resolved` TINYINT(1) NOT NULL DEFAULT 0,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rumble_round_effects_game_round` (`game_id`, `round_number`),
  KEY `idx_rumble_round_effects_game_timing` (`game_id`, `trigger_timing`),
  KEY `idx_rumble_round_effects_owner` (`game_id`, `owner_user_id`),
  KEY `idx_rumble_round_effects_resolved` (`game_id`, `round_number`, `is_resolved`),
  CONSTRAINT `fk_rumble_round_effects_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_round_effects_owner`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_round_effects_target`
    FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_round_effects_instance`
    FOREIGN KEY (`ability_instance_id`) REFERENCES `rumble_ability_instances`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill ability instances from existing ownership json.
INSERT INTO `rumble_ability_instances` (`game_id`, `owner_user_id`, `ability_id`, `template_key`, `template_params`, `runtime_state`, `is_active`)
SELECT rps.`game_id`, rps.`user_id`, jt.`ability_id`, 'passive_modifier_round', JSON_OBJECT(), NULL, 1
FROM `rumble_player_state` rps
JOIN JSON_TABLE(
  COALESCE(rps.`owned_abilities_json`, JSON_ARRAY()),
  '$[*]' COLUMNS (`ability_id` VARCHAR(64) PATH '$')
) jt
WHERE jt.`ability_id` IS NOT NULL AND TRIM(jt.`ability_id`) <> ''
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP;
