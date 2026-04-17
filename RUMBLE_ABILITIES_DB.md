# Rumble Ability DB Storage Reference

This document describes how Rumble abilities are stored in the database and how the PHP runtime reads that data today. It focuses on the persistent model, the JSON structures carried in the ability tables, and concrete seeded examples that show the important key and value shapes.

## Storage Model At A Glance

Rumble ability data is split across three layers:

1. Catalog definitions: the reusable ability metadata and behavior descriptions stored in `rumble_ability_templates` and `rumble_ability_definitions`.
2. Player ownership: the ability ids currently owned by a player, stored as JSON in `rumble_player_state.owned_abilities_json`.
3. Runtime effects and future instance state: round-specific effect history in `rumble_round_effects`, plus a richer `rumble_ability_instances` table that exists in schema but is not the main runtime source of truth for owned abilities today.

The active runtime path is:

- `rumble_ability_library()` loads enabled rows from `rumble_ability_definitions`.
- `rumble_ability_template_catalog()` loads enabled rows from `rumble_ability_templates`.
- `rumble_parse_owned_abilities()` and `rumble_encode_owned_abilities()` translate `owned_abilities_json` to and from PHP arrays.
- `rumble_owned_abilities_public_view()` expands owned ids into public objects that include template metadata.
- `rumble_round_effects` stores scheduled or generated round events as JSON payloads.

The current ownership model is intentionally simple: owned abilities are stored as an array of ability ids, not as one row per owned instance.

## Tables And Columns

### `rumble_player_state`

This table stores per-player Rumble state for a game. The ability-specific column added by migration `015_add_rumble_abilities_state.sql` is:

| Column | SQL type | Meaning | Runtime status |
| --- | --- | --- | --- |
| `owned_abilities_json` | `JSON NULL` | Array of owned ability ids for that player. After migration, nulls are normalized to `[]`. | Active |

Notes:

- The runtime expects a JSON array of strings such as `[
  "meson_beam",
  "backup_generator"
]`.
- Unknown ids are discarded when parsed.
- Ability ids are canonicalized before use. For example, the legacy id `cloaking_system` is normalized to `cloaking_field`.
- The array is sorted before it is written back out.
- Duplicates are preserved if present, which lets the runtime count multiple copies of the same ability.

### `rumble_ability_templates`

This table stores reusable template contracts. A template describes the kind of ability and the input fields that the client or runtime may send when using it.

| Column | SQL type | Meaning | Runtime status |
| --- | --- | --- | --- |
| `template_key` | `VARCHAR(80)` | Stable identifier such as `activated_spend_with_target_policy`. Primary key. | Active |
| `template_kind` | `VARCHAR(32)` | High-level class such as `activated`, `passive`, `triggered`, or `condition`. | Active |
| `template_inputs_json` | `JSON` | Object describing accepted request inputs for this template. | Active |
| `is_enabled` | `TINYINT(1)` | Enables or disables the template in the catalog. | Active |
| `created_at` | `TIMESTAMP` | Creation time. | Passive metadata |
| `updated_at` | `TIMESTAMP` | Last update time. | Passive metadata |

Seeded template keys currently include:

- `activated_spend_with_target_policy`
- `activated_self_or_toggle`
- `activated_defense_mode`
- `passive_modifier_round`
- `trigger_on_attacked`
- `trigger_on_defeat_single_use`
- `round_start_effect`
- `round_end_effect`
- `condition_tracker`

### `rumble_ability_definitions`

This is the authoritative catalog of ability definitions. Each row describes one ability id, the template it uses, short text, tags, and the template-specific behavior blob.

| Column | SQL type | Meaning | Runtime status |
| --- | --- | --- | --- |
| `ability_id` | `VARCHAR(64)` | Stable id such as `meson_beam` or `backup_generator`. Primary key. | Active |
| `ability_name` | `VARCHAR(120)` | Human-readable display name. | Active |
| `template_type` | `VARCHAR(64)` | Subtype label such as `activated_attack`, `passive_modifier`, or `win_condition`. | Active |
| `template_key` | `VARCHAR(80)` | Foreign key to `rumble_ability_templates`. Selects the input contract and broad behavior family. | Active |
| `tags_json` | `JSON` | Array of classification tags. | Active |
| `description` | `VARCHAR(255)` | Short rules text. | Active |
| `template_params_json` | `JSON` | The main behavior payload. Its shape varies by ability family. | Active |
| `is_enabled` | `TINYINT(1)` | Enables or disables the ability in the library query. | Active |
| `created_at` | `TIMESTAMP` | Creation time. | Passive metadata |
| `updated_at` | `TIMESTAMP` | Last update time. | Passive metadata |

