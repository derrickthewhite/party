USE `u709836584_party`;

-- Incremental migration for rumble player ship names.
-- This script is idempotent and intended for existing installations.

SET @has_ship_name := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rumble_player_state'
    AND COLUMN_NAME = 'ship_name'
);

SET @ddl_ship_name := IF(
  @has_ship_name = 0,
  'ALTER TABLE `rumble_player_state` ADD COLUMN `ship_name` VARCHAR(60) NULL AFTER `current_health`',
  'SELECT 1'
);

PREPARE stmt_ship_name FROM @ddl_ship_name;
EXECUTE stmt_ship_name;
DEALLOCATE PREPARE stmt_ship_name;
