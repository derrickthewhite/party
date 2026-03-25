USE `u709836584_party`;

-- Incremental migration for the Cloaking Field rename.
-- This keeps existing rumble games usable after the internal ability id rename.

UPDATE `rumble_ability_definitions`
SET
  `ability_id` = 'cloaking_field',
  `ability_name` = 'Cloaking Field'
WHERE `ability_id` = 'cloaking_system';

UPDATE `rumble_ability_instances`
SET `ability_id` = 'cloaking_field'
WHERE `ability_id` = 'cloaking_system';

UPDATE `rumble_player_state`
SET `owned_abilities_json` = CAST(
  REPLACE(CAST(`owned_abilities_json` AS CHAR), '"cloaking_system"', '"cloaking_field"')
  AS JSON
)
WHERE CAST(`owned_abilities_json` AS CHAR) LIKE '%"cloaking_system"%';

UPDATE `game_actions`
SET `payload` = CAST(
  REPLACE(CAST(`payload` AS CHAR), '"cloaking_system"', '"cloaking_field"')
  AS JSON
)
WHERE CAST(`payload` AS CHAR) LIKE '%"cloaking_system"%';

UPDATE `rumble_round_effects`
SET
  `effect_key` = REPLACE(`effect_key`, 'cloaking_system', 'cloaking_field'),
  `payload` = CAST(
    REPLACE(CAST(`payload` AS CHAR), '"cloaking_system"', '"cloaking_field"')
    AS JSON
  )
WHERE `effect_key` LIKE '%cloaking_system%'
   OR CAST(`payload` AS CHAR) LIKE '%"cloaking_system"%';