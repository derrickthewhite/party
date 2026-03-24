<?php

declare(strict_types=1);

/**
 * Canonical phase-2 ability library for Rumble.
 *
 * Notes:
 * - This is intentionally data-driven to support future custom ability tooling.
 * - Effects are not fully executed yet; fields are structured for resolver expansion.
 */
function rumble_default_ability_library(): array
{
    return [
        'meson_beam' => [
            'id' => 'meson_beam',
            'name' => 'Meson Beam',
            'template_type' => 'activated_attack',
            'tags' => ['attack', 'single_target', 'unblockable'],
            'text_short' => 'Spend 10 Energy. Deal 5 unblockable damage to one opponent.',
        ],
        'heavy_meson_beam' => [
            'id' => 'heavy_meson_beam',
            'name' => 'Heavy Meson Beam',
            'template_type' => 'activated_attack',
            'tags' => ['attack', 'single_target', 'unblockable'],
            'text_short' => 'Spend 20 Energy. Deal 10 unblockable damage to one opponent.',
        ],
        'ion_beam' => [
            'id' => 'ion_beam',
            'name' => 'Ion Beam',
            'template_type' => 'activated_attack',
            'tags' => ['attack', 'single_target', 'defense_only'],
            'text_short' => 'Spend 10 Energy. Deal 20 defense-only damage to one opponent.',
        ],
        'loitering_munitions' => [
            'id' => 'loitering_munitions',
            'name' => 'Loitering Munitions',
            'template_type' => 'activated_attack',
            'tags' => ['attack', 'single_target', 'delayed'],
            'text_short' => 'Spend X Energy. At the start of next round, deal X damage to one opponent.',
        ],
        'torpedo_bays' => [
            'id' => 'torpedo_bays',
            'name' => 'Torpedo Bays',
            'template_type' => 'activated_attack_modifier',
            'tags' => ['attack', 'delayed', 'modifier'],
            'text_short' => 'Spend X Energy. Next round, add X bonus damage to one attack.',
        ],
        'efficient_targeting' => [
            'id' => 'efficient_targeting',
            'name' => 'Efficient Targeting',
            'template_type' => 'activated_attack_modifier',
            'tags' => ['attack', 'cost_reduction'],
            'text_short' => 'Spend 10 Energy. Your second-largest attack this round costs 0 Energy.',
        ],
        'phase_bomb' => [
            'id' => 'phase_bomb',
            'name' => 'Phase Bomb',
            'template_type' => 'activated_attack',
            'tags' => ['attack', 'aoe'],
            'text_short' => 'Spend X Energy. Deal floor(X/2) damage to all other opponents.',
        ],
        'mine_layer' => [
            'id' => 'mine_layer',
            'name' => 'Mine Layer',
            'template_type' => 'activated_defense_trigger',
            'tags' => ['defense', 'retaliation'],
            'text_short' => 'Spend X Energy. This round, each player who attacks you takes floor(X/2) damage.',
        ],
        'hailing_frequencies' => [
            'id' => 'hailing_frequencies',
            'name' => 'Hailing Frequencies',
            'template_type' => 'utility_status',
            'tags' => ['utility', 'status', 'duel_lockout'],
            'text_short' => 'Choose one opponent. Next round, neither of you may attack the other. Not valid if only two players remain.',
        ],
        'scheming' => [
            'id' => 'scheming',
            'name' => 'Scheming',
            'template_type' => 'trigger_on_attacked',
            'tags' => ['defense', 'retaliation', 'burn'],
            'text_short' => 'Burn 10. Choose one opponent. If that opponent attacks you this round, you ignore their largest attack and they take that much damage.',
        ],
        'death_ray' => [
            'id' => 'death_ray',
            'name' => 'Death Ray',
            'template_type' => 'passive_modifier',
            'tags' => ['attack', 'passive'],
            'text_short' => 'Passive. If you make exactly one attack this round, increase that attack by 50%.',
        ],
        'heavy_guns' => [
            'id' => 'heavy_guns',
            'name' => 'Heavy Guns',
            'template_type' => 'passive_modifier',
            'tags' => ['attack', 'passive'],
            'text_short' => 'Passive. Each of your attacks deals +10 damage.',
        ],
        'holoship' => [
            'id' => 'holoship',
            'name' => 'Holoship',
            'template_type' => 'passive_modifier',
            'tags' => ['defense', 'passive', 'upkeep_cost'],
            'text_short' => 'Passive. You cannot be targeted by attacks. At end of round, lose 5 Health.',
        ],
        'hyperdrive' => [
            'id' => 'hyperdrive',
            'name' => 'Hyperdrive',
            'template_type' => 'utility_status',
            'tags' => ['utility', 'status', 'burn', 'win_condition'],
            'text_short' => 'Burn 5 to enter or leave Hyperspace. In Hyperspace, you cannot attack or be attacked.',
        ],
        'cloaking_system' => [
            'id' => 'cloaking_system',
            'name' => 'Cloaking System',
            'template_type' => 'activated_defense',
            'tags' => ['defense', 'delayed', 'burn'],
            'text_short' => 'Spend 20 Energy and Burn 5. You cannot be attacked next round.',
        ],
        'shield_capacitors' => [
            'id' => 'shield_capacitors',
            'name' => 'Shield Capacitors',
            'template_type' => 'activated_defense',
            'tags' => ['defense'],
            'text_short' => 'Spend 10 Energy. Gain +20 Defense this round.',
        ],
        'shield_boosters' => [
            'id' => 'shield_boosters',
            'name' => 'Shield Boosters',
            'template_type' => 'round_start_effect',
            'tags' => ['defense', 'passive'],
            'text_short' => 'Passive. Gain +20 Defense at the start of each round.',
        ],
        'reflective_shield' => [
            'id' => 'reflective_shield',
            'name' => 'Reflective Shield',
            'template_type' => 'trigger_on_attacked',
            'tags' => ['defense', 'retaliation', 'passive'],
            'text_short' => 'Passive. Whenever you take attack damage, the attacker takes half that damage.',
        ],
        'energy_absorption' => [
            'id' => 'energy_absorption',
            'name' => 'Energy Absorption',
            'template_type' => 'round_start_effect',
            'tags' => ['resource', 'delayed'],
            'text_short' => 'Spend 10 Energy. At the start of next round, gain Energy equal to half the damage your Defense blocked this round.',
        ],
        'armor' => [
            'id' => 'armor',
            'name' => 'Armor',
            'template_type' => 'passive_modifier',
            'tags' => ['defense', 'passive'],
            'text_short' => 'Passive. Reduce each incoming attack by 5.',
        ],
        'heavy_armor' => [
            'id' => 'heavy_armor',
            'name' => 'Heavy Armor',
            'template_type' => 'passive_modifier',
            'tags' => ['defense', 'passive'],
            'text_short' => 'Passive. Reduce each incoming attack by 10.',
        ],
        'backup_generator' => [
            'id' => 'backup_generator',
            'name' => 'Backup Generator',
            'template_type' => 'trigger_on_defeat',
            'tags' => ['survival', 'single_use'],
            'text_short' => 'Triggered. If reduced to 0 Health, lose this ability and set Health to 30.',
        ],
        'escape_pods' => [
            'id' => 'escape_pods',
            'name' => 'Escape Pods',
            'template_type' => 'trigger_on_defeat',
            'tags' => ['survival', 'single_use'],
            'text_short' => 'Triggered. If reduced to 0 Health, lose this ability and set Health to 20.',
        ],
        'nimble_dodge' => [
            'id' => 'nimble_dodge',
            'name' => 'Nimble Dodge',
            'template_type' => 'activated_defense',
            'tags' => ['defense', 'single_attack_negation'],
            'text_short' => 'Spend 10 Energy. Negate the largest attack against you this round. Not valid if only two players remain.',
        ],
        'focused_defense' => [
            'id' => 'focused_defense',
            'name' => 'Focused Defense',
            'template_type' => 'activated_defense',
            'tags' => ['defense', 'single_opponent'],
            'text_short' => 'Choose one opponent. Halve attacks from that opponent this round.',
        ],
        'turbo_generator' => [
            'id' => 'turbo_generator',
            'name' => 'Turbo Generator',
            'template_type' => 'passive_modifier',
            'tags' => ['resource', 'passive'],
            'text_short' => 'Passive. Your per-round Energy is Health + 10.',
        ],
        'mcguffin_generator' => [
            'id' => 'mcguffin_generator',
            'name' => 'McGuffin Generator',
            'template_type' => 'trigger_on_round',
            'tags' => ['healing', 'timed_trigger'],
            'text_short' => 'Triggered. At the start of round 3, gain 50 Health.',
        ],
        'courier_mission' => [
            'id' => 'courier_mission',
            'name' => 'Courier Mission',
            'template_type' => 'win_condition',
            'tags' => ['win_condition'],
            'text_short' => 'Win condition. If you are alive at end of round 10, you win.',
        ],
        'automated_repair_systems' => [
            'id' => 'automated_repair_systems',
            'name' => 'Automated Repair Systems',
            'template_type' => 'round_start_effect',
            'tags' => ['healing', 'passive'],
            'text_short' => 'Passive. Gain 5 Health each round, up to your starting maximum Health.',
        ],
        'replicators' => [
            'id' => 'replicators',
            'name' => 'Replicators',
            'template_type' => 'round_start_effect',
            'tags' => ['healing', 'passive'],
            'text_short' => 'Passive. Gain 5 Health each round.',
        ],
        'mining_rig' => [
            'id' => 'mining_rig',
            'name' => 'Mining Rig',
            'template_type' => 'activated_utility',
            'tags' => ['healing', 'resource_conversion'],
            'text_short' => 'Spend 3X Energy. Gain X Health.',
        ],
    ];
}

