USE `u709836584_party`;

-- Incremental migration for rumble player health state.
-- This script is idempotent and intended for existing installations.

CREATE TABLE IF NOT EXISTS `rumble_player_state` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `current_health` INT UNSIGNED NOT NULL DEFAULT 100,
  `owned_abilities_json` JSON NULL,
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

-- Backfill rumble player state for existing rumble games.
INSERT INTO `rumble_player_state` (`game_id`, `user_id`, `current_health`)
SELECT gm.game_id, gm.user_id, 100
FROM `game_members` gm
JOIN `games` g ON g.id = gm.game_id
WHERE LOWER(g.game_type) = 'rumble' AND gm.role <> 'observer'
ON DUPLICATE KEY UPDATE
  `current_health` = `rumble_player_state`.`current_health`;
