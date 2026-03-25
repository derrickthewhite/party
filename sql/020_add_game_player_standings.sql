USE `u709836584_party`;

-- Generic placement storage so multiple game types can persist final rankings.

CREATE TABLE IF NOT EXISTS `game_player_standings` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `final_rank` INT UNSIGNED NULL DEFAULT NULL,
  `eliminated_round` INT UNSIGNED NULL DEFAULT NULL,
  `elimination_order` INT UNSIGNED NULL DEFAULT NULL,
  `result_status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`, `user_id`),
  KEY `idx_game_player_standings_rank` (`game_id`, `final_rank`),
  KEY `idx_game_player_standings_elimination_order` (`game_id`, `elimination_order`),
  CONSTRAINT `fk_game_player_standings_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_player_standings_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `game_player_standings` (`game_id`, `user_id`, `result_status`)
SELECT gm.game_id, gm.user_id, 'active'
FROM `game_members` gm
JOIN `users` u ON u.id = gm.user_id
WHERE u.is_active = 1
ON DUPLICATE KEY UPDATE
  `result_status` = `game_player_standings`.`result_status`;