function rumble_ability_library(): array
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }

    try {
        $stmt = db()->query(
            'SELECT ability_id, ability_name, template_type, template_key, tags_json, description, template_params_json '
            . 'FROM rumble_ability_definitions '
            . 'WHERE is_enabled = 1 '
            . 'ORDER BY ability_id ASC'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        $library = [];
        foreach ((array)$rows as $row) {
            $abilityId = trim((string)($row['ability_id'] ?? ''));
            if ($abilityId === '') {
                continue;
            }

            $tagsDecoded = json_decode((string)($row['tags_json'] ?? '[]'), true);
            $tags = [];
            if (is_array($tagsDecoded)) {
                foreach ($tagsDecoded as $tag) {
                    $value = trim((string)$tag);
                    if ($value === '') {
                        continue;
                    }
                    $tags[] = $value;
                }
            }

            $paramsDecoded = json_decode((string)($row['template_params_json'] ?? '{}'), true);
            $params = is_array($paramsDecoded) ? $paramsDecoded : [];

            $entry = [
                'id' => $abilityId,
                'name' => trim((string)($row['ability_name'] ?? $abilityId)),
                'template_type' => trim((string)($row['template_type'] ?? '')),
                'tags' => $tags,
                'text_short' => trim((string)($row['description'] ?? '')),
                'template_params' => $params,
            ];
            $templateKey = trim((string)($row['template_key'] ?? ''));
            if ($templateKey !== '') {
                $entry['template_key'] = $templateKey;
            }

            $library[$abilityId] = $entry;
        }

        if (count($library) > 0) {
            $cached = $library;
            return $cached;
        }
    } catch (Throwable $ignored) {
        // Fall back to built-in defaults when migration tables are unavailable.
    }

    $cached = rumble_default_ability_library();
    return $cached;
}