This table is what `rumble_ability_library()` reads on each request before caching the result in-process for the remainder of that request.

### `rumble_ability_instances`

This table supports a richer per-instance storage model than the current ownership array. It is present in the base schema and migration `018_rumble_ability_catalog_tables.sql` aligns existing rows to the canonical ability definition table, but the current ownership path does not read or write this table when determining which abilities a player owns.

| Column | SQL type | Meaning | Runtime status |
| --- | --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Surrogate primary key. | Mostly dormant |
| `game_id` | `BIGINT UNSIGNED` | Owning game. | Mostly dormant |
| `owner_user_id` | `BIGINT UNSIGNED` | Owning player. | Mostly dormant |
| `ability_id` | `VARCHAR(64)` | Ability id linked to the definition catalog. | Mostly dormant |
| `template_key` | `VARCHAR(80)` | Template key copied from the catalog. | Mostly dormant |
| `template_params` | `JSON` | Per-instance copy of behavior params. | Mostly dormant |
| `runtime_state` | `JSON NULL` | Mutable state that would allow an ability instance to carry round-to-round state. | Mostly dormant |
| `is_active` | `TINYINT(1)` | Whether the instance is active. | Mostly dormant |
| `consumed_at_round` | `INT UNSIGNED NULL` | Round number when a single-use instance was consumed. | Mostly dormant |
| `created_at` | `TIMESTAMP` | Creation time. | Passive metadata |
| `updated_at` | `TIMESTAMP` | Last update time. | Passive metadata |

Important distinction:

- The schema supports a row-per-owned-instance model.
- The active PHP ownership flow still uses `rumble_player_state.owned_abilities_json` instead.
- `rumble_round_effects.ability_instance_id` can point at this table, but the ownership helpers do not depend on it.

### `rumble_round_effects`

This table stores effect history and scheduled or generated round events. Unlike `rumble_ability_instances`, this table is actively used by the resolver and presentation layers.

| Column | SQL type | Meaning | Runtime status |
| --- | --- | --- | --- |
| `id` | `BIGINT UNSIGNED` | Surrogate primary key. | Active |
| `game_id` | `BIGINT UNSIGNED` | Game containing the effect. | Active |
| `round_number` | `INT UNSIGNED` | Round the effect belongs to. | Active |
| `owner_user_id` | `BIGINT UNSIGNED` | Player who created or owns the effect. | Active |
| `target_user_id` | `BIGINT UNSIGNED NULL` | Optional target player. | Active |
| `ability_instance_id` | `BIGINT UNSIGNED NULL` | Optional pointer to an ability instance row. | Active, optional |
| `effect_key` | `VARCHAR(80)` | Effect identifier used by the runtime and presentation code. | Active |
| `trigger_timing` | `VARCHAR(40)` | When the effect should happen or how it should be categorized. | Active |
| `payload` | `JSON` | Effect-specific detail object. | Active |
| `is_resolved` | `TINYINT(1)` | Whether the effect has already been processed. | Active |
| `resolved_at` | `TIMESTAMP NULL` | Timestamp for resolution. | Active |
| `created_at` | `TIMESTAMP` | Creation time. | Passive metadata |

The resolver inserts effect rows as JSON, and the presentation layer later decodes the payload and produces human-readable text.

## How The JSON Structures Work

### `owned_abilities_json`

Stored in `rumble_player_state`.

Expected shape:

```json
[
  "backup_generator",
  "meson_beam",
  "meson_beam"
]
```

Runtime rules:

- Empty or null becomes `[]`.
- Non-array JSON is rejected and treated as empty.
- Every element is treated as an ability id string.
- Each id is canonicalized with `rumble_canonical_ability_id()`.
- Unknown ids are filtered out.
- The final list is sorted lexicographically.
- Duplicates remain in the array, which is how `rumble_owned_ability_counts()` can represent multiple copies.

### `template_inputs_json`

Stored in `rumble_ability_templates`.

Expected shape:

```json
{
  "target_user_id": { "type": "int", "required": false },
  "x_cost": { "type": "int", "required": false, "min": 0 },
  "is_enabled": { "type": "bool", "required": false }
}
```

