-- Add persisted mafia setup mode and custom mafia count to games
ALTER TABLE `games`
  ADD COLUMN `mafia_setup_mode` ENUM('auto','custom') NOT NULL DEFAULT 'auto',
  ADD COLUMN `mafia_setup_mafia_count` INT NULL DEFAULT NULL;