function rumble_ability_exists(string $abilityId): bool
{
    $library = rumble_ability_library();
    return isset($library[$abilityId]);
}

function rumble_ability_by_id(string $abilityId): ?array
{
    $library = rumble_ability_library();
    return $library[$abilityId] ?? null;
}

function rumble_default_ability_template_catalog(): array
{
    return [
        'activated_spend_with_target_policy' => [
            'id' => 'activated_spend_with_target_policy',
            'kind' => 'activated',
            'inputs' => [
                'target_user_id' => ['type' => 'int', 'required' => false],
                'x_cost' => ['type' => 'int', 'required' => false, 'min' => 0],
                'is_enabled' => ['type' => 'bool', 'required' => false],
            ],
        ],
        'activated_self_or_toggle' => [
            'id' => 'activated_self_or_toggle',
            'kind' => 'activated',
            'inputs' => [
                'mode' => ['type' => 'string', 'required' => false],
                'x_cost' => ['type' => 'int', 'required' => false, 'min' => 0],
                'is_enabled' => ['type' => 'bool', 'required' => false],
            ],
        ],
        'activated_defense_mode' => [
            'id' => 'activated_defense_mode',
            'kind' => 'activated',
            'inputs' => [
                'target_user_id' => ['type' => 'int', 'required' => false],
                'x_cost' => ['type' => 'int', 'required' => false, 'min' => 0],
                'is_enabled' => ['type' => 'bool', 'required' => false],
            ],
        ],
        'passive_modifier_round' => [
            'id' => 'passive_modifier_round',
            'kind' => 'passive',
            'inputs' => [],
        ],
        'trigger_on_attacked' => [
            'id' => 'trigger_on_attacked',
            'kind' => 'triggered',
            'inputs' => [],
        ],
        'trigger_on_defeat_single_use' => [
            'id' => 'trigger_on_defeat_single_use',
            'kind' => 'triggered',
            'inputs' => [],
        ],
        'round_start_effect' => [
            'id' => 'round_start_effect',
            'kind' => 'passive',
            'inputs' => [],
        ],
        'round_end_effect' => [
            'id' => 'round_end_effect',
            'kind' => 'passive',
            'inputs' => [],
        ],
        'condition_tracker' => [
            'id' => 'condition_tracker',
            'kind' => 'condition',
            'inputs' => [],
        ],
    ];
}

function rumble_ability_template_catalog(): array
{
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }

    try {
        $stmt = db()->query(
            'SELECT template_key, template_kind, template_inputs_json '
            . 'FROM rumble_ability_templates '
            . 'WHERE is_enabled = 1 '
            . 'ORDER BY template_key ASC'
        );
        $rows = $stmt ? $stmt->fetchAll() : [];
        $catalog = [];
        foreach ((array)$rows as $row) {
            $templateKey = trim((string)($row['template_key'] ?? ''));
            if ($templateKey === '') {
                continue;
            }
            $inputsDecoded = json_decode((string)($row['template_inputs_json'] ?? '{}'), true);
            $catalog[$templateKey] = [
                'id' => $templateKey,
                'kind' => trim((string)($row['template_kind'] ?? 'unknown')),
                'inputs' => is_array($inputsDecoded) ? $inputsDecoded : [],
            ];
        }

        if (count($catalog) > 0) {
            $cached = $catalog;
            return $cached;
        }
    } catch (Throwable $ignored) {
        // Fall back to built-in defaults when migration tables are unavailable.
    }

    $cached = rumble_default_ability_template_catalog();
    return $cached;
}

function rumble_ability_template_key(array $ability): string
{
    $explicitTemplateKey = trim((string)($ability['template_key'] ?? ''));
    if ($explicitTemplateKey !== '') {
        return $explicitTemplateKey;
    }

    $abilityId = (string)($ability['id'] ?? '');
    $type = (string)($ability['template_type'] ?? '');
    $tags = array_values(array_map(static fn ($v): string => (string)$v, (array)($ability['tags'] ?? [])));
    $tagSet = array_fill_keys($tags, true);

    if ($type === 'win_condition' || $type === 'trigger_on_round') {
        return 'condition_tracker';
    }
    if ($type === 'trigger_on_defeat') {
        return 'trigger_on_defeat_single_use';
    }
    if ($type === 'trigger_on_attacked' || $type === 'activated_defense_trigger') {
        return 'trigger_on_attacked';
    }
    if ($type === 'passive_modifier') {
        return 'passive_modifier_round';
    }
    if ($type === 'round_start_effect') {
        return 'round_start_effect';
    }
    if (isset($tagSet['upkeep_cost'])) {
        return 'round_end_effect';
    }
    if ($type === 'activated_defense') {
        return 'activated_defense_mode';
    }
    if ($type === 'utility_status' || $abilityId === 'hyperdrive') {
        return 'activated_self_or_toggle';
    }
    if ($type === 'activated_attack' || $type === 'activated_attack_modifier' || $type === 'activated_utility') {
        return 'activated_spend_with_target_policy';
    }
    return 'passive_modifier_round';
}

