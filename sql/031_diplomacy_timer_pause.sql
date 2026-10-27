-- Owner/admin pause for the Diplomacy phase timer.
ALTER TABLE `games`
  ADD COLUMN `diplomacy_timer_paused` TINYINT(1) NOT NULL DEFAULT 0 AFTER `diplomacy_phase_deadline`,
  ADD COLUMN `diplomacy_timer_remaining_seconds` INT UNSIGNED NULL DEFAULT NULL AFTER `diplomacy_timer_paused`;
