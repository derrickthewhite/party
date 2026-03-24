USE `u709836584_party`;

-- Incremental migration for DB-backed rumble ability definitions and template catalog.
-- This script is idempotent and intended for existing installations.

CREATE TABLE IF NOT EXISTS `rumble_ability_templates` (
  `template_key` VARCHAR(80) NOT NULL,
  `template_kind` VARCHAR(32) NOT NULL,
  `template_inputs_json` JSON NOT NULL,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_key`),
  KEY `idx_rumble_ability_templates_enabled` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rumble_ability_definitions` (
  `ability_id` VARCHAR(64) NOT NULL,
  `ability_name` VARCHAR(120) NOT NULL,
  `template_type` VARCHAR(64) NOT NULL,
  `template_key` VARCHAR(80) NOT NULL,
  `tags_json` JSON NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `template_params_json` JSON NOT NULL,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ability_id`),
  KEY `idx_rumble_ability_defs_enabled` (`is_enabled`),
  KEY `idx_rumble_ability_defs_template` (`template_key`),
  CONSTRAINT `fk_rumble_ability_defs_template`
    FOREIGN KEY (`template_key`) REFERENCES `rumble_ability_templates`(`template_key`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `rumble_ability_templates` (`template_key`, `template_kind`, `template_inputs_json`, `is_enabled`)
VALUES
  ('activated_spend_with_target_policy', 'activated', JSON_OBJECT(
    'target_user_id', JSON_OBJECT('type', 'int', 'required', false),
    'x_cost', JSON_OBJECT('type', 'int', 'required', false, 'min', 0),
    'is_enabled', JSON_OBJECT('type', 'bool', 'required', false)
  ), 1),
  ('activated_self_or_toggle', 'activated', JSON_OBJECT(
    'mode', JSON_OBJECT('type', 'string', 'required', false),
    'x_cost', JSON_OBJECT('type', 'int', 'required', false, 'min', 0),
    'is_enabled', JSON_OBJECT('type', 'bool', 'required', false)
  ), 1),
  ('activated_defense_mode', 'activated', JSON_OBJECT(
    'target_user_id', JSON_OBJECT('type', 'int', 'required', false),
    'x_cost', JSON_OBJECT('type', 'int', 'required', false, 'min', 0),
    'is_enabled', JSON_OBJECT('type', 'bool', 'required', false)
  ), 1),
  ('passive_modifier_round', 'passive', JSON_OBJECT(), 1),
  ('trigger_on_attacked', 'triggered', JSON_OBJECT(), 1),
  ('trigger_on_defeat_single_use', 'triggered', JSON_OBJECT(), 1),
  ('round_start_effect', 'passive', JSON_OBJECT(), 1),
  ('round_end_effect', 'passive', JSON_OBJECT(), 1),
  ('condition_tracker', 'condition', JSON_OBJECT(), 1)
ON DUPLICATE KEY UPDATE
  `template_kind` = VALUES(`template_kind`),
  `template_inputs_json` = VALUES(`template_inputs_json`),
  `is_enabled` = VALUES(`is_enabled`),
  `updated_at` = CURRENT_TIMESTAMP;

INSERT INTO `rumble_ability_definitions` (
  `ability_id`, `ability_name`, `template_type`, `template_key`, `tags_json`, `description`, `template_params_json`, `is_enabled`
)
VALUES
  ('meson_beam', 'Meson Beam', 'activated_attack', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'single_target', 'unblockable'), 'Spend 10 Energy. Deal 5 unblockable damage to one opponent.', JSON_OBJECT(
    'target_policy', 'single_opponent',
    'cost_mode', 'fixed',
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 10),
    'effect_formula', JSON_OBJECT('kind', 'damage_constant', 'value', 5, 'channel', 'unblockable')
  ), 1),
  ('heavy_meson_beam', 'Heavy Meson Beam', 'activated_attack', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'single_target', 'unblockable'), 'Spend 20 Energy. Deal 10 unblockable damage to one opponent.', JSON_OBJECT(
    'target_policy', 'single_opponent',
    'cost_mode', 'fixed',
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 20),
    'effect_formula', JSON_OBJECT('kind', 'damage_constant', 'value', 10, 'channel', 'unblockable')
  ), 1),
  ('ion_beam', 'Ion Beam', 'activated_attack', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'single_target', 'defense_only'), 'Spend 10 Energy. Deal 20 defense-only damage to one opponent.', JSON_OBJECT(
    'target_policy', 'single_opponent',
    'cost_mode', 'fixed',
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 10),
    'effect_formula', NULL
  ), 1),
  ('loitering_munitions', 'Loitering Munitions', 'activated_attack', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'single_target', 'delayed'), 'Spend X Energy. At the start of next round, deal X damage to one opponent.', JSON_OBJECT(
    'target_policy', 'single_opponent',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'variable_x'),
    'effect_formula', NULL
  ), 1),
  ('torpedo_bays', 'Torpedo Bays', 'activated_attack_modifier', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'delayed', 'modifier'), 'Spend X Energy. Next round, add X bonus damage to one attack.', JSON_OBJECT(
    'target_policy', 'optional_target',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'variable_x'),
    'effect_formula', NULL
  ), 1),
  ('efficient_targeting', 'Efficient Targeting', 'activated_attack_modifier', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'cost_reduction'), 'Spend 10 Energy. Your second-largest attack this round costs 0 Energy.', JSON_OBJECT(
    'target_policy', 'optional_target',
    'cost_mode', 'fixed',
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 10),
    'effect_formula', NULL
  ), 1),
  ('phase_bomb', 'Phase Bomb', 'activated_attack', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'aoe'), 'Spend X Energy. Deal floor(X/2) damage to all other opponents.', JSON_OBJECT(
    'target_policy', 'all_other_players',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'variable_x'),
    'effect_formula', JSON_OBJECT('kind', 'damage_floor_half_x', 'channel', 'normal')
  ), 1),
  ('mine_layer', 'Mine Layer', 'activated_defense_trigger', 'trigger_on_attacked', JSON_ARRAY('defense', 'retaliation'), 'Spend X Energy. This round, each player who attacks you takes floor(X/2) damage.', JSON_OBJECT(), 1),
  ('hailing_frequencies', 'Hailing Frequencies', 'utility_status', 'activated_self_or_toggle', JSON_ARRAY('utility', 'status', 'duel_lockout'), 'Choose one opponent. Next round, neither of you may attack the other. Not valid if only two players remain.', JSON_OBJECT(), 1),
  ('scheming', 'Scheming', 'trigger_on_attacked', 'trigger_on_attacked', JSON_ARRAY('defense', 'retaliation', 'burn'), 'Burn 10. Choose one opponent. If that opponent attacks you this round, you ignore their largest attack and they take that much damage.', JSON_OBJECT(), 1),
  ('death_ray', 'Death Ray', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('attack', 'passive'), 'Passive. If you make exactly one attack this round, increase that attack by 50%.', JSON_OBJECT(), 1),
  ('heavy_guns', 'Heavy Guns', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('attack', 'passive'), 'Passive. Each of your attacks deals +10 damage.', JSON_OBJECT(), 1),
  ('holoship', 'Holoship', 'passive_modifier', 'round_end_effect', JSON_ARRAY('defense', 'passive', 'upkeep_cost'), 'Passive. You cannot be targeted by attacks. At end of round, lose 5 Health.', JSON_OBJECT(), 1),
  ('hyperdrive', 'Hyperdrive', 'utility_status', 'activated_self_or_toggle', JSON_ARRAY('utility', 'status', 'burn', 'win_condition'), 'Burn 5 to enter or leave Hyperspace. In Hyperspace, you cannot attack or be attacked.', JSON_OBJECT(), 1),
  ('cloaking_system', 'Cloaking System', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'delayed', 'burn'), 'Spend 20 Energy and Burn 5. You cannot be attacked next round.', JSON_OBJECT(
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 20)
  ), 1),
  ('shield_capacitors', 'Shield Capacitors', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense'), 'Spend 10 Energy. Gain +20 Defense this round.', JSON_OBJECT(
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 10)
  ), 1),
  ('shield_boosters', 'Shield Boosters', 'round_start_effect', 'round_start_effect', JSON_ARRAY('defense', 'passive'), 'Passive. Gain +20 Defense at the start of each round.', JSON_OBJECT(), 1),
  ('reflective_shield', 'Reflective Shield', 'trigger_on_attacked', 'trigger_on_attacked', JSON_ARRAY('defense', 'retaliation', 'passive'), 'Passive. Whenever you take attack damage, the attacker takes half that damage.', JSON_OBJECT(), 1),
  ('energy_absorption', 'Energy Absorption', 'round_start_effect', 'round_start_effect', JSON_ARRAY('resource', 'delayed'), 'Spend 10 Energy. At the start of next round, gain Energy equal to half the damage your Defense blocked this round.', JSON_OBJECT(), 1),
  ('armor', 'Armor', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('defense', 'passive'), 'Passive. Reduce each incoming attack by 5.', JSON_OBJECT(
    'reduction_per_attack', 5
  ), 1),
  ('heavy_armor', 'Heavy Armor', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('defense', 'passive'), 'Passive. Reduce each incoming attack by 10.', JSON_OBJECT(
    'reduction_per_attack', 10
  ), 1),
  ('backup_generator', 'Backup Generator', 'trigger_on_defeat', 'trigger_on_defeat_single_use', JSON_ARRAY('survival', 'single_use'), 'Triggered. If reduced to 0 Health, lose this ability and set Health to 30.', JSON_OBJECT(
    'trigger', 'on_defeat',
    'single_use', true,
    'restore_health', 30
  ), 1),
  ('escape_pods', 'Escape Pods', 'trigger_on_defeat', 'trigger_on_defeat_single_use', JSON_ARRAY('survival', 'single_use'), 'Triggered. If reduced to 0 Health, lose this ability and set Health to 20.', JSON_OBJECT(
    'trigger', 'on_defeat',
    'single_use', true,
    'restore_health', 20
  ), 1),
  ('nimble_dodge', 'Nimble Dodge', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'single_attack_negation'), 'Spend 10 Energy. Negate the largest attack against you this round. Not valid if only two players remain.', JSON_OBJECT(
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 10)
  ), 1),
  ('focused_defense', 'Focused Defense', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'single_opponent'), 'Choose one opponent. Halve attacks from that opponent this round.', JSON_OBJECT(), 1),
  ('turbo_generator', 'Turbo Generator', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('resource', 'passive'), 'Passive. Your per-round Energy is Health + 10.', JSON_OBJECT(), 1),
  ('mcguffin_generator', 'McGuffin Generator', 'trigger_on_round', 'condition_tracker', JSON_ARRAY('healing', 'timed_trigger'), 'Triggered. At the start of round 3, gain 50 Health.', JSON_OBJECT(
    'evaluation_window', 'round_start',
    'round_number', 3,
    'outcome', JSON_OBJECT('kind', 'heal_constant', 'value', 50)
  ), 1),
  ('courier_mission', 'Courier Mission', 'win_condition', 'condition_tracker', JSON_ARRAY('win_condition'), 'Win condition. If you are alive at end of round 10, you win.', JSON_OBJECT(
    'evaluation_window', 'round_end',
    'round_number', 10,
    'condition', 'owner_alive',
    'outcome', JSON_OBJECT('kind', 'declare_winner')
  ), 1),
  ('automated_repair_systems', 'Automated Repair Systems', 'round_start_effect', 'round_start_effect', JSON_ARRAY('healing', 'passive'), 'Passive. Gain 5 Health each round, up to your starting maximum Health.', JSON_OBJECT(), 1),
  ('replicators', 'Replicators', 'round_start_effect', 'round_start_effect', JSON_ARRAY('healing', 'passive'), 'Passive. Gain 5 Health each round.', JSON_OBJECT(), 1),
  ('mining_rig', 'Mining Rig', 'activated_utility', 'activated_spend_with_target_policy', JSON_ARRAY('healing', 'resource_conversion'), 'Spend 3X Energy. Gain X Health.', JSON_OBJECT(
    'target_policy', 'optional_target',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'scaled_x', 'multiplier', 3),
    'effect_formula', NULL
  ), 1)
ON DUPLICATE KEY UPDATE
  `ability_name` = VALUES(`ability_name`),
  `template_type` = VALUES(`template_type`),
  `template_key` = VALUES(`template_key`),
  `tags_json` = VALUES(`tags_json`),
  `description` = VALUES(`description`),
  `template_params_json` = VALUES(`template_params_json`),
  `is_enabled` = VALUES(`is_enabled`),
  `updated_at` = CURRENT_TIMESTAMP;

-- Align existing per-game ability instances with the canonical definition table.
UPDATE `rumble_ability_instances` rai
JOIN `rumble_ability_definitions` rad ON rad.`ability_id` = rai.`ability_id`
SET
  rai.`template_key` = rad.`template_key`,
  rai.`template_params` = rad.`template_params_json`;
