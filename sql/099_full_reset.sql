DROP DATABASE IF EXISTS `u709836584_party`;
CREATE DATABASE `u709836584_party`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `u709836584_party`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(40) NOT NULL,
  `srp_salt` CHAR(64) NOT NULL,
  `srp_verifier` VARCHAR(512) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `setting_key` VARCHAR(80) NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `games` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `game_type` VARCHAR(60) NOT NULL DEFAULT 'chat',
  `status` ENUM('open', 'in_progress', 'closed') NOT NULL DEFAULT 'open',
  `mafia_setup_mode` ENUM('auto','custom') NOT NULL DEFAULT 'auto',
  `mafia_setup_mafia_count` INT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_games_owner` (`owner_user_id`),
  KEY `idx_games_status_created` (`status`, `created_at`),
  CONSTRAINT `fk_games_owner_user`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_members` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('owner', 'player', 'observer') NOT NULL DEFAULT 'player',
  `icon_key` VARCHAR(64) NULL DEFAULT NULL,
  `joined_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`, `user_id`),
  KEY `idx_game_members_user` (`user_id`),
  CONSTRAINT `fk_game_members_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_messages_game_created` (`game_id`, `created_at`),
  CONSTRAINT `fk_game_messages_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_messages_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_state` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  -- Shared per-game phase state. Mafia uses start|day|night.
  `phase` VARCHAR(40) NOT NULL DEFAULT 'chat',
  `current_round` INT UNSIGNED NOT NULL DEFAULT 1,
  `started_at` TIMESTAMP NULL DEFAULT NULL,
  `ended_at` TIMESTAMP NULL DEFAULT NULL,
  `winner_summary` VARCHAR(255) NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`),
  CONSTRAINT `fk_game_state_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_player_standings` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `final_rank` INT UNSIGNED NULL DEFAULT NULL,
  `eliminated_round` INT UNSIGNED NULL DEFAULT NULL,
  `elimination_order` INT UNSIGNED NULL DEFAULT NULL,
  `result_status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`, `user_id`),
  KEY `idx_game_player_standings_rank` (`game_id`, `final_rank`),
  KEY `idx_game_player_standings_elimination_order` (`game_id`, `elimination_order`),
  CONSTRAINT `fk_game_player_standings_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_player_standings_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_actions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  -- Mafia stores player submissions and server-generated summaries here:
  -- mafia_ready, mafia_day_vote, mafia_night_vote,
  -- mafia_day_result, mafia_night_result, mafia_game_over.
  `action_type` VARCHAR(40) NOT NULL,
  `payload` JSON NOT NULL,
  `round_number` INT UNSIGNED NOT NULL DEFAULT 1,
  -- Shared per-action phase stamp. Mafia uses start|day|night.
  `phase` VARCHAR(40) NOT NULL DEFAULT 'chat',
  -- Mafia keeps player submissions hidden until resolution and reveals only
  -- server-generated result rows immediately.
  `revealed_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_game_actions_game_id` (`game_id`),
  KEY `idx_game_actions_game_round` (`game_id`, `round_number`),
  KEY `idx_game_actions_game_revealed` (`game_id`, `revealed_at`),
  CONSTRAINT `fk_game_actions_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_actions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `game_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role_key` VARCHAR(40) NOT NULL,
  `is_hidden` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_game_roles_game_user_role` (`game_id`, `user_id`, `role_key`),
  KEY `idx_game_roles_game` (`game_id`),
  CONSTRAINT `fk_game_roles_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_game_roles_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rumble_player_state` (
  `game_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `current_health` INT UNSIGNED NOT NULL DEFAULT 100,
  `starting_health` INT UNSIGNED NOT NULL DEFAULT 100,
  `ship_name` VARCHAR(60) NULL,
  `owned_abilities_json` JSON NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`game_id`, `user_id`),
  KEY `idx_rumble_player_state_health` (`game_id`, `current_health`),
  CONSTRAINT `fk_rumble_player_state_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_player_state_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rumble_ability_instances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `owner_user_id` BIGINT UNSIGNED NOT NULL,
  `ability_id` VARCHAR(64) NOT NULL,
  `template_key` VARCHAR(80) NOT NULL,
  `template_params` JSON NOT NULL,
  `runtime_state` JSON NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `consumed_at_round` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_rumble_ability_instance_owner_ability` (`game_id`, `owner_user_id`, `ability_id`),
  KEY `idx_rumble_ability_instances_game_owner` (`game_id`, `owner_user_id`),
  KEY `idx_rumble_ability_instances_game_active` (`game_id`, `is_active`),
  CONSTRAINT `fk_rumble_ability_instances_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_ability_instances_owner`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rumble_round_effects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `game_id` BIGINT UNSIGNED NOT NULL,
  `round_number` INT UNSIGNED NOT NULL,
  `owner_user_id` BIGINT UNSIGNED NOT NULL,
  `target_user_id` BIGINT UNSIGNED NULL,
  `ability_instance_id` BIGINT UNSIGNED NULL,
  `effect_key` VARCHAR(80) NOT NULL,
  `trigger_timing` VARCHAR(40) NOT NULL,
  `payload` JSON NOT NULL,
  `is_resolved` TINYINT(1) NOT NULL DEFAULT 0,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rumble_round_effects_game_round` (`game_id`, `round_number`),
  KEY `idx_rumble_round_effects_game_timing` (`game_id`, `trigger_timing`),
  KEY `idx_rumble_round_effects_owner` (`game_id`, `owner_user_id`),
  KEY `idx_rumble_round_effects_resolved` (`game_id`, `round_number`, `is_resolved`),
  CONSTRAINT `fk_rumble_round_effects_game`
    FOREIGN KEY (`game_id`) REFERENCES `games`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_round_effects_owner`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_round_effects_target`
    FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rumble_round_effects_instance`
    FOREIGN KEY (`ability_instance_id`) REFERENCES `rumble_ability_instances`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    'target_user_id', JSON_OBJECT('type', 'int', 'required', false),
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
    'target_policy', 'none',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'variable_x'),
    'effect_formula', JSON_OBJECT('kind', 'next_round_bonus_attack_x')
  ), 1),
  ('efficient_targeting', 'Efficient Targeting', 'activated_attack_modifier', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'cost_reduction'), 'Spend 10 Energy. Your second-largest attack this round costs 0 Energy.', JSON_OBJECT(
    'target_policy', 'none',
    'cost_mode', 'fixed',
    'cost_formula', JSON_OBJECT('kind', 'constant', 'value', 10),
    'effect_formula', JSON_OBJECT('kind', 'second_largest_attack_free')
  ), 1),
  ('phase_bomb', 'Phase Bomb', 'activated_attack', 'activated_spend_with_target_policy', JSON_ARRAY('attack', 'aoe'), 'Spend X Energy. Deal floor(X/2) damage to all other opponents.', JSON_OBJECT(
    'target_policy', 'all_other_players',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'variable_x'),
    'effect_formula', JSON_OBJECT('kind', 'damage_floor_half_x', 'channel', 'normal')
  ), 1),
  ('mine_layer', 'Mine Layer', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'retaliation'), 'Spend X Energy. This round, each player who attacks you takes floor(X/2) damage.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'none', 'required', false, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(JSON_OBJECT('resource', 'energy', 'formula', JSON_OBJECT('kind', 'variable_x'), 'timing', 'on_activate')),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'set_retaliation_damage',
        'formula', JSON_OBJECT('kind', 'scaled_x', 'multiplier', 0.5)
      )),
      'scheduled_effects', JSON_ARRAY(),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('hailing_frequencies', 'Hailing Frequencies', 'utility_status', 'activated_self_or_toggle', JSON_ARRAY('utility', 'status', 'duel_lockout'), 'Choose one opponent. Next round, neither of you may attack the other. Not valid if only two players remain.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'single_opponent', 'required', true, 'filters', JSON_ARRAY(), 'relation', 'symmetric'),
      'costs', JSON_ARRAY(),
      'effects', JSON_ARRAY(),
      'scheduled_effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'schedule_state',
        'state', JSON_OBJECT(
          'state_key', 'blocked_target_pair',
          'scope', 'pair',
          'selector', JSON_OBJECT('subject', 'activation_target', 'filters', JSON_ARRAY()),
          'duration', JSON_OBJECT('kind', 'current_round', 'starts_at', 'round_start', 'ends_at', 'round_end'),
          'stacking', 'replace',
          'visibility', 'public',
          'relation', 'symmetric'
        )
      )),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('scheming', 'Scheming', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'retaliation', 'burn'), 'Burn 10. Choose one opponent. If that opponent attacks you this round, you ignore their largest attack and they take that much damage.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'single_opponent', 'required', true, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(JSON_OBJECT('resource', 'health', 'formula', JSON_OBJECT('kind', 'constant', 'value', 10), 'timing', 'on_activate')),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'set_reflect_largest_attack_target'
      )),
      'scheduled_effects', JSON_ARRAY(),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('death_ray', 'Death Ray', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('attack', 'passive'), 'Passive. If you make exactly one attack this round, increase that attack by 50%.', JSON_OBJECT(), 1),
  ('heavy_guns', 'Heavy Guns', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('attack', 'passive'), 'Passive. Each of your attacks deals +10 damage.', JSON_OBJECT(), 1),
  ('holoship', 'Holoship', 'passive_modifier', 'round_end_effect', JSON_ARRAY('defense', 'passive', 'upkeep_cost'), 'Passive. You cannot be targeted by attacks. At end of round, lose 5 Health.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(JSON_OBJECT(
      'apply_timing', 'always',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'modifiers', JSON_ARRAY(),
      'granted_states', JSON_ARRAY(JSON_OBJECT(
        'state_key', 'untargetable',
        'scope', 'self',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
        'duration', JSON_OBJECT('kind', 'while_owned'),
        'metadata', JSON_OBJECT()
      ))
    )),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY()
  ), 1),
  ('hyperdrive', 'Hyperdrive', 'utility_status', 'activated_self_or_toggle', JSON_ARRAY('utility', 'status', 'burn', 'win_condition'), 'Burn 5 to enter or leave Hyperspace. In Hyperspace, you cannot attack or be attacked.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'toggle',
      'targeting', JSON_OBJECT('policy', 'none', 'required', false, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(JSON_OBJECT('resource', 'health', 'formula', JSON_OBJECT('kind', 'constant', 'value', 5), 'timing', 'on_activate')),
      'effects', JSON_ARRAY(),
      'scheduled_effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'schedule_state',
        'state', JSON_OBJECT(
          'state_key', 'hyperspace_active',
          'scope', 'self',
          'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
          'duration', JSON_OBJECT('kind', 'until_removed', 'starts_at', 'next_round_start', 'ends_at', 'manual_toggle'),
          'stacking', 'replace',
          'visibility', 'public'
        )
      )),
      'mode_options', JSON_ARRAY('enter', 'leave')
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('cloaking_field', 'Cloaking Field', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'delayed', 'burn'), 'Spend 20 Energy and Burn 5. You cannot be attacked next round.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'none', 'required', false, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(
        JSON_OBJECT('resource', 'energy', 'formula', JSON_OBJECT('kind', 'constant', 'value', 20), 'timing', 'on_activate'),
        JSON_OBJECT('resource', 'health', 'formula', JSON_OBJECT('kind', 'constant', 'value', 5), 'timing', 'on_activate')
      ),
      'effects', JSON_ARRAY(),
      'scheduled_effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'schedule_state',
        'state', JSON_OBJECT(
          'state_key', 'untargetable',
          'scope', 'self',
          'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
          'duration', JSON_OBJECT('kind', 'current_round', 'starts_at', 'round_start', 'ends_at', 'round_end'),
          'stacking', 'replace',
          'visibility', 'public'
        )
      )),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('shield_capacitors', 'Shield Capacitors', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense'), 'Spend 10 Energy. Gain +20 Defense this round.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'none', 'required', false, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(JSON_OBJECT('resource', 'energy', 'formula', JSON_OBJECT('kind', 'constant', 'value', 10), 'timing', 'on_activate')),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'add_defense_bonus',
        'formula', JSON_OBJECT('kind', 'constant', 'value', 20)
      )),
      'scheduled_effects', JSON_ARRAY(),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('shield_boosters', 'Shield Boosters', 'round_start_effect', 'round_start_effect', JSON_ARRAY('defense', 'passive'), 'Passive. Gain +20 Defense at the start of each round.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(JSON_OBJECT(
      'apply_timing', 'round_start',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'modifiers', JSON_ARRAY(JSON_OBJECT(
        'stat', 'defense',
        'operation', 'add',
        'formula', JSON_OBJECT('kind', 'constant', 'value', 20),
        'timing', 'round_start',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY())
      )),
      'granted_states', JSON_ARRAY()
    )),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY()
  ), 1),
  ('reflective_shield', 'Reflective Shield', 'trigger_on_attacked', 'trigger_on_attacked', JSON_ARRAY('defense', 'retaliation', 'passive'), 'Passive. Whenever you take attack damage, the attacker takes half that damage.', JSON_OBJECT(), 1),
  ('energy_absorption', 'Energy Absorption', 'round_start_effect', 'round_start_effect', JSON_ARRAY('resource', 'delayed'), 'Spend 10 Energy. At the start of next round, gain Energy equal to half the damage your Defense blocked this round.', JSON_OBJECT(), 1),
  ('armor', 'Armor', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('defense', 'passive'), 'Passive. Reduce each incoming attack by 5.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(JSON_OBJECT(
      'apply_timing', 'incoming_attack',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'modifiers', JSON_ARRAY(JSON_OBJECT(
        'stat', 'incoming_attack_damage',
        'operation', 'reduce_each_instance',
        'formula', JSON_OBJECT('kind', 'constant', 'value', 5),
        'timing', 'incoming_attack',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY())
      )),
      'granted_states', JSON_ARRAY()
    )),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY()
  ), 1),
  ('heavy_armor', 'Heavy Armor', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('defense', 'passive'), 'Passive. Reduce each incoming attack by 10.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(JSON_OBJECT(
      'apply_timing', 'incoming_attack',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'modifiers', JSON_ARRAY(JSON_OBJECT(
        'stat', 'incoming_attack_damage',
        'operation', 'reduce_each_instance',
        'formula', JSON_OBJECT('kind', 'constant', 'value', 10),
        'timing', 'incoming_attack',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY())
      )),
      'granted_states', JSON_ARRAY()
    )),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY()
  ), 1),
  ('backup_generator', 'Backup Generator', 'trigger_on_defeat', 'trigger_on_defeat_single_use', JSON_ARRAY('survival', 'single_use'), 'Triggered. If reduced to 0 Health, lose this ability and set Health to 30.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(JSON_OBJECT(
      'event', 'on_defeat',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'conditions', JSON_ARRAY(),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'restore_health',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
        'formula', JSON_OBJECT('kind', 'constant', 'value', 30)
      )),
      'priority', 100,
      'consumption', JSON_OBJECT('kind', 'consume_on_trigger', 'remove_from_owned', true)
    )),
    'conditions', JSON_ARRAY()
  ), 1),
  ('escape_pods', 'Escape Pods', 'trigger_on_defeat', 'trigger_on_defeat_single_use', JSON_ARRAY('survival', 'single_use'), 'Triggered. If reduced to 0 Health, lose this ability and set Health to 20.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(JSON_OBJECT(
      'event', 'on_defeat',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'conditions', JSON_ARRAY(),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'restore_health',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
        'formula', JSON_OBJECT('kind', 'constant', 'value', 20)
      )),
      'priority', 100,
      'consumption', JSON_OBJECT('kind', 'consume_on_trigger', 'remove_from_owned', true)
    )),
    'conditions', JSON_ARRAY()
  ), 1),
  ('nimble_dodge', 'Nimble Dodge', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'single_attack_negation'), 'Spend 10 Energy. Negate the largest attack against you this round. Not valid if only two players remain.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'none', 'required', false, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(JSON_OBJECT('resource', 'energy', 'formula', JSON_OBJECT('kind', 'constant', 'value', 10), 'timing', 'on_activate')),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'grant_state',
        'state', JSON_OBJECT(
          'state_key', 'negate_largest_incoming_attack',
          'scope', 'self',
          'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
          'duration', JSON_OBJECT('kind', 'current_round', 'starts_at', 'activation', 'ends_at', 'round_end'),
          'stacking', 'replace',
          'visibility', 'private'
        )
      )),
      'scheduled_effects', JSON_ARRAY(),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('focused_defense', 'Focused Defense', 'activated_defense', 'activated_defense_mode', JSON_ARRAY('defense', 'single_opponent'), 'Choose one opponent. Halve attacks from that opponent this round.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(
      'kind', 'activated',
      'targeting', JSON_OBJECT('policy', 'single_opponent', 'required', true, 'filters', JSON_ARRAY(), 'relation', 'one_way'),
      'costs', JSON_ARRAY(),
      'effects', JSON_ARRAY(JSON_OBJECT(
        'kind', 'modify_incoming_attacks',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
        'modifier', JSON_OBJECT(
          'stat', 'incoming_attack_damage',
          'operation', 'multiply',
          'formula', JSON_OBJECT('kind', 'constant', 'value', 0.5),
          'timing', 'current_round',
          'selector', JSON_OBJECT('subject', 'activation_target', 'filters', JSON_ARRAY())
        )
      )),
      'scheduled_effects', JSON_ARRAY(),
      'mode_options', JSON_ARRAY()
    ),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(),
    'consumption', JSON_ARRAY(),
    'limits', JSON_ARRAY(),
    'ui', JSON_ARRAY()
  ), 1),
  ('turbo_generator', 'Turbo Generator', 'passive_modifier', 'passive_modifier_round', JSON_ARRAY('resource', 'passive'), 'Passive. Your per-round Energy is Health + 10.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(JSON_OBJECT(
      'apply_timing', 'always',
      'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
      'modifiers', JSON_ARRAY(JSON_OBJECT(
        'stat', 'energy_budget',
        'operation', 'add',
        'formula', JSON_OBJECT('kind', 'constant', 'value', 10),
        'timing', 'always',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY())
      )),
      'granted_states', JSON_ARRAY()
    )),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY()
  ), 1),
  ('mcguffin_generator', 'McGuffin Generator', 'trigger_on_round', 'condition_tracker', JSON_ARRAY('healing', 'timed_trigger'), 'Triggered. At the start of round 3, gain 50 Health.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(JSON_OBJECT(
      'evaluation_timing', 'round_start',
      'round_rule', JSON_OBJECT('kind', 'exact_round', 'round_number', 3),
      'predicate', JSON_OBJECT('kind', 'always'),
      'outcomes', JSON_ARRAY(JSON_OBJECT(
        'kind', 'heal_constant',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY()),
        'formula', JSON_OBJECT('kind', 'heal_constant', 'value', 50)
      ))
    ))
  ), 1),
  ('courier_mission', 'Courier Mission', 'win_condition', 'condition_tracker', JSON_ARRAY('win_condition'), 'Win condition. If you are alive at end of round 10, you win.', JSON_OBJECT(
    'schema_version', 1,
    'activation', JSON_OBJECT(),
    'passive', JSON_ARRAY(),
    'triggers', JSON_ARRAY(),
    'conditions', JSON_ARRAY(JSON_OBJECT(
      'evaluation_timing', 'round_end',
      'round_rule', JSON_OBJECT('kind', 'exact_round', 'round_number', 10),
      'predicate', JSON_OBJECT('kind', 'owner_alive'),
      'outcomes', JSON_ARRAY(JSON_OBJECT(
        'kind', 'declare_winner',
        'selector', JSON_OBJECT('subject', 'owner', 'filters', JSON_ARRAY())
      ))
    ))
  ), 1),
  ('automated_repair_systems', 'Automated Repair Systems', 'round_start_effect', 'round_start_effect', JSON_ARRAY('healing', 'passive'), 'Passive. Gain 5 Health each round, up to your starting maximum Health.', JSON_OBJECT('heal_amount', 5, 'cap_to_starting', true), 1),
  ('replicators', 'Replicators', 'round_start_effect', 'round_start_effect', JSON_ARRAY('healing', 'passive'), 'Passive. Gain 5 Health each round.', JSON_OBJECT('heal_amount', 5, 'cap_to_starting', false), 1),
  ('mining_rig', 'Mining Rig', 'activated_utility', 'activated_spend_with_target_policy', JSON_ARRAY('healing', 'resource_conversion'), 'Spend 3X Energy. Gain X Health.', JSON_OBJECT(
    'target_policy', 'none',
    'cost_mode', 'variable',
    'cost_formula', JSON_OBJECT('kind', 'scaled_x', 'multiplier', 3),
    'effect_formula', JSON_OBJECT('kind', 'heal_x')
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

INSERT INTO `app_settings` (`setting_key`, `setting_value`)
VALUES ('signup_invite_key', 'party-friends-v1')
ON DUPLICATE KEY UPDATE
  `setting_value` = VALUES(`setting_value`);

