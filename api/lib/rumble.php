<?php

declare(strict_types=1);

/**
 * Canonical phase-2 ability library for Rumble.
 *
 * Notes:
 * - This is intentionally data-driven to support future custom ability tooling.
 * - Effects are not fully executed yet; fields are structured for resolver expansion.
 */
function rumble_ability_library(): array
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

function rumble_ability_public_view(array $ability): array
{
    return [
        'id' => (string)($ability['id'] ?? ''),
        'name' => (string)($ability['name'] ?? ''),
        'title' => (string)($ability['name'] ?? ''),
        'template_type' => (string)($ability['template_type'] ?? ''),
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
