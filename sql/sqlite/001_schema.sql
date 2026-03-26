PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  srp_salt TEXT NOT NULL,
  srp_verifier TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT NULL,
  UNIQUE(username)
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  game_type TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS game_members (
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('owner', 'player', 'observer')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, user_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS game_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS game_state (
  game_id INTEGER PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'chat',
  current_round INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NULL,
  ended_at TEXT NULL,
  winner_summary TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS game_player_standings (
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  final_rank INTEGER NULL,
  eliminated_round INTEGER NULL,
  elimination_order INTEGER NULL,
  result_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, user_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS game_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  round_number INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'chat',
  revealed_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS game_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_key TEXT NOT NULL,
  is_hidden INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_id, user_id, role_key),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS rumble_player_state (
  game_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  current_health INTEGER NOT NULL DEFAULT 100,
  ship_name TEXT NULL,
  owned_abilities_json TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, user_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS rumble_ability_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  owner_user_id INTEGER NOT NULL,
  ability_id TEXT NOT NULL,
  template_key TEXT NOT NULL,
  template_params TEXT NOT NULL,
  runtime_state TEXT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  consumed_at_round INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_id, owner_user_id, ability_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS rumble_round_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  owner_user_id INTEGER NOT NULL,
  target_user_id INTEGER NULL,
  ability_instance_id INTEGER NULL,
  effect_key TEXT NOT NULL,
  trigger_timing TEXT NOT NULL,
  payload TEXT NOT NULL,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (ability_instance_id) REFERENCES rumble_ability_instances(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS rumble_ability_templates (
  template_key TEXT PRIMARY KEY,
  template_kind TEXT NOT NULL,
  template_inputs_json TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rumble_ability_definitions (
  ability_id TEXT PRIMARY KEY,
  ability_name TEXT NOT NULL,
  template_type TEXT NOT NULL,
  template_key TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  description TEXT NOT NULL,
  template_params_json TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_key) REFERENCES rumble_ability_templates(template_key) ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_games_owner ON games(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_games_status_created ON games(status, created_at);
CREATE INDEX IF NOT EXISTS idx_game_members_user ON game_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_game_created ON game_messages(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_game_player_standings_rank ON game_player_standings(game_id, final_rank);
CREATE INDEX IF NOT EXISTS idx_game_player_standings_elimination_order ON game_player_standings(game_id, elimination_order);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_round ON game_actions(game_id, round_number);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_revealed ON game_actions(game_id, revealed_at);
CREATE INDEX IF NOT EXISTS idx_game_roles_game ON game_roles(game_id);
CREATE INDEX IF NOT EXISTS idx_rumble_player_state_health ON rumble_player_state(game_id, current_health);
CREATE INDEX IF NOT EXISTS idx_rumble_ability_instances_game_owner ON rumble_ability_instances(game_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rumble_ability_instances_game_active ON rumble_ability_instances(game_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rumble_round_effects_game_round ON rumble_round_effects(game_id, round_number);
CREATE INDEX IF NOT EXISTS idx_rumble_round_effects_game_timing ON rumble_round_effects(game_id, trigger_timing);
CREATE INDEX IF NOT EXISTS idx_rumble_round_effects_owner ON rumble_round_effects(game_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rumble_round_effects_resolved ON rumble_round_effects(game_id, round_number, is_resolved);
CREATE INDEX IF NOT EXISTS idx_rumble_ability_templates_enabled ON rumble_ability_templates(is_enabled);
CREATE INDEX IF NOT EXISTS idx_rumble_ability_defs_enabled ON rumble_ability_definitions(is_enabled);
CREATE INDEX IF NOT EXISTS idx_rumble_ability_defs_template ON rumble_ability_definitions(template_key);