function rumble_ability_template_params(array $ability): array
{
    if (isset($ability['template_params']) && is_array($ability['template_params'])) {
        return $ability['template_params'];
    }

    $abilityId = (string)($ability['id'] ?? '');
    $type = (string)($ability['template_type'] ?? '');
    $tags = array_values(array_map(static fn ($v): string => (string)$v, (array)($ability['tags'] ?? [])));
    $tagSet = array_fill_keys($tags, true);
    $templateKey = rumble_ability_template_key($ability);

    if ($templateKey === 'activated_spend_with_target_policy') {
        $costFormulaByAbilityId = [
            'meson_beam' => ['kind' => 'constant', 'value' => 10],
            'heavy_meson_beam' => ['kind' => 'constant', 'value' => 20],
            'ion_beam' => ['kind' => 'constant', 'value' => 10],
            'efficient_targeting' => ['kind' => 'constant', 'value' => 10],
            'loitering_munitions' => ['kind' => 'variable_x'],
            'torpedo_bays' => ['kind' => 'variable_x'],
            'phase_bomb' => ['kind' => 'variable_x'],
            'mining_rig' => ['kind' => 'scaled_x', 'multiplier' => 3],
        ];
        $costFormula = $costFormulaByAbilityId[$abilityId] ?? null;
        if ($costFormula === null && preg_match('/Spend\s+\d*X/i', (string)($ability['text_short'] ?? '')) === 1) {
            $costFormula = ['kind' => 'variable_x'];
        }
        $params = [
            'target_policy' => isset($tagSet['aoe']) ? 'all_other_players' : (isset($tagSet['single_target']) ? 'single_opponent' : 'optional_target'),
            'cost_mode' => in_array((string)($costFormula['kind'] ?? ''), ['variable_x', 'scaled_x'], true) ? 'variable' : 'fixed',
            'cost_formula' => $costFormula,
            'effect_formula' => null,
        ];
        if ($abilityId === 'meson_beam') {
            $params['effect_formula'] = ['kind' => 'damage_constant', 'value' => 5, 'channel' => 'unblockable'];
        } elseif ($abilityId === 'heavy_meson_beam') {
            $params['effect_formula'] = ['kind' => 'damage_constant', 'value' => 10, 'channel' => 'unblockable'];
        } elseif ($abilityId === 'phase_bomb') {
            $params['effect_formula'] = ['kind' => 'damage_floor_half_x', 'channel' => 'normal'];
        }
        return $params;
    }

    if ($templateKey === 'activated_defense_mode') {
        $costFormulaByAbilityId = [
            'shield_capacitors' => ['kind' => 'constant', 'value' => 10],
            'nimble_dodge' => ['kind' => 'constant', 'value' => 10],
            'cloaking_system' => ['kind' => 'constant', 'value' => 20],
            'mine_layer' => ['kind' => 'variable_x'],
        ];
        return [
            'cost_formula' => $costFormulaByAbilityId[$abilityId] ?? null,
        ];
    }
    if ($templateKey === 'trigger_on_defeat_single_use') {
        return [
            'trigger' => 'on_defeat',
            'single_use' => true,
            'restore_health' => $abilityId === 'backup_generator' ? 30 : 20,
        ];
    }

    if ($templateKey === 'passive_modifier_round') {
        if ($abilityId === 'armor') {
            return ['reduction_per_attack' => 5];
        }
        if ($abilityId === 'heavy_armor') {
            return ['reduction_per_attack' => 10];
        }
    }

    if ($templateKey === 'condition_tracker') {
        if ($type === 'trigger_on_round') {
            return [
                'evaluation_window' => 'round_start',
                'round_number' => 3,
                'outcome' => ['kind' => 'heal_constant', 'value' => 50],
            ];
        }
        if ($type === 'win_condition') {
            return [
                'evaluation_window' => 'round_end',
                'round_number' => 10,
                'condition' => 'owner_alive',
                'outcome' => ['kind' => 'declare_winner'],
            ];
        }
    }

    return [];
}

function rumble_ability_public_view(array $ability): array
{
    $templateKey = rumble_ability_template_key($ability);
    $catalog = rumble_ability_template_catalog();
    $templateMeta = $catalog[$templateKey] ?? ['id' => $templateKey, 'kind' => 'unknown', 'inputs' => []];

    return [
        'id' => (string)($ability['id'] ?? ''),
        'name' => (string)($ability['name'] ?? ''),
        'title' => (string)($ability['name'] ?? ''),
        'template_type' => (string)($ability['template_type'] ?? ''),
        'template_key' => $templateKey,
        'template_kind' => (string)($templateMeta['kind'] ?? 'unknown'),
        'template_inputs' => (array)($templateMeta['inputs'] ?? []),
        'template_params' => rumble_ability_template_params($ability),
        'tags' => array_values(array_map(static fn ($v): string => (string)$v, (array)($ability['tags'] ?? []))),
        'description' => (string)($ability['text_short'] ?? ''),
    ];
}

function rumble_parse_owned_abilities(?string $raw): array
{
    if ($raw === null || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    $seen = [];
    $ids = [];
    foreach ($decoded as $abilityId) {
        $id = trim((string)$abilityId);
        if ($id === '' || isset($seen[$id]) || !rumble_ability_exists($id)) {
            continue;
        }

        $seen[$id] = true;
        $ids[] = $id;
    }

    sort($ids, SORT_STRING);
    return $ids;
}

function rumble_encode_owned_abilities(array $abilityIds): string
{
    $seen = [];
    $normalized = [];
    foreach ($abilityIds as $abilityId) {
        $id = trim((string)$abilityId);
        if ($id === '' || isset($seen[$id]) || !rumble_ability_exists($id)) {
            continue;
        }

        $seen[$id] = true;
        $normalized[] = $id;
    }

    sort($normalized, SORT_STRING);

    return json_encode($normalized, JSON_UNESCAPED_UNICODE);
}

function rumble_pick_random_abilities(int $count): array
{
    $library = rumble_ability_library();
    $ids = array_keys($library);
    if ($count <= 0) {
        return [];
    }

    shuffle($ids);
    return array_slice($ids, 0, min($count, count($ids)));
}

function rumble_normalize_ability_activations($raw, bool $strict = false): array
{
    if (!is_array($raw)) {
        if ($strict) {
            throw new InvalidArgumentException('Ability activations must be an array.');
        }
        return [];
    }

    $normalized = [];
    foreach ($raw as $idx => $item) {
        if (!is_array($item)) {
            if ($strict) {
                throw new InvalidArgumentException('Each ability activation must be an object.');
            }
            continue;
        }

        $abilityId = trim((string)($item['ability_id'] ?? ''));
        if ($abilityId === '' || !rumble_ability_exists($abilityId)) {
            if ($strict) {
                throw new InvalidArgumentException('Ability activation ability_id is required and must be valid.');
            }
            continue;
        }

        $entry = [
            'ability_id' => $abilityId,
            'client_order_index' => max(0, is_int($idx) ? $idx : 0),
        ];

        $instanceRaw = $item['ability_instance_id'] ?? null;
        if ($instanceRaw !== null && $instanceRaw !== '') {
            if (!is_int($instanceRaw) && !ctype_digit((string)$instanceRaw)) {
                if ($strict) {
                    throw new InvalidArgumentException('ability_instance_id must be a positive integer when provided.');
                }
            } else {
                $instanceId = (int)$instanceRaw;
                if ($instanceId > 0) {
                    $entry['ability_instance_id'] = $instanceId;
                } elseif ($strict) {
                    throw new InvalidArgumentException('ability_instance_id must be a positive integer when provided.');
                }
            }
        }

        $targetRaw = $item['target_user_id'] ?? null;
        if ($targetRaw !== null && $targetRaw !== '') {
            if (!is_int($targetRaw) && !ctype_digit((string)$targetRaw)) {
                if ($strict) {
                    throw new InvalidArgumentException('target_user_id must be a positive integer when provided.');
                }
            } else {
                $targetId = (int)$targetRaw;
                if ($targetId > 0) {
                    $entry['target_user_id'] = $targetId;
                } elseif ($strict) {
                    throw new InvalidArgumentException('target_user_id must be a positive integer when provided.');
                }
            }
        }

        if (array_key_exists('x_cost', $item)) {
            $xCostRaw = $item['x_cost'];
            if (!is_int($xCostRaw) && !ctype_digit((string)$xCostRaw)) {
                if ($strict) {
                    throw new InvalidArgumentException('x_cost must be a whole non-negative number when provided.');
                }
            } else {
                $xCost = (int)$xCostRaw;
                if ($xCost >= 0) {
                    $entry['x_cost'] = $xCost;
                } elseif ($strict) {
                    throw new InvalidArgumentException('x_cost must be non-negative.');
                }
            }
        }

        if (array_key_exists('mode', $item)) {
            $mode = trim((string)$item['mode']);
            if ($mode !== '') {
                if (strlen($mode) > 40) {
                    if ($strict) {
                        throw new InvalidArgumentException('mode must be 40 characters or fewer.');
                    }
                } else {
                    $entry['mode'] = $mode;
                }
            }
        }

        if (array_key_exists('is_enabled', $item)) {
            $enabled = $item['is_enabled'];
            if (is_bool($enabled)) {
                $entry['is_enabled'] = $enabled;
            } elseif ($strict) {
                throw new InvalidArgumentException('is_enabled must be a boolean when provided.');
            }
        }

        if (array_key_exists('client_order_index', $item)) {
            $indexRaw = $item['client_order_index'];
            if (!is_int($indexRaw) && !ctype_digit((string)$indexRaw)) {
                if ($strict) {
                    throw new InvalidArgumentException('client_order_index must be a whole non-negative number.');
                }
            } else {
                $entry['client_order_index'] = max(0, (int)$indexRaw);
            }
        }

        $normalized[] = $entry;
    }

    usort($normalized, static function (array $a, array $b): int {
        $indexCmp = ((int)($a['client_order_index'] ?? 0)) <=> ((int)($b['client_order_index'] ?? 0));
        if ($indexCmp !== 0) {
            return $indexCmp;
        }
        return strcmp((string)($a['ability_id'] ?? ''), (string)($b['ability_id'] ?? ''));
    });

    return array_values($normalized);
}

function rumble_player_round_energy_budget(int $health, array $ownedAbilityIds): int
{
    $budget = max(0, $health);
    $owned = array_fill_keys(array_values(array_map(static fn ($v): string => (string)$v, $ownedAbilityIds)), true);
    if (isset($owned['turbo_generator'])) {
        $budget += 10;
    }
    return $budget;
}

function rumble_evaluate_activation_cost_formula(array $formula, int $xCost): ?int
{
    $kind = trim((string)($formula['kind'] ?? ''));
    if ($kind === '') {
        return null;
    }

    if ($kind === 'constant') {
        return max(0, (int)($formula['value'] ?? 0));
    }

    if ($kind === 'variable_x') {
        return max(0, $xCost);
    }

    if ($kind === 'scaled_x') {
        $multiplier = max(0, (int)($formula['multiplier'] ?? 0));
        return max(0, $xCost * $multiplier);
    }

    return null;
}

function rumble_activation_energy_cost(array $activation, bool $strict = false): int
{
    $abilityId = trim((string)($activation['ability_id'] ?? ''));
    if ($abilityId === '') {
        if ($strict) {
            throw new InvalidArgumentException('Ability activation ability_id is required.');
        }
        return 0;
    }

    $ability = rumble_ability_by_id($abilityId);
    if ($ability === null) {
        if ($strict) {
            throw new InvalidArgumentException('Ability activation ability_id is not valid.');
        }
        return 0;
    }

    $templateKey = rumble_ability_template_key($ability);
    $params = rumble_ability_template_params($ability);
    $xCost = max(0, (int)($activation['x_cost'] ?? 0));
    $costFormula = is_array($params['cost_formula'] ?? null) ? (array)$params['cost_formula'] : [];
    $costFormulaKind = trim((string)($costFormula['kind'] ?? ''));
    if (in_array($costFormulaKind, ['variable_x', 'scaled_x'], true) && !array_key_exists('x_cost', $activation) && $strict) {
        throw new InvalidArgumentException('x_cost is required for this variable-cost ability.');
    }

    $formulaCost = rumble_evaluate_activation_cost_formula($costFormula, $xCost);
    if ($formulaCost !== null) {
        return $formulaCost;
    }

    if ($templateKey === 'activated_spend_with_target_policy') {
        $costMode = (string)($params['cost_mode'] ?? 'fixed');
        if ($costMode === 'variable') {
            if (!array_key_exists('x_cost', $activation) && $strict) {
                throw new InvalidArgumentException('x_cost is required for this variable-cost ability.');
            }
            return $xCost;
        }

        return 0;
    }

    if ($templateKey === 'activated_defense_mode') {
        if (array_key_exists('x_cost', $activation)) {
            return $xCost;
        }
        return 0;
    }

    if ($templateKey === 'activated_self_or_toggle') {
        return $xCost;
    }

    return 0;
}

function rumble_round_effect_human_text(array $effectRow, array $nameByUser = []): string
{
    $effectKey = (string)($effectRow['effect_key'] ?? '');
    $ownerUserId = isset($effectRow['owner_user_id']) ? (int)$effectRow['owner_user_id'] : 0;
    $targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null ? (int)$effectRow['target_user_id'] : 0;
    $ownerName = ($ownerUserId > 0 && isset($nameByUser[$ownerUserId])) ? (string)$nameByUser[$ownerUserId] : ('User ' . $ownerUserId);
    $targetName = ($targetUserId > 0 && isset($nameByUser[$targetUserId])) ? (string)$nameByUser[$targetUserId] : ($targetUserId > 0 ? ('User ' . $targetUserId) : '');

    $payloadRaw = $effectRow['payload'] ?? [];
    if (is_string($payloadRaw)) {
        $decoded = json_decode($payloadRaw, true);
        $payload = is_array($decoded) ? $decoded : [];
    } elseif (is_array($payloadRaw)) {
        $payload = $payloadRaw;
    } else {
        $payload = [];
    }

    if ($effectKey === 'step1:set_round_stats') {
        return $ownerName . ' starts round with Health ' . (int)($payload['health'] ?? 0) . ' and Energy ' . (int)($payload['energy_budget'] ?? 0) . '.';
    }
    if ($effectKey === 'step2:passive_round_start_heal') {
        return $ownerName . ' gains passive round-start healing: +' . (int)($payload['amount'] ?? 0) . ' Health from ' . (string)($payload['source_ability_id'] ?? 'unknown') . '.';
    }
    if ($effectKey === 'step2:passive_round_start_defense') {
        return $ownerName . ' gains round-start defense bonus: +' . (int)($payload['defense_bonus'] ?? 0) . '.';
    }
    if ($effectKey === 'step2:scheduled_status') {
        return $ownerName . ' receives scheduled status: ' . (string)($payload['effect'] ?? 'unknown') . '.';
    }
    if (str_starts_with($effectKey, 'activation:')) {
        $abilityId = (string)($payload['ability_id'] ?? substr($effectKey, strlen('activation:')));
        $cost = (int)($payload['cost'] ?? 0);
        if ($targetName !== '') {
            return $ownerName . ' activates ' . $abilityId . ' on ' . $targetName . ' (cost ' . $cost . ').';
        }
        return $ownerName . ' activates ' . $abilityId . ' (cost ' . $cost . ').';
    }
    if ($effectKey === 'step4:energy_summary') {
        return $ownerName . ' energy spend summary: budget ' . (int)($payload['energy_budget'] ?? 0)
            . ', attacks ' . (int)($payload['attack_energy_spent'] ?? 0)
            . ', abilities ' . (int)($payload['ability_energy_spent'] ?? 0)
            . ', remaining ' . (int)($payload['energy_remaining'] ?? 0) . '.';
    }
    if ($effectKey === 'trigger:nimble_dodge') {
        return $ownerName . ' triggers Nimble Dodge and negates ' . (int)($payload['negated_attack'] ?? 0)
            . ' damage from ' . ($targetName !== '' ? $targetName : 'an attacker') . '.';
    }
    if ($effectKey === 'step6:damage_resolution') {
        return $ownerName . ' resolves damage: normal ' . (int)($payload['normal_incoming'] ?? 0)
            . ', unblockable ' . (int)($payload['unblockable_incoming'] ?? 0)
            . ', total ' . (int)($payload['final_damage'] ?? 0)
            . ', health now ' . (int)($payload['next_health'] ?? 0) . '.';
    }
    if ($effectKey === 'trigger:on_defeat_restore') {
        return $ownerName . ' triggers defeat restore and returns to ' . (int)($payload['restored_health'] ?? 0) . ' Health.';
    }
    if ($effectKey === 'step7:upkeep_cost') {
        return $ownerName . ' pays upkeep cost ' . (int)($payload['health_loss'] ?? 0)
            . ' from ' . (string)($payload['source_ability_id'] ?? 'unknown') . '.';
    }

    $parts = ['Event ' . $effectKey . ' by ' . $ownerName];
    if ($targetName !== '') {
        $parts[] = 'target ' . $targetName;
    }
    return implode(' | ', $parts);
}
