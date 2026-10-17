-- Owner assignment, phase timer, and ready-versus-submit state for Diplomacy.
ALTER TABLE `games`
  MODIFY `diplomacy_nation_mode` ENUM('pick', 'random', 'assign_all', 'one_each', 'even') NOT NULL DEFAULT 'pick',
  ADD COLUMN `diplomacy_assignments` JSON NULL AFTER `diplomacy_home_centers`,
  ADD COLUMN `diplomacy_timer_minutes` INT UNSIGNED NULL DEFAULT NULL AFTER `diplomacy_assignments`,
  ADD COLUMN `diplomacy_timer_shortcut` TINYINT(1) NOT NULL DEFAULT 0 AFTER `diplomacy_timer_minutes`,
  ADD COLUMN `diplomacy_phase_deadline` TIMESTAMP NULL DEFAULT NULL AFTER `diplomacy_timer_shortcut`;
