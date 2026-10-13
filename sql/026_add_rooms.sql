-- Rooms, invite codes, and per-game room membership.
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rooms_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_rooms` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `room_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `room_id`),
  KEY `idx_user_rooms_room` (`room_id`),
  CONSTRAINT `fk_user_rooms_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_rooms_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `rooms` (`name`, `code`)
VALUES ('Main', 'party-friends-v1')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`);

ALTER TABLE `games`
  ADD COLUMN `room_id` BIGINT UNSIGNED NULL AFTER `owner_user_id`;

UPDATE `games`
SET `room_id` = (SELECT `id` FROM `rooms` WHERE `code` = 'party-friends-v1' LIMIT 1)
WHERE `room_id` IS NULL;

ALTER TABLE `games`
  MODIFY COLUMN `room_id` BIGINT UNSIGNED NOT NULL;

ALTER TABLE `games`
  ADD KEY `idx_games_room` (`room_id`);

ALTER TABLE `games`
  ADD CONSTRAINT `fk_games_room`
    FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
