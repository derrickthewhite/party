USE `u709836584_party`;

-- Incremental migration for rumble ability ownership state.
-- This script is idempotent and intended for existing installations.

SET @has_owned_abilities_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rumble_player_state'
    AND COLUMN_NAME = 'owned_abilities_json'
);

SET @ddl_owned_abilities_json := IF(
  @has_owned_abilities_json = 0,
  'ALTER TABLE `rumble_player_state` ADD COLUMN `owned_abilities_json` JSON NULL AFTER `current_health`',
  'SELECT 1'
);

PREPARE stmt_owned_abilities_json FROM @ddl_owned_abilities_json;
EXECUTE stmt_owned_abilities_json;
DEALLOCATE PREPARE stmt_owned_abilities_json;

UPDATE `rumble_player_state`
SET `owned_abilities_json` = JSON_ARRAY()
WHERE `owned_abilities_json` IS NULL;