This object is a contract for request-time inputs. Each property name is an accepted input field. The value is a metadata object describing the expected JSON type and basic validation hints.

Common input definitions:

| Input key | Declared type | Meaning |
| --- | --- | --- |
| `target_user_id` | `int` | Target player id supplied when an ability needs a specific target. |
| `x_cost` | `int` | Variable amount selected by the user for an `X` cost ability. Usually constrained by `min: 0`. |
| `mode` | `string` | Mode selector used by toggle-style abilities such as entering or leaving a state. |
| `is_enabled` | `bool` | Optional switch used by some templates to indicate whether an ability is toggled on. |

### `tags_json`

Stored in `rumble_ability_definitions`.

Expected shape:

```json
["attack", "single_target", "unblockable"]
```

Tags are plain strings used for classification and UI or logic grouping. The runtime trims empty values and preserves the remaining list order from the database row.

Common tags in the seed data include:

- `attack`
- `defense`
- `passive`
- `single_target`
- `delayed`
- `retaliation`
- `burn`
- `single_use`
- `win_condition`
- `resource_conversion`

### `template_params_json`

Stored in `rumble_ability_definitions`.

This is the main behavior object. There are two broad patterns in the seed data.

#### Pattern 1: compact flat objects

Some simpler abilities store a shallow object with a few keys:

```json
{
  "target_policy": "single_opponent",
  "cost_mode": "fixed",
  "cost_formula": { "kind": "constant", "value": 10 },
  "effect_formula": { "kind": "damage_constant", "value": 5, "channel": "unblockable" }
}
```

This pattern is common for straightforward activated abilities based on the `activated_spend_with_target_policy` template.

#### Pattern 2: structured schema-versioned objects

More expressive abilities use a larger object with `schema_version` and several typed sections:

```json
{
  "schema_version": 1,
  "activation": {},
  "passive": [],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [],
  "ui": []
}
```

These section keys mean:

| Key | JSON type | Meaning |
| --- | --- | --- |
| `schema_version` | number | Version marker for the structured format. Current seeded complex rows use `1`. |
| `activation` | object | How an ability is manually activated: targeting, costs, direct effects, scheduled effects, and mode options. |
| `passive` | array | Passive modifiers or granted states that apply automatically. |
| `triggers` | array | Event-driven behaviors such as `on_defeat`. |
| `conditions` | array | Round-rule or predicate-driven outcomes evaluated by timing. |
| `consumption` | array | Extra consumption rules at the top level. Often empty in current seeds. |
| `limits` | array | Validation or eligibility rules such as minimum alive player counts. |
| `ui` | array | Optional UI metadata. Currently usually empty. |

### Common nested attribute types in `template_params_json`

These objects recur across many ability definitions.

#### Targeting objects

Used inside `activation.targeting`.

| Key | JSON type | Meaning | Typical values |
| --- | --- | --- | --- |
| `policy` | string | Who can be targeted. | `none`, `single_opponent`, `all_other_players` |
| `required` | boolean | Whether a target must be chosen. | `true`, `false` |
| `filters` | array | Extra target restrictions. | usually `[]` |
| `relation` | string | Direction of the relationship. | `one_way`, `symmetric` |

#### Cost entries

Used inside `activation.costs`.

| Key | JSON type | Meaning | Typical values |
| --- | --- | --- | --- |
| `resource` | string | Resource being paid. | `energy`, `health` |
| `formula` | object | How the amount is computed. | see formula kinds below |
| `timing` | string | When the cost is applied. | `on_activate` |

#### Formula objects

Formula objects are the main typed numeric or semantic value carriers.

| Formula kind | Common keys | Meaning |
| --- | --- | --- |
| `constant` | `value` | Fixed amount, such as `10` energy or `5` health. |
| `variable_x` | none | Use the caller-supplied `X` value directly. |
| `scaled_x` | `multiplier` | Multiply the chosen `X` by a factor, usually for cost or retaliation. |
| `damage_constant` | `value`, `channel` | Fixed damage with a specific channel such as `unblockable` or `defense_only`. |
| `damage_floor_half_x` | `channel` | Deal `floor(X/2)` style damage. |
| `next_round_damage_x` | none | Schedule next-round damage equal to `X`. |
| `next_round_bonus_attack_x` | none | Schedule next-round bonus attack damage equal to `X`. |
| `heal_x` | none | Heal for `X`. |
| `heal_constant` | `value` | Heal a fixed amount in conditional outcomes. |

