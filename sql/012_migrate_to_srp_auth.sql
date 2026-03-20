USE `u709836584_party`;

-- This migration removes password-hash auth and migrates to SRP verifier auth.
-- Existing users and user-owned game data are removed during development rollout.

DELETE FROM `game_messages`;
DELETE FROM `game_members`;
DELETE FROM `games`;
DELETE FROM `users`;

ALTER TABLE `game_messages` AUTO_INCREMENT = 1;
ALTER TABLE `games` AUTO_INCREMENT = 1;
ALTER TABLE `users` AUTO_INCREMENT = 1;

ALTER TABLE `users`
  DROP COLUMN `password_hash`,
  ADD COLUMN `srp_salt` CHAR(64) NOT NULL AFTER `username`,
  ADD COLUMN `srp_verifier` VARCHAR(512) NOT NULL AFTER `srp_salt`;
