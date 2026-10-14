-- Diplomacy maps, nation assignment, and resolved phase snapshots.
ALTER TABLE `games`
  ADD COLUMN `diplomacy_map_key` VARCHAR(80) NOT NULL DEFAULT 'EuropeDiploMap' AFTER `mafia_setup_mafia_count`,
  ADD COLUMN `diplomacy_nation_mode` ENUM('pick', 'random') NOT NULL DEFAULT 'pick' AFTER `diplomacy_map_key`,
  ADD COLUMN `diplomacy_home_centers` JSON NULL AFTER `diplomacy_nation_mode`;

ALTER TABLE `game_members`
  ADD COLUMN `diplomacy_chosen_power` VARCHAR(64) NULL DEFAULT NULL AFTER `icon_key`,
  ADD COLUMN `diplomacy_assigned_power` VARCHAR(64) NULL DEFAULT NULL AFTER `diplomacy_chosen_power`;

CREATE TABLE IF NOT EXISTS `diplomacy_phase_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `year` INT UNSIGNED NOT NULL,
  `phase` VARCHAR(40) NOT NULL,
  `position` JSON NOT NULL,
  `orders` JSON NULL,
  `resolution` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_diplomacy_snapshot_phase` (`game_id`, `year`, `phase`),
  KEY `idx_diplomacy_snapshots_game` (`game_id`, `year`),
  CONSTRAINT `fk_diplomacy_snapshots_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