#### Effect entries

Used inside `activation.effects`, `triggers[*].effects`, and `conditions[*].outcomes`.

| Effect kind | Purpose |
| --- | --- |
| `set_retaliation_damage` | Stores retaliation damage for the current round. |
| `set_reflect_largest_attack_target` | Reflects the largest attack from a chosen opponent. |
| `add_defense_bonus` | Adds a defense amount for the round. |
| `grant_state` | Grants a temporary state such as negating the largest incoming attack. |
| `modify_incoming_attacks` | Applies a modifier to attacks from a chosen source. |
| `restore_health` | Restores health when a trigger fires. |
| `heal_constant` | Heals a fixed amount in a condition outcome. |
| `declare_winner` | Marks the owner as the winner when a condition succeeds. |
| `set_blocked_damage_energy_bonus` | Converts blocked damage into energy later. |

#### State objects

Used in `scheduled_effects[*].state`, `grant_state`, or `passive[*].granted_states`.

| Key | JSON type | Meaning | Typical values |
| --- | --- | --- | --- |
| `state_key` | string | State identifier. | `blocked_target_pair`, `hyperspace_active`, `untargetable`, `negate_largest_incoming_attack` |
| `scope` | string | Who the state is attached to. | `self`, `pair` |
| `selector` | object | How the subject is resolved. | often `{ "subject": "owner" }` or `{ "subject": "activation_target" }` |
| `duration` | object | Lifetime of the state. | `current_round`, `while_owned`, `until_removed` |
| `stacking` | string | How multiple states interact. | `replace` |
| `visibility` | string | Whether the state is public or private. | `public`, `private` |
| `relation` | string | Symmetry marker for pair states. | `symmetric` |
| `metadata` | object | Free-form extra fields. | usually `{}` |

#### Modifier entries

Used inside `passive[*].modifiers` or `modify_incoming_attacks`.

| Key | JSON type | Meaning | Typical values |
| --- | --- | --- | --- |
| `stat` | string | The stat being changed. | `outgoing_attack_damage`, `incoming_attack_damage`, `defense`, `health`, `energy_budget`, `retaliation_damage_ratio` |
| `operation` | string | How the stat changes. | `add`, `subtract`, `multiply`, `reduce_each_instance` |
| `formula` | object | Numeric rule. | usually `constant` |
| `timing` | string | When it applies. | `attack`, `incoming_attack`, `round_start`, `round_end`, `always`, `on_damage_taken`, `current_round` |
| `selector` | object | Who the modifier applies to or who causes it. | owner or activation target selectors |

#### Trigger objects

Used inside `triggers`.

| Key | JSON type | Meaning | Typical values |
| --- | --- | --- | --- |
| `event` | string | Event that fires the trigger. | `on_defeat` |
| `selector` | object | Who the trigger belongs to. | owner selector |
| `conditions` | array | Extra checks before firing. | usually `[]` |
| `effects` | array | Effects executed when the trigger fires. | restore health, consume ability |
| `priority` | number | Ordering hint. | `100` in current defeat triggers |
| `consumption` | object | How the ability is consumed. | `consume_on_trigger` |

#### Condition objects

Used inside `conditions`.

| Key | JSON type | Meaning | Typical values |
| --- | --- | --- | --- |
| `evaluation_timing` | string | When to evaluate the condition. | `round_start`, `round_end` |
| `round_rule` | object | Which round or round family the condition applies to. | `exact_round` |
| `predicate` | object | Extra logical test. | `always`, `owner_alive` |
| `outcomes` | array | Effects produced on success. | `heal_constant`, `declare_winner` |

### `runtime_state`

Stored in `rumble_ability_instances`.

This column is reserved for mutable per-instance state and is intentionally free-form JSON. The current ownership runtime does not rely on it, so there is no single enforced active shape in the PHP helpers.

### `payload`

Stored in `rumble_round_effects`.

This column is the serialized effect detail object written by the resolver and read back by presentation code. The payload shape depends on `effect_key` and `trigger_timing`, so there is no single universal schema. The important rule is that it is always stored as a JSON object and decoded back into an associative array before display logic runs.

## Template Kinds And Ability Families

There are three overlapping classification systems in the stored model:

1. `template_kind`: broad class from the template table, such as `activated`, `passive`, `triggered`, or `condition`.
2. `template_type`: ability-level subtype from the definition row, such as `activated_attack`, `passive_modifier`, `round_start_effect`, or `win_condition`.
3. `tags_json`: additional feature labels such as `burn`, `retaliation`, `single_use`, or `resource_conversion`.

Typical combinations:

| Template kind | Common template types | Typical stored behavior |
| --- | --- | --- |
| `activated` | `activated_attack`, `activated_defense`, `utility_status`, `activated_utility` | Costs, targeting, direct effects, scheduled effects, or toggles |
| `passive` | `passive_modifier`, `round_start_effect` | Continuous modifiers, granted states, or recurring start/end-of-round effects |
| `triggered` | `trigger_on_attacked`, `trigger_on_defeat` | Event-based effects that fire when the event occurs |
| `condition` | `trigger_on_round`, `win_condition` | Round rule and predicate checks that produce outcomes |

## Worked Ability Examples

The examples below are chosen to cover the major stored patterns in aggregate: fixed costs, variable `X` costs, targeting policies, delayed effects, passives, granted states, triggers, conditions, toggles, and win conditions.

### 1. Meson Beam

- Ability id: `meson_beam`
- Template kind: `activated`
- Template key: `activated_spend_with_target_policy`
- Template type: `activated_attack`
- Tags: `attack`, `single_target`, `unblockable`

Stored parameters:

```json
{
  "target_policy": "single_opponent",
  "cost_mode": "fixed",
  "cost_formula": { "kind": "constant", "value": 10 },
  "effect_formula": { "kind": "damage_constant", "value": 5, "channel": "unblockable" }
}
```

What it demonstrates:

- Flat `template_params_json` instead of the schema-versioned format.
- Fixed cost via `cost_mode: fixed` and `cost_formula.kind: constant`.
- Direct damage payload with a damage channel.

### 2. Loitering Munitions

- Ability id: `loitering_munitions`
- Template kind: `activated`
- Template key: `activated_spend_with_target_policy`
- Template type: `activated_attack`
- Tags: `attack`, `single_target`, `delayed`

Stored parameters:

```json
{
  "target_policy": "single_opponent",
  "cost_mode": "variable",
  "cost_formula": { "kind": "variable_x" },
  "effect_formula": { "kind": "next_round_damage_x" }
}
```

What it demonstrates:

- Variable `X` costs and outcomes.
- Delayed effect semantics encoded in the effect formula kind rather than a separate top-level schedule block.

### 3. Mine Layer

- Ability id: `mine_layer`
- Template kind: `activated`
- Template key: `activated_defense_mode`
- Template type: `activated_defense`
- Tags: `defense`, `retaliation`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {
    "kind": "activated",
    "targeting": {
      "policy": "none",
      "required": false,
      "filters": [],
      "relation": "one_way"
    },
    "costs": [
      {
        "resource": "energy",
        "formula": { "kind": "variable_x" },
        "timing": "on_activate"
      }
    ],
    "effects": [
      {
        "kind": "set_retaliation_damage",
        "formula": { "kind": "scaled_x", "multiplier": 0.5 }
      }
    ],
    "scheduled_effects": [],
    "mode_options": []
  },
  "passive": [],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [
    {
      "kind": "min_alive_players",
      "value": 3,
      "message": "This ability is not valid when only two players remain."
    }
  ],
  "ui": []
}
```

Notable stored parameters:

- `schema_version: 1`
- `activation.targeting.policy: none`
- `activation.costs[0].resource: energy`
- `activation.costs[0].formula.kind: variable_x`
- `activation.effects[0].kind: set_retaliation_damage`
- `activation.effects[0].formula.kind: scaled_x`
- `activation.effects[0].formula.multiplier: 0.5`
- `limits[0].kind: min_alive_players`

What it demonstrates:

- The schema-versioned structured format.
- Cost arrays instead of single `cost_formula` objects.
- A retaliation effect derived from `X` using a multiplier.
- Validation limits stored alongside behavior.

### 4. Hailing Frequencies

- Ability id: `hailing_frequencies`
- Template kind: `activated`
- Template key: `activated_self_or_toggle`
- Template type: `utility_status`
- Tags: `utility`, `status`, `duel_lockout`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {
    "kind": "activated",
    "targeting": {
      "policy": "single_opponent",
      "required": true,
      "filters": [],
      "relation": "symmetric"
    },
    "costs": [],
    "effects": [],
    "scheduled_effects": [
      {
        "kind": "schedule_state",
        "state": {
          "state_key": "blocked_target_pair",
          "scope": "pair",
          "selector": { "subject": "activation_target", "filters": [] },
          "duration": {
            "kind": "current_round",
            "starts_at": "round_start",
            "ends_at": "round_end"
          },
          "stacking": "replace",
          "visibility": "public",
          "relation": "symmetric"
        }
      }
    ],
    "mode_options": []
  },
  "passive": [],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [
    {
      "kind": "min_alive_players",
      "value": 3,
      "message": "This ability is not valid when only two players remain."
    }
  ],
  "ui": []
}
```

Notable stored parameters:

- `activation.targeting.policy: single_opponent`
- `activation.targeting.required: true`
- `activation.targeting.relation: symmetric`
- `activation.scheduled_effects[0].kind: schedule_state`
- `state.state_key: blocked_target_pair`
- `state.scope: pair`
- `state.duration.kind: current_round`
- `state.visibility: public`

What it demonstrates:

- Scheduled state creation.
- Pair-scoped state with symmetric targeting.
- A utility ability that changes legal attacks rather than directly modifying stats.

### 5. Heavy Guns

- Ability id: `heavy_guns`
- Template kind: `passive`
- Template key: `passive_modifier_round`
- Template type: `passive_modifier`
- Tags: `attack`, `passive`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {},
  "passive": [
    {
      "apply_timing": "attack",
      "selector": { "subject": "owner", "filters": [] },
      "modifiers": [
        {
          "stat": "outgoing_attack_damage",
          "operation": "add",
          "formula": { "kind": "constant", "value": 10 },
          "timing": "attack",
          "selector": { "subject": "owner", "filters": [] }
        }
      ],
      "granted_states": []
    }
  ],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [],
  "ui": []
}
```

Notable stored parameters:

- `passive[0].apply_timing: attack`
- `passive[0].modifiers[0].stat: outgoing_attack_damage`
- `passive[0].modifiers[0].operation: add`
- `passive[0].modifiers[0].formula.kind: constant`
- `passive[0].modifiers[0].formula.value: 10`

What it demonstrates:

- Passive modifier arrays.
- Stat modification without explicit activation.
- Reusable modifier objects with selector, timing, stat, and operation fields.

### 6. Holoship

- Ability id: `holoship`
- Template kind: `passive`
- Template key: `round_end_effect`
- Template type: `passive_modifier`
- Tags: `defense`, `passive`, `upkeep_cost`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {},
  "passive": [
    {
      "apply_timing": "always",
      "selector": { "subject": "owner", "filters": [] },
      "modifiers": [],
      "granted_states": [
        {
          "state_key": "untargetable",
          "scope": "self",
          "selector": { "subject": "owner", "filters": [] },
          "duration": { "kind": "while_owned" },
          "metadata": {}
        }
      ]
    },
    {
      "apply_timing": "round_end",
      "selector": { "subject": "owner", "filters": [] },
      "modifiers": [
        {
          "stat": "health",
          "operation": "subtract",
          "formula": { "kind": "constant", "value": 5 },
          "timing": "round_end",
          "selector": { "subject": "owner", "filters": [] }
        }
      ],
      "granted_states": []
    }
  ],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [],
  "ui": []
}
```

Notable stored parameters:

- `passive[0].apply_timing: always`
- `passive[0].granted_states[0].state_key: untargetable`
- `passive[0].granted_states[0].duration.kind: while_owned`
- `passive[1].apply_timing: round_end`
- `passive[1].modifiers[0].stat: health`
- `passive[1].modifiers[0].operation: subtract`
- `passive[1].modifiers[0].formula.value: 5`

What it demonstrates:

- Multiple passive blocks inside one ability.
- Granted states plus upkeep costs in the same stored object.
- Continuous untargetability while owned.

### 7. Backup Generator

- Ability id: `backup_generator`
- Template kind: `triggered`
- Template key: `trigger_on_defeat_single_use`
- Template type: `trigger_on_defeat`
- Tags: `survival`, `single_use`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {},
  "passive": [],
  "triggers": [
    {
      "event": "on_defeat",
      "selector": { "subject": "owner", "filters": [] },
      "conditions": [],
      "effects": [
        {
          "kind": "restore_health",
          "selector": { "subject": "owner", "filters": [] },
          "formula": { "kind": "constant", "value": 30 }
        }
      ],
      "priority": 100,
      "consumption": { "kind": "consume_on_trigger", "remove_from_owned": true }
    }
  ],
  "conditions": []
}
```

Notable stored parameters:

- `triggers[0].event: on_defeat`
- `triggers[0].effects[0].kind: restore_health`
- `triggers[0].effects[0].formula.kind: constant`
- `triggers[0].effects[0].formula.value: 30`
- `triggers[0].priority: 100`
- `triggers[0].consumption.kind: consume_on_trigger`
- `triggers[0].consumption.remove_from_owned: true`

What it demonstrates:

- Event-driven triggers.
- Single-use consumption metadata.
- A trigger that mutates health and removes itself after firing.

### 8. Courier Mission

- Ability id: `courier_mission`
- Template kind: `condition`
- Template key: `condition_tracker`
- Template type: `win_condition`
- Tags: `win_condition`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {},
  "passive": [],
  "triggers": [],
  "conditions": [
    {
      "evaluation_timing": "round_end",
      "round_rule": { "kind": "exact_round", "round_number": 10 },
      "predicate": { "kind": "owner_alive" },
      "outcomes": [
        {
          "kind": "declare_winner",
          "selector": { "subject": "owner", "filters": [] }
        }
      ]
    }
  ]
}
```

Notable stored parameters:

- `conditions[0].evaluation_timing: round_end`
- `conditions[0].round_rule.kind: exact_round`
- `conditions[0].round_rule.round_number: 10`
- `conditions[0].predicate.kind: owner_alive`
- `conditions[0].outcomes[0].kind: declare_winner`

What it demonstrates:

- Condition-based victory logic stored as data.
- Round-gated evaluation.
- Non-damage outcome objects.

### 9. Hyperdrive

- Ability id: `hyperdrive`
- Template kind: `activated`
- Template key: `activated_self_or_toggle`
- Template type: `utility_status`
- Tags: `utility`, `status`, `burn`, `win_condition`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {
    "kind": "toggle",
    "targeting": {
      "policy": "none",
      "required": false,
      "filters": [],
      "relation": "one_way"
    },
    "costs": [
      {
        "resource": "health",
        "formula": { "kind": "constant", "value": 5 },
        "timing": "on_activate"
      }
    ],
    "effects": [],
    "scheduled_effects": [
      {
        "kind": "schedule_state",
        "state": {
          "state_key": "hyperspace_active",
          "scope": "self",
          "selector": { "subject": "owner", "filters": [] },
          "duration": {
            "kind": "until_removed",
            "starts_at": "next_round_start",
            "ends_at": "manual_toggle"
          },
          "stacking": "replace",
          "visibility": "public"
        }
      }
    ],
    "mode_options": ["enter", "leave"]
  },
  "passive": [],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [],
  "ui": []
}
```

Notable stored parameters:

- `activation.kind: toggle`
- `activation.costs[0].resource: health`
- `activation.costs[0].formula.value: 5`
- `activation.scheduled_effects[0].state.state_key: hyperspace_active`
- `activation.scheduled_effects[0].state.duration.kind: until_removed`
- `activation.mode_options: ["enter", "leave"]`

What it demonstrates:

- Toggle semantics.
- Mode selection via the template input contract.
- A long-lived state that is manually removed rather than expiring at round end.

### 10. Mining Rig

- Ability id: `mining_rig`
- Template kind: `activated`
- Template key: `activated_spend_with_target_policy`
- Template type: `activated_utility`
- Tags: `healing`, `resource_conversion`

Stored parameters:

```json
{
  "target_policy": "none",
  "cost_mode": "variable",
  "cost_formula": { "kind": "scaled_x", "multiplier": 3 },
  "effect_formula": { "kind": "heal_x" }
}
```

What it demonstrates:

- Variable cost using a multiplier instead of direct `X`.
- Resource conversion from energy into healing.

### 11. Focused Defense

- Ability id: `focused_defense`
- Template kind: `activated`
- Template key: `activated_defense_mode`
- Template type: `activated_defense`
- Tags: `defense`, `single_opponent`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {
    "kind": "activated",
    "targeting": {
      "policy": "single_opponent",
      "required": true,
      "filters": [],
      "relation": "one_way"
    },
    "costs": [],
    "effects": [
      {
        "kind": "modify_incoming_attacks",
        "selector": { "subject": "owner", "filters": [] },
        "modifier": {
          "stat": "incoming_attack_damage",
          "operation": "multiply",
          "formula": { "kind": "constant", "value": 0.5 },
          "timing": "current_round",
          "selector": { "subject": "activation_target", "filters": [] }
        }
      }
    ],
    "scheduled_effects": [],
    "mode_options": []
  },
  "passive": [],
  "triggers": [],
  "conditions": [],
  "consumption": [],
  "limits": [],
  "ui": []
}
```

Notable stored parameters:

- `activation.targeting.policy: single_opponent`
- `activation.effects[0].kind: modify_incoming_attacks`
- `activation.effects[0].modifier.operation: multiply`
- `activation.effects[0].modifier.formula.value: 0.5`
- `activation.effects[0].modifier.selector.subject: activation_target`

What it demonstrates:

- A targeted defensive modifier.
- Modifier logic attached to the chosen opponent rather than the owner alone.

### 12. McGuffin Generator

- Ability id: `mcguffin_generator`
- Template kind: `condition`
- Template key: `condition_tracker`
- Template type: `trigger_on_round`
- Tags: `healing`, `timed_trigger`

Stored parameters:

```json
{
  "schema_version": 1,
  "activation": {},
  "passive": [],
  "triggers": [],
  "conditions": [
    {
      "evaluation_timing": "round_start",
      "round_rule": { "kind": "exact_round", "round_number": 3 },
      "predicate": { "kind": "always" },
      "outcomes": [
        {
          "kind": "heal_constant",
          "selector": { "subject": "owner", "filters": [] },
          "formula": { "kind": "heal_constant", "value": 50 }
        }
      ]
    }
  ]
}
```

Notable stored parameters:

- `conditions[0].evaluation_timing: round_start`
- `conditions[0].round_rule.kind: exact_round`
- `conditions[0].round_rule.round_number: 3`
- `conditions[0].predicate.kind: always`
- `conditions[0].outcomes[0].kind: heal_constant`
- `conditions[0].outcomes[0].formula.kind: heal_constant`
- `conditions[0].outcomes[0].formula.value: 50`

What it demonstrates:

- Condition objects used as timed triggers.
- Start-of-round evaluation with a healing outcome.

## Current Runtime Behavior

The PHP runtime uses the stored data in a few distinct stages.

### Catalog loading

- `rumble_ability_library()` selects enabled definition rows and decodes `tags_json` and `template_params_json` into PHP arrays.
- `rumble_ability_template_catalog()` selects enabled template rows and decodes `template_inputs_json` into PHP arrays.
- If the database layer is unavailable, the code has fallback helper functions, but the intended source of truth is the DB-backed catalog.

### Ownership loading and normalization

- `rumble_parse_owned_abilities()` turns `owned_abilities_json` into a normalized PHP array of ability ids.
- `rumble_encode_owned_abilities()` performs the inverse when the array is written back.
- `rumble_owned_abilities_public_view()` joins owned ids back to the catalog and adds `ability_copy_index` and `owned_instance_key` for UI-facing serialization.

### Effect history

- The resolver inserts rows into `rumble_round_effects` and JSON-encodes the effect payload before storing it.
- The presentation layer reads those rows, decodes `payload`, and generates human-readable event text.

### What is not the main source of truth today

- The active ownership flow does not use `rumble_ability_instances` to answer the question "which abilities does this player own right now?"
- That richer table looks like schema prepared for a future or partial instance-based model, but it is not the canonical ownership path used by the helpers above.

## Caveats And Design Notes

1. `template_params_json` is intentionally flexible. There is no single strict JSON schema shared by every ability row.
2. Simple activated abilities often use a shallow object, while more complex abilities use the structured `schema_version: 1` format.
3. `rumble_round_effects` is active runtime storage and should not be grouped with dormant schema.
4. `rumble_ability_instances` exists and is kept aligned to definitions by migration code, but current ownership still comes from `owned_abilities_json`.
5. Legacy ability ids can be normalized at runtime, so the stored catalog and the public/runtime ids are not purely a pass-through relationship.

## Summary

If you want to understand where a Rumble ability lives in storage, start with:

1. `rumble_ability_definitions` for the authoritative behavior data.
2. `rumble_ability_templates` for the broad kind and accepted input fields.
3. `rumble_player_state.owned_abilities_json` for who owns what right now.
4. `rumble_round_effects` for scheduled or historical effect execution.
5. `rumble_ability_instances` only if you are investigating the richer instance model that the schema supports but the ownership helpers do not currently depend on.