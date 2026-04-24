UPDATE `rumble_ability_definitions`
SET `template_params_json` = JSON_SET(
  COALESCE(`template_params_json`, JSON_OBJECT()),
  '$.limits',
  JSON_ARRAY_APPEND(
    COALESCE(JSON_EXTRACT(`template_params_json`, '$.limits'), JSON_ARRAY()),
    '$',
    JSON_OBJECT('kind', 'offer_min_alive_players', 'value', 3)
  )
)
WHERE `ability_id` = 'hyperdrive'
  AND JSON_CONTAINS_PATH(COALESCE(`template_params_json`, JSON_OBJECT()), 'one', '$.limits') = 1
  AND JSON_SEARCH(
    COALESCE(JSON_EXTRACT(`template_params_json`, '$.limits[*].kind'), JSON_ARRAY()),
    'one',
    'offer_min_alive_players'
  ) IS NULL;