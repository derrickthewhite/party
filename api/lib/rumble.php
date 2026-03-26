<?php

declare(strict_types=1);

require_once __DIR__ . '/sql.php';

/**
 * Canonical phase-2 ability library for Rumble.
 *
 * Notes:
 * - This is intentionally data-driven to support future custom ability tooling.
 * - Effects are not fully executed yet; fields are structured for resolver expansion.
 */
function rumble_default_ability_library(): array
{
    /*
    Intentionally disabled.

    Rumble gameplay numbers and authored runtime metadata must come from
    rumble_ability_definitions.template_params_json in the database, not from
    PHP fallback constants.
    */
    return [];
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
        $fallbackLibrary = rumble_default_ability_library();
        foreach ((array)$rows as $row) {
            $abilityIdRaw = trim((string)($row['ability_id'] ?? ''));
            $abilityId = rumble_canonical_ability_id($abilityIdRaw);
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
            $fallbackAbility = $fallbackLibrary[$abilityId] ?? [];
            $abilityName = trim((string)($row['ability_name'] ?? ($fallbackAbility['name'] ?? $abilityId)));
            if ($abilityIdRaw !== $abilityId && isset($fallbackAbility['name'])) {
                $abilityName = (string)$fallbackAbility['name'];
            }

            $entry = array_replace($fallbackAbility, [
                'id' => $abilityId,
                'name' => $abilityName,
                'template_type' => trim((string)($row['template_type'] ?? ($fallbackAbility['template_type'] ?? ''))),
                'tags' => count($tags) > 0 ? $tags : (array)($fallbackAbility['tags'] ?? []),
                'text_short' => trim((string)($row['description'] ?? ($fallbackAbility['text_short'] ?? ''))),
                'template_params' => array_replace((array)($fallbackAbility['template_params'] ?? []), $params),
            ]);
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
        // DB-backed ability definitions are required; the built-in fallback is disabled.
    }

    $cached = rumble_default_ability_library();
    return $cached;
}

function rumble_canonical_ability_id(string $abilityId): string
{
    $normalized = trim($abilityId);
    if ($normalized === 'cloaking_system') {
        return 'cloaking_field';
    }
    return $normalized;
}

function rumble_ability_exists(string $abilityId): bool
{
    $library = rumble_ability_library();
    return isset($library[rumble_canonical_ability_id($abilityId)]);
}

function rumble_ability_by_id(string $abilityId): ?array
{
    $library = rumble_ability_library();
    return $library[rumble_canonical_ability_id($abilityId)] ?? null;
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
                'target_user_id' => ['type' => 'int', 'required' => false],
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

    $type = (string)($ability['template_type'] ?? '');
    $tags = array_values(array_map(static fn ($v): string => (string)$v, (array)($ability['tags'] ?? [])));
    $tagSet = array_fill_keys($tags, true);

    if ($type === 'win_condition' || $type === 'trigger_on_round') {
        return 'condition_tracker';
    }
    if ($type === 'trigger_on_defeat') {
        return 'trigger_on_defeat_single_use';
    }
        if ($type === 'trigger_on_attacked') {
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
    if ($type === 'utility_status') {
        return 'activated_self_or_toggle';
    }
    if ($type === 'activated_attack' || $type === 'activated_attack_modifier' || $type === 'activated_utility') {
        return 'activated_spend_with_target_policy';
    }
    return 'passive_modifier_round';
}

function rumble_ability_template_params(array $ability): array
{
    return isset($ability['template_params']) && is_array($ability['template_params'])
        ? $ability['template_params']
        : [];
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

function rumble_runtime_formula(string $kind, array $overrides = []): array
{
    return array_replace([
        'kind' => $kind,
    ], $overrides);
}

function rumble_runtime_duration(string $kind, array $overrides = []): array
{
    return array_replace([
        'kind' => $kind,
    ], $overrides);
}

function rumble_runtime_selector(string $subject, array $overrides = []): array
{
    return array_replace([
        'subject' => $subject,
        'filters' => [],
    ], $overrides);
}

function rumble_runtime_targeting(string $policy, bool $required, array $overrides = []): array
{
    return array_replace([
        'policy' => $policy,
        'required' => $required,
        'filters' => [],
        'relation' => 'one_way',
    ], $overrides);
}

function rumble_runtime_cost(string $resource, array $formula, string $timing = 'on_activate'): array
{
    return [
        'resource' => $resource,
        'formula' => $formula,
        'timing' => $timing,
    ];
}

function rumble_runtime_modifier(string $stat, string $operation, array $formula, string $timing, array $selector, array $overrides = []): array
{
    return array_replace([
        'stat' => $stat,
        'operation' => $operation,
        'formula' => $formula,
        'timing' => $timing,
        'selector' => $selector,
    ], $overrides);
}

function rumble_runtime_state(string $stateKey, string $scope, array $selector, array $duration, array $overrides = []): array
{
    return array_replace([
        'state_key' => $stateKey,
        'scope' => $scope,
        'selector' => $selector,
        'duration' => $duration,
        'stacking' => 'replace',
        'visibility' => 'public',
    ], $overrides);
}

function rumble_runtime_effect(string $kind, array $overrides = []): array
{
    return array_replace([
        'kind' => $kind,
    ], $overrides);
}

function rumble_is_runtime_contract(array $params): bool
{
    return isset($params['schema_version'])
        && array_key_exists('activation', $params)
        && isset($params['passive'])
        && isset($params['triggers'])
        && isset($params['conditions']);
}

function rumble_empty_runtime_contract(): array
{
    return [
        'schema_version' => 1,
        'activation' => [],
        'passive' => [],
        'triggers' => [],
        'conditions' => [],
        'consumption' => [],
        'limits' => [],
        'ui' => [],
    ];
}

function rumble_ability_runtime_contract(array $ability): array
{
    $params = rumble_ability_template_params($ability);
    if (rumble_is_runtime_contract($params)) {
        return $params;
    }
    return rumble_empty_runtime_contract();
}

function rumble_ability_state_grants(array $ability, string $timing = 'always'): array
{
    $contract = rumble_ability_runtime_contract($ability);
    $states = [];
    foreach ((array)($contract['passive'] ?? []) as $rule) {
        if ((string)($rule['apply_timing'] ?? '') !== $timing) {
            continue;
        }
        foreach ((array)($rule['granted_states'] ?? []) as $state) {
            if (is_array($state)) {
                $states[] = $state;
            }
        }
    }
    return $states;
}

function rumble_ability_modifier_sum(array $ability, string $stat, string $operation, string $timing): float
{
    $contract = rumble_ability_runtime_contract($ability);
    $total = 0.0;
    foreach ((array)($contract['passive'] ?? []) as $rule) {
        if ((string)($rule['apply_timing'] ?? '') !== $timing) {
            continue;
        }
        foreach ((array)($rule['modifiers'] ?? []) as $modifier) {
            if (!is_array($modifier)) {
                continue;
            }
            if ((string)($modifier['stat'] ?? '') !== $stat || (string)($modifier['operation'] ?? '') !== $operation) {
                continue;
            }
            $formula = is_array($modifier['formula'] ?? null) ? (array)$modifier['formula'] : [];
            if ((string)($formula['kind'] ?? '') !== 'constant') {
                continue;
            }
            $total += (float)($formula['value'] ?? 0);
        }
    }
    return $total;
}

function rumble_runtime_state_from_payload(array $payload, int $ownerUserId, ?int $targetUserId = null): ?array
{
    if (isset($payload['state']) && is_array($payload['state'])) {
        return $payload['state'];
    }

    $effect = trim((string)($payload['effect'] ?? ''));
    if ($effect === 'cloaked_until_round_end') {
        return rumble_runtime_state('untargetable', 'self', rumble_runtime_selector('owner'), rumble_runtime_duration('current_round'), [
            'owner_user_id' => $ownerUserId,
        ]);
    }
    if ($effect === 'hyperspace_active') {
        return rumble_runtime_state('hyperspace_active', 'self', rumble_runtime_selector('owner'), rumble_runtime_duration('current_round'), [
            'owner_user_id' => $ownerUserId,
        ]);
    }
    if ($effect === 'hailing_lockout' && $targetUserId !== null && $targetUserId > 0) {
        return rumble_runtime_state('blocked_target_pair', 'pair', rumble_runtime_selector('owner'), rumble_runtime_duration('current_round'), [
            'owner_user_id' => $ownerUserId,
            'target_user_id' => $targetUserId,
            'relation' => 'symmetric',
        ]);
    }

    return null;
}

function rumble_apply_runtime_state_to_targeting_maps(array $state, int $ownerUserId, ?int $targetUserId, array &$untargetableByUser, array &$cannotAttackByUser, array &$blockedAttackTargetsByUser): void
{
    $stateKey = trim((string)($state['state_key'] ?? ''));
    if ($stateKey === 'untargetable') {
        $untargetableByUser[$ownerUserId] = true;
        return;
    }
    if ($stateKey === 'cannot_attack') {
        $cannotAttackByUser[$ownerUserId] = true;
        return;
    }
    if ($stateKey === 'hyperspace_active') {
        $untargetableByUser[$ownerUserId] = true;
        $cannotAttackByUser[$ownerUserId] = true;
        return;
    }
    if ($stateKey === 'blocked_target_pair' && $targetUserId !== null && $targetUserId > 0) {
        $blockedAttackTargetsByUser[$ownerUserId][$targetUserId] = true;
        $relation = trim((string)($state['relation'] ?? 'symmetric'));
        if ($relation === 'symmetric') {
            $blockedAttackTargetsByUser[$targetUserId][$ownerUserId] = true;
        }
    }
}

function rumble_runtime_formula_value(array $formula, array $activation = []): ?float
{
    $kind = trim((string)($formula['kind'] ?? ''));
    if ($kind === 'constant') {
        return (float)($formula['value'] ?? 0);
    }

    $xCost = max(0, (int)($activation['x_cost'] ?? 0));
    if ($kind === 'variable_x') {
        return (float)$xCost;
    }
    if ($kind === 'scaled_x') {
        return (float)($xCost * (float)($formula['multiplier'] ?? 0));
    }

    return null;
}

function rumble_apply_runtime_state_to_battle_context(array $state, int $ownerUserId, ?int $targetUserId, array &$untargetableByUser, array &$cannotAttackByUser, array &$blockedAttackTargetsByUser, array &$nimbleDodgeByUser): void
{
    if ((string)($state['state_key'] ?? '') === 'negate_largest_incoming_attack') {
        $nimbleDodgeByUser[$ownerUserId] = true;
        return;
    }

    rumble_apply_runtime_state_to_targeting_maps($state, $ownerUserId, $targetUserId, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser);
}

function rumble_apply_runtime_activation_effect(array $effect, int $ownerUserId, ?int $targetUserId, array $activation, array &$untargetableByUser, array &$cannotAttackByUser, array &$blockedAttackTargetsByUser, array &$nimbleDodgeByUser, array &$focusedDefenseByUser, array &$activatedDefenseBonusByUser, array &$mineLayerDamageByUser, array &$schemingTargetByUser, array &$effectPayload): void
{
    $kind = trim((string)($effect['kind'] ?? ''));
    if ($kind === 'grant_state' && isset($effect['state']) && is_array($effect['state'])) {
        rumble_apply_runtime_state_to_battle_context((array)$effect['state'], $ownerUserId, $targetUserId, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser, $nimbleDodgeByUser);
        $effectPayload['granted_state'] = (string)($effect['state']['state_key'] ?? 'unknown');
        return;
    }

    if ($kind === 'add_defense_bonus') {
        $formula = is_array($effect['formula'] ?? null) ? (array)$effect['formula'] : [];
        $value = rumble_runtime_formula_value($formula, $activation);
        if ($value !== null) {
            $activatedDefenseBonusByUser[$ownerUserId] = max(0, (int)($activatedDefenseBonusByUser[$ownerUserId] ?? 0)) + (int)floor($value);
            $effectPayload['applied_defense_bonus'] = (int)floor($value);
        }
        return;
    }

    if ($kind === 'set_retaliation_damage') {
        $formula = is_array($effect['formula'] ?? null) ? (array)$effect['formula'] : [];
        $value = rumble_runtime_formula_value($formula, $activation);
        if ($value !== null) {
            $mineLayerDamageByUser[$ownerUserId] = max(0, (int)($mineLayerDamageByUser[$ownerUserId] ?? 0)) + (int)floor($value);
            $effectPayload['retaliation_per_attacker'] = (int)floor($value);
        }
        return;
    }

    if ($kind === 'set_reflect_largest_attack_target' && $targetUserId !== null && $targetUserId > 0) {
        $schemingTargetByUser[$ownerUserId] = $targetUserId;
        $effectPayload['scheming_target_user_id'] = $targetUserId;
        return;
    }

    if ($kind === 'modify_incoming_attacks' && $targetUserId !== null && $targetUserId > 0) {
        $modifier = is_array($effect['modifier'] ?? null) ? (array)$effect['modifier'] : [];
        $formula = is_array($modifier['formula'] ?? null) ? (array)$modifier['formula'] : [];
        $value = rumble_runtime_formula_value($formula, $activation);
        if ((string)($modifier['stat'] ?? '') === 'incoming_attack_damage'
            && (string)($modifier['operation'] ?? '') === 'multiply'
            && $value !== null
        ) {
            $focusedDefenseByUser[$ownerUserId][$targetUserId] = (float)$value;
            $effectPayload['incoming_attack_multiplier'] = (float)$value;
            $effectPayload['focused_attacker_user_id'] = $targetUserId;
        }
    }
}

function rumble_append_runtime_scheduled_effect(array $effect, int $gameId, int $roundNumber, int $ownerUserId, ?int $targetUserId, string $abilityId, array &$roundEffectRows): bool
{
    if ((string)($effect['kind'] ?? '') !== 'schedule_state' || !isset($effect['state']) || !is_array($effect['state'])) {
        return false;
    }

    $state = (array)$effect['state'];
    $stateKey = trim((string)($state['state_key'] ?? 'state'));
    $roundEffectRows[] = [
        'game_id' => $gameId,
        'round_number' => $roundNumber + 1,
        'owner_user_id' => $ownerUserId,
        'target_user_id' => $targetUserId,
        'ability_instance_id' => null,
        'effect_key' => 'status:' . $stateKey,
        'trigger_timing' => 'round_start',
        'payload' => [
            'schema_version' => 1,
            'effect_kind' => 'state_instance',
            'source_ability_id' => $abilityId,
            'state' => $state,
        ],
        'is_resolved' => 0,
        'resolved_at' => null,
    ];

    return true;
}

function rumble_offer_item_key(int $index, string $abilityId): string
{
    $sanitizedAbilityId = preg_replace('/[^a-z0-9_]+/i', '_', trim($abilityId));
    $safeAbilityId = is_string($sanitizedAbilityId) && $sanitizedAbilityId !== '' ? strtolower($sanitizedAbilityId) : 'ability';
    return 'offer_' . max(0, $index) . '_' . $safeAbilityId;
}

function rumble_normalize_offer_items(array $payload): array
{
    $itemsRaw = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : null;
    if ($itemsRaw === null) {
        $legacyIds = isset($payload['ability_ids']) && is_array($payload['ability_ids']) ? $payload['ability_ids'] : [];
        $itemsRaw = [];
        foreach ($legacyIds as $index => $abilityIdRaw) {
            $itemsRaw[] = [
                'offer_item_key' => rumble_offer_item_key((int)$index, trim((string)$abilityIdRaw)),
                'ability_id' => $abilityIdRaw,
            ];
        }
    }

    $items = [];
    $seenKeys = [];
    foreach ($itemsRaw as $index => $itemRaw) {
        $item = is_array($itemRaw) ? $itemRaw : ['ability_id' => $itemRaw];
        $abilityId = rumble_canonical_ability_id((string)($item['ability_id'] ?? ''));
        if ($abilityId === '' || !rumble_ability_exists($abilityId)) {
            continue;
        }

        $offerItemKey = trim((string)($item['offer_item_key'] ?? ''));
        if ($offerItemKey === '') {
            $offerItemKey = rumble_offer_item_key((int)$index, $abilityId);
        }
        if (isset($seenKeys[$offerItemKey])) {
            continue;
        }

        $seenKeys[$offerItemKey] = true;
        $items[] = [
            'offer_item_key' => $offerItemKey,
            'ability_id' => $abilityId,
        ];
    }

    return $items;
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

    $ids = [];
    foreach ($decoded as $abilityId) {
        $id = rumble_canonical_ability_id((string)$abilityId);
        if ($id === '' || !rumble_ability_exists($id)) {
            continue;
        }

        $ids[] = $id;
    }

    sort($ids, SORT_STRING);
    return $ids;
}

function rumble_encode_owned_abilities(array $abilityIds): string
{
    $normalized = [];
    foreach ($abilityIds as $abilityId) {
        $id = rumble_canonical_ability_id((string)$abilityId);
        if ($id === '' || !rumble_ability_exists($id)) {
            continue;
        }

        $normalized[] = $id;
    }

    sort($normalized, SORT_STRING);

    return json_encode($normalized, JSON_UNESCAPED_UNICODE);
}

function rumble_owned_ability_counts(array $abilityIds): array
{
    $counts = [];
    foreach ($abilityIds as $abilityId) {
        $id = rumble_canonical_ability_id((string)$abilityId);
        if ($id === '' || !rumble_ability_exists($id)) {
            continue;
        }
        $counts[$id] = max(0, (int)($counts[$id] ?? 0)) + 1;
    }
    ksort($counts, SORT_STRING);
    return $counts;
}

function rumble_owned_abilities_public_view(array $abilityIds): array
{
    $public = [];
    $copyIndexByAbilityId = [];
    foreach ($abilityIds as $abilityId) {
        $id = rumble_canonical_ability_id((string)$abilityId);
        if ($id === '') {
            continue;
        }
        $ability = rumble_ability_by_id($id);
        if ($ability === null) {
            continue;
        }

        $copyIndexByAbilityId[$id] = max(0, (int)($copyIndexByAbilityId[$id] ?? 0)) + 1;
        $copyIndex = (int)$copyIndexByAbilityId[$id];
        $entry = rumble_ability_public_view($ability);
        $entry['ability_copy_index'] = $copyIndex;
        $entry['owned_instance_key'] = $id . '__' . $copyIndex;
        $public[] = $entry;
    }
    return $public;
}

function rumble_offer_item_public_view(array $item): ?array
{
    $abilityId = rumble_canonical_ability_id((string)($item['ability_id'] ?? ''));
    if ($abilityId === '') {
        return null;
    }

    $ability = rumble_ability_by_id($abilityId);
    if ($ability === null) {
        return null;
    }

    $entry = rumble_ability_public_view($ability);
    $entry['offer_item_key'] = trim((string)($item['offer_item_key'] ?? ''));
    return $entry;
}

function rumble_normalize_bid_map($raw, array $allowedOfferItems = []): array
{
    if (!is_array($raw)) {
        return [];
    }

    $normalized = [];
    $allowedByKey = [];
    $allowedAbilityIds = [];
    foreach ($allowedOfferItems as $item) {
        if (!is_array($item)) {
            continue;
        }
        $offerItemKey = trim((string)($item['offer_item_key'] ?? ''));
        $abilityId = trim((string)($item['ability_id'] ?? ''));
        if ($offerItemKey !== '') {
            $allowedByKey[$offerItemKey] = $abilityId;
        }
        if ($abilityId !== '') {
            $allowedAbilityIds[$abilityId] = true;
        }
    }

    foreach ($raw as $offerItemKeyRaw => $amountRaw) {
        $offerItemKey = trim((string)$offerItemKeyRaw);
        if ($offerItemKey === '') {
            continue;
        }

        if (!empty($allowedByKey)) {
            $isKnownKey = isset($allowedByKey[$offerItemKey]);
            $isLegacyAbilityId = isset($allowedAbilityIds[$offerItemKey]);
            if (!$isKnownKey && !$isLegacyAbilityId) {
                continue;
            }
            if ($isLegacyAbilityId) {
                $legacyAbilityId = $offerItemKey;
                $matchedKey = null;
                foreach ($allowedOfferItems as $candidate) {
                    if ((string)($candidate['ability_id'] ?? '') !== $legacyAbilityId) {
                        continue;
                    }
                    $candidateKey = trim((string)($candidate['offer_item_key'] ?? ''));
                    if ($candidateKey === '' || isset($normalized[$candidateKey])) {
                        continue;
                    }
                    $matchedKey = $candidateKey;
                    break;
                }
                if ($matchedKey === null) {
                    continue;
                }
                $offerItemKey = $matchedKey;
            }
        }

        if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
            continue;
        }

        $amount = (int)$amountRaw;
        if ($amount <= 0) {
            continue;
        }

        $normalized[$offerItemKey] = $amount;
    }

    ksort($normalized, SORT_STRING);
    return $normalized;
}

function rumble_ability_catalog_public_view(): array
{
    $catalog = [];
    foreach (rumble_ability_library() as $ability) {
        $catalog[] = rumble_ability_public_view($ability);
    }

    return $catalog;
}

function rumble_admin_target_member(int $gameId, int $targetUserId): array
{
    $memberStmt = db()->prepare(
        'SELECT gm.role, u.username, u.is_active, rps.current_health, rps.owned_abilities_json '
        . 'FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.user_id = :user_id '
        . 'LIMIT 1'
    );
    $memberStmt->execute([
        'game_id' => $gameId,
        'user_id' => $targetUserId,
    ]);
    $member = $memberStmt->fetch();
    if (!$member || (int)($member['is_active'] ?? 0) !== 1) {
        error_response('Target player not found.', 404);
    }

    if ((string)($member['role'] ?? '') === 'observer') {
        error_response('Observers cannot be modified with rumble cheat actions.', 409);
    }

    return $member;
}

function rumble_admin_action_context(int $gameId): array
{
    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();

    return [
        'round_number' => (int)($state['current_round'] ?? 1),
        'phase' => (string)($state['phase'] ?? 'bidding'),
    ];
}

function rumble_admin_log_action(int $gameId, int $actorUserId, string $actionType, array $payload, int $roundNumber, string $phase): void
{
    $auditStmt = db()->prepare(
        'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
        . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
    );
    $auditStmt->execute([
        'game_id' => $gameId,
        'user_id' => $actorUserId,
        'action_type' => $actionType,
        'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        'round_number' => $roundNumber,
        'phase' => $phase,
        'revealed_at' => gmdate('Y-m-d H:i:s'),
    ]);
}

function rumble_admin_grant_abilities(int $gameId, int $actorUserId, int $targetUserId, array $abilityIds): array
{
    $db = db();

    $gameStmt = $db->prepare('SELECT id, owner_user_id, game_type, status FROM games WHERE id = :game_id LIMIT 1');
    $gameStmt->execute(['game_id' => $gameId]);
    $game = $gameStmt->fetch();
    if (!$game) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('Ability grants are only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Ability grants are only available while the game is in progress.', 409);
    }

    $normalizedRequestedIds = [];
    foreach ($abilityIds as $abilityId) {
        $normalizedId = rumble_canonical_ability_id((string)$abilityId);
        if ($normalizedId === '') {
            continue;
        }
        if (!rumble_ability_exists($normalizedId)) {
            error_response('Unknown rumble ability: ' . $normalizedId, 422);
        }

        $normalizedRequestedIds[] = $normalizedId;
    }

    if (count($normalizedRequestedIds) === 0) {
        error_response('Select at least one valid ability to grant.', 422);
    }

    $member = rumble_admin_target_member($gameId, $targetUserId);

    $existingOwnedIds = rumble_parse_owned_abilities(isset($member['owned_abilities_json']) ? (string)$member['owned_abilities_json'] : null);
    $addedAbilityIds = [];
    foreach ($normalizedRequestedIds as $requestedId) {
        $addedAbilityIds[] = $requestedId;
        $existingOwnedIds[] = $requestedId;
    }

    $encodedOwnedAbilities = rumble_encode_owned_abilities($existingOwnedIds);
    $finalOwnedIds = rumble_parse_owned_abilities($encodedOwnedAbilities);
    $finalOwnedAbilities = rumble_owned_abilities_public_view($finalOwnedIds);

    $actionContext = rumble_admin_action_context($gameId);
    $roundNumber = (int)$actionContext['round_number'];
    $phase = (string)$actionContext['phase'];

    $db->beginTransaction();
    try {
        $upsertStmt = $db->prepare(db_upsert_sql(
            'INSERT INTO rumble_player_state (game_id, user_id, current_health, owned_abilities_json) '
            . 'VALUES (:game_id, :user_id, 100, :owned_abilities_json)',
            ['game_id', 'user_id'],
            [
                'owned_abilities_json' => db_insert_value_sql('owned_abilities_json'),
            ]
        ));
        $upsertStmt->execute([
            'game_id' => $gameId,
            'user_id' => $targetUserId,
            'owned_abilities_json' => $encodedOwnedAbilities,
        ]);

        rumble_admin_log_action($gameId, $actorUserId, 'admin_grant_abilities', [
            'target_user_id' => $targetUserId,
            'target_username' => (string)$member['username'],
            'requested_ability_ids' => $normalizedRequestedIds,
            'added_ability_ids' => $addedAbilityIds,
            'owned_ability_ids' => $finalOwnedIds,
        ], $roundNumber, $phase);

        $db->commit();
    } catch (Throwable $err) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $err;
    }

    return [
        'target_user_id' => $targetUserId,
        'target_username' => (string)$member['username'],
        'added_ability_ids' => $addedAbilityIds,
        'owned_ability_ids' => $finalOwnedIds,
        'owned_abilities' => $finalOwnedAbilities,
    ];
}

function rumble_admin_revoke_abilities(int $gameId, int $actorUserId, int $targetUserId, array $abilityIds): array
{
    $db = db();

    $gameStmt = $db->prepare('SELECT id, owner_user_id, game_type, status FROM games WHERE id = :game_id LIMIT 1');
    $gameStmt->execute(['game_id' => $gameId]);
    $game = $gameStmt->fetch();
    if (!$game) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('Ability revokes are only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Ability revokes are only available while the game is in progress.', 409);
    }

    $normalizedRequestedIds = [];
    foreach ($abilityIds as $abilityId) {
        $normalizedId = rumble_canonical_ability_id((string)$abilityId);
        if ($normalizedId === '') {
            continue;
        }
        if (!rumble_ability_exists($normalizedId)) {
            error_response('Unknown rumble ability: ' . $normalizedId, 422);
        }

        $normalizedRequestedIds[] = $normalizedId;
    }

    if (count($normalizedRequestedIds) === 0) {
        error_response('Select at least one valid ability to remove.', 422);
    }

    $member = rumble_admin_target_member($gameId, $targetUserId);
    $existingOwnedIds = rumble_parse_owned_abilities(isset($member['owned_abilities_json']) ? (string)$member['owned_abilities_json'] : null);
    $requestedLookup = array_fill_keys($normalizedRequestedIds, true);
    $removedAbilityIds = [];
    $remainingOwnedIds = [];
    foreach ($existingOwnedIds as $existingAbilityId) {
        if (isset($requestedLookup[$existingAbilityId])) {
            $removedAbilityIds[] = $existingAbilityId;
            continue;
        }

        $remainingOwnedIds[] = $existingAbilityId;
    }

    $encodedOwnedAbilities = rumble_encode_owned_abilities($remainingOwnedIds);
    $finalOwnedIds = rumble_parse_owned_abilities($encodedOwnedAbilities);
    $finalOwnedAbilities = rumble_owned_abilities_public_view($finalOwnedIds);
    $actionContext = rumble_admin_action_context($gameId);
    $roundNumber = (int)$actionContext['round_number'];
    $phase = (string)$actionContext['phase'];

    $db->beginTransaction();
    try {
        $upsertStmt = $db->prepare(db_upsert_sql(
            'INSERT INTO rumble_player_state (game_id, user_id, current_health, owned_abilities_json) '
            . 'VALUES (:game_id, :user_id, 100, :owned_abilities_json)',
            ['game_id', 'user_id'],
            [
                'owned_abilities_json' => db_insert_value_sql('owned_abilities_json'),
            ]
        ));
        $upsertStmt->execute([
            'game_id' => $gameId,
            'user_id' => $targetUserId,
            'owned_abilities_json' => $encodedOwnedAbilities,
        ]);

        rumble_admin_log_action($gameId, $actorUserId, 'admin_revoke_abilities', [
            'target_user_id' => $targetUserId,
            'target_username' => (string)$member['username'],
            'requested_ability_ids' => $normalizedRequestedIds,
            'removed_ability_ids' => $removedAbilityIds,
            'owned_ability_ids' => $finalOwnedIds,
        ], $roundNumber, $phase);

        $db->commit();
    } catch (Throwable $err) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $err;
    }

    return [
        'target_user_id' => $targetUserId,
        'target_username' => (string)$member['username'],
        'removed_ability_ids' => $removedAbilityIds,
        'owned_ability_ids' => $finalOwnedIds,
        'owned_abilities' => $finalOwnedAbilities,
    ];
}

function rumble_admin_set_health(int $gameId, int $actorUserId, int $targetUserId, int $health): array
{
    $db = db();

    $gameStmt = $db->prepare('SELECT id, owner_user_id, game_type, status FROM games WHERE id = :game_id LIMIT 1');
    $gameStmt->execute(['game_id' => $gameId]);
    $game = $gameStmt->fetch();
    if (!$game) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('Health changes are only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Health changes are only available while the game is in progress.', 409);
    }

    if ($health < 0) {
        error_response('Health must be a non-negative integer.', 422);
    }

    $member = rumble_admin_target_member($gameId, $targetUserId);
    $actionContext = rumble_admin_action_context($gameId);
    $roundNumber = (int)$actionContext['round_number'];
    $phase = (string)$actionContext['phase'];
    $previousHealth = max(0, (int)($member['current_health'] ?? 100));

    $db->beginTransaction();
    try {
        $upsertStmt = $db->prepare(db_upsert_sql(
            'INSERT INTO rumble_player_state (game_id, user_id, current_health) '
            . 'VALUES (:game_id, :user_id, :current_health)',
            ['game_id', 'user_id'],
            [
                'current_health' => db_insert_value_sql('current_health'),
            ]
        ));
        $upsertStmt->execute([
            'game_id' => $gameId,
            'user_id' => $targetUserId,
            'current_health' => $health,
        ]);

        rumble_admin_log_action($gameId, $actorUserId, 'admin_set_health', [
            'target_user_id' => $targetUserId,
            'target_username' => (string)$member['username'],
            'previous_health' => $previousHealth,
            'health' => $health,
        ], $roundNumber, $phase);

        $db->commit();
    } catch (Throwable $err) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $err;
    }

    return [
        'target_user_id' => $targetUserId,
        'target_username' => (string)$member['username'],
        'health' => $health,
    ];
}

function rumble_pick_random_abilities(int $count): array
{
    $library = rumble_ability_library();
    $ids = array_keys($library);
    if ($count <= 0) {
        return [];
    }

    $picked = [];
    $maxIndex = count($ids) - 1;
    for ($index = 0; $index < $count; $index += 1) {
        $picked[] = $ids[random_int(0, $maxIndex)];
    }

    return $picked;
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

        $abilityId = rumble_canonical_ability_id((string)($item['ability_id'] ?? ''));
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

        if (array_key_exists('ability_copy_index', $item)) {
            $copyIndexRaw = $item['ability_copy_index'];
            if (!is_int($copyIndexRaw) && !ctype_digit((string)$copyIndexRaw)) {
                if ($strict) {
                    throw new InvalidArgumentException('ability_copy_index must be a whole positive number when provided.');
                }
            } else {
                $copyIndex = (int)$copyIndexRaw;
                if ($copyIndex > 0) {
                    $entry['ability_copy_index'] = $copyIndex;
                } elseif ($strict) {
                    throw new InvalidArgumentException('ability_copy_index must be a whole positive number when provided.');
                }
            }
        }

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
        $abilityCmp = strcmp((string)($a['ability_id'] ?? ''), (string)($b['ability_id'] ?? ''));
        if ($abilityCmp !== 0) {
            return $abilityCmp;
        }
        return ((int)($a['ability_copy_index'] ?? 0)) <=> ((int)($b['ability_copy_index'] ?? 0));
    });

    return array_values($normalized);
}

function rumble_player_round_energy_budget(int $health, array $ownedAbilityIds): int
{
    $budget = max(0, $health);
    foreach ($ownedAbilityIds as $ownedAbilityId) {
        $ability = rumble_ability_by_id((string)$ownedAbilityId);
        if ($ability === null) {
            continue;
        }
        $budget += (int)floor(rumble_ability_modifier_sum($ability, 'energy_budget', 'add', 'always'));
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
    $abilityId = rumble_canonical_ability_id((string)($activation['ability_id'] ?? ''));
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
    $contract = rumble_ability_runtime_contract($ability);
    $xCost = max(0, (int)($activation['x_cost'] ?? 0));
    $healthBurn = max(0, (int)($params['health_burn'] ?? 0));
    $costFormula = is_array($params['cost_formula'] ?? null) ? (array)$params['cost_formula'] : [];
    $costFormulaKind = trim((string)($costFormula['kind'] ?? ''));

    $activationContract = is_array($contract['activation'] ?? null) ? (array)$contract['activation'] : [];
    if ($activationContract !== []) {
        $totalCost = 0;
        foreach ((array)($activationContract['costs'] ?? []) as $cost) {
            if (!is_array($cost)) {
                continue;
            }
            $formula = is_array($cost['formula'] ?? null) ? (array)$cost['formula'] : [];
            $formulaKind = trim((string)($formula['kind'] ?? ''));
            if (in_array($formulaKind, ['variable_x', 'scaled_x'], true) && !array_key_exists('x_cost', $activation) && $strict) {
                throw new InvalidArgumentException('x_cost is required for this variable-cost ability.');
            }
            $value = rumble_runtime_formula_value($formula, $activation);
            if ($value !== null) {
                $totalCost += (int)floor($value);
            }
        }
        return max(0, $totalCost);
    }

    if (in_array($costFormulaKind, ['variable_x', 'scaled_x'], true) && !array_key_exists('x_cost', $activation) && $strict) {
        throw new InvalidArgumentException('x_cost is required for this variable-cost ability.');
    }

    $formulaCost = rumble_evaluate_activation_cost_formula($costFormula, $xCost);
    if ($formulaCost !== null) {
        return $formulaCost + $healthBurn;
    }

    if ($templateKey === 'activated_spend_with_target_policy') {
        $costMode = (string)($params['cost_mode'] ?? 'fixed');
        if ($costMode === 'variable') {
            if (!array_key_exists('x_cost', $activation) && $strict) {
                throw new InvalidArgumentException('x_cost is required for this variable-cost ability.');
            }
            return $xCost + $healthBurn;
        }

        return $healthBurn;
    }

    if ($templateKey === 'activated_defense_mode') {
        if (array_key_exists('x_cost', $activation)) {
            return $xCost + $healthBurn;
        }
        return $healthBurn;
    }

    if ($templateKey === 'activated_self_or_toggle') {
        return $xCost + $healthBurn;
    }

    return $healthBurn;
}

function rumble_fetch_round_start_effects(int $gameId, int $roundNumber): array
{
    try {
        $stmt = db()->prepare(
            'SELECT id, owner_user_id, target_user_id, effect_key, payload FROM rumble_round_effects '
            . 'WHERE game_id = :game_id AND round_number = :round_number AND trigger_timing = :timing AND is_resolved = 0'
        );
        $stmt->execute([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'timing' => 'round_start',
        ]);
        return $stmt->fetchAll() ?: [];
    } catch (Throwable $ignored) {
        return [];
    }
}

function rumble_collect_round_targeting_state(array $playerRows, array $roundStartEffects): array
{
    $aliveByUser = [];
    $untargetableByUser = [];
    $cannotAttackByUser = [];
    $blockedAttackTargetsByUser = [];

    foreach ($playerRows as $row) {
        $userId = (int)($row['user_id'] ?? 0);
        if ($userId <= 0) {
            continue;
        }

        $health = max(0, (int)($row['current_health'] ?? $row['health'] ?? 0));
        $ownedAbilityIds = [];
        if (isset($row['owned_abilities_json'])) {
            $ownedAbilityIds = rumble_parse_owned_abilities((string)$row['owned_abilities_json']);
        } elseif (isset($row['owned_ability_ids']) && is_array($row['owned_ability_ids'])) {
            $ownedAbilityIds = array_values(array_map(static fn ($value): string => rumble_canonical_ability_id((string)$value), $row['owned_ability_ids']));
        }
        $aliveByUser[$userId] = $health > 0;
        $untargetableByUser[$userId] = false;
        $cannotAttackByUser[$userId] = false;
        $blockedAttackTargetsByUser[$userId] = [];

        foreach ($ownedAbilityIds as $ownedAbilityId) {
            $ability = rumble_ability_by_id($ownedAbilityId);
            if ($ability === null) {
                continue;
            }
            foreach (rumble_ability_state_grants($ability, 'always') as $state) {
                rumble_apply_runtime_state_to_targeting_maps($state, $userId, null, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser);
            }
        }
    }

    foreach ($roundStartEffects as $effectRow) {
        $ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
        $targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null ? (int)$effectRow['target_user_id'] : 0;
        if ($ownerUserId <= 0 || !isset($aliveByUser[$ownerUserId])) {
            continue;
        }

        $payload = json_decode((string)($effectRow['payload'] ?? '{}'), true);
        if (!is_array($payload)) {
            $payload = [];
        }
        $state = rumble_runtime_state_from_payload($payload, $ownerUserId, $targetUserId > 0 ? $targetUserId : null);
        if ($state !== null) {
            rumble_apply_runtime_state_to_targeting_maps($state, $ownerUserId, $targetUserId > 0 ? $targetUserId : null, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser);
        }
    }

    return [
        'alive_by_user' => $aliveByUser,
        'untargetable_by_user' => $untargetableByUser,
        'cannot_attack_by_user' => $cannotAttackByUser,
        'blocked_attack_targets_by_user' => $blockedAttackTargetsByUser,
    ];
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
        if (isset($payload['state']) && is_array($payload['state'])) {
            return $ownerName . ' receives scheduled status: ' . (string)($payload['state']['state_key'] ?? 'unknown') . '.';
        }
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

function rumble_game_on_join(int $gameId, int $userId): void
{
    $stateStmt = db()->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) VALUES (:game_id, :user_id, 100)',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
        ]
    ));
    $stateStmt->execute([
        'game_id' => $gameId,
        'user_id' => $userId,
    ]);
}

function rumble_game_on_start(int $gameId, int $actorUserId): void
{
    rumble_initialize_player_state($gameId);
    rumble_ensure_bidding_offer($gameId, 1, $actorUserId);
}

function rumble_has_standings_table(): bool
{
    static $hasTable = null;
    if ($hasTable !== null) {
        return $hasTable;
    }

    $hasTable = db_schema_table_exists(db(), 'game_player_standings');
    return $hasTable;
}

function rumble_ensure_standings_rows(PDO $pdo, int $gameId): void
{
    if (!rumble_has_standings_table()) {
        return;
    }

    $stmt = $pdo->prepare(db_insert_ignore_sql(
        'INSERT INTO game_player_standings (game_id, user_id, result_status) '
        . 'SELECT gm.game_id, gm.user_id, ? FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = ? AND u.is_active = 1',
        ['game_id', 'user_id']
    ));
    $stmt->execute([
        'active',
        $gameId,
    ]);
}

function rumble_record_eliminations(PDO $pdo, int $gameId, int $roundNumber, array $healthBeforeByUserId, array $candidateUserIds): void
{
    if (!rumble_has_standings_table() || empty($candidateUserIds)) {
        return;
    }

    rumble_ensure_standings_rows($pdo, $gameId);

    $candidateUserIds = array_values(array_unique(array_map('intval', $candidateUserIds)));
    $placeholders = implode(',', array_fill(0, count($candidateUserIds), '?'));

    $existingStmt = $pdo->prepare(
        'SELECT user_id, elimination_order FROM game_player_standings '
        . 'WHERE game_id = ? AND user_id IN (' . $placeholders . ')'
    );
    $existingStmt->execute(array_merge([$gameId], $candidateUserIds));
    $hasEliminationOrderByUserId = [];
    foreach ($existingStmt->fetchAll() as $row) {
        $hasEliminationOrderByUserId[(int)$row['user_id']] = $row['elimination_order'] !== null;
    }

    $newlyEliminatedUserIds = [];
    foreach ($candidateUserIds as $userId) {
        if (!empty($hasEliminationOrderByUserId[$userId])) {
            continue;
        }
        $newlyEliminatedUserIds[] = $userId;
    }

    if (empty($newlyEliminatedUserIds)) {
        return;
    }

    $metaStmt = $pdo->prepare(
        'SELECT gm.user_id, u.username FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = ? AND gm.user_id IN (' . implode(',', array_fill(0, count($newlyEliminatedUserIds), '?')) . ')'
    );
    $metaStmt->execute(array_merge([$gameId], $newlyEliminatedUserIds));
    $usernameByUserId = [];
    foreach ($metaStmt->fetchAll() as $row) {
        $usernameByUserId[(int)$row['user_id']] = (string)$row['username'];
    }

    usort($newlyEliminatedUserIds, static function (int $leftUserId, int $rightUserId) use ($healthBeforeByUserId, $usernameByUserId): int {
        $leftHealth = (int)($healthBeforeByUserId[$leftUserId] ?? 0);
        $rightHealth = (int)($healthBeforeByUserId[$rightUserId] ?? 0);
        if ($leftHealth !== $rightHealth) {
            return $rightHealth <=> $leftHealth;
        }

        $leftName = (string)($usernameByUserId[$leftUserId] ?? '');
        $rightName = (string)($usernameByUserId[$rightUserId] ?? '');
        $nameCompare = strcasecmp($leftName, $rightName);
        if ($nameCompare !== 0) {
            return $nameCompare;
        }

        return $leftUserId <=> $rightUserId;
    });

    $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(elimination_order), 0) FROM game_player_standings WHERE game_id = ?');
    $maxStmt->execute([$gameId]);
    $nextEliminationOrder = (int)$maxStmt->fetchColumn();

    $updateStmt = $pdo->prepare(
        'UPDATE game_player_standings '
        . 'SET eliminated_round = ?, elimination_order = ?, result_status = ? '
        . 'WHERE game_id = ? AND user_id = ? AND elimination_order IS NULL'
    );
    foreach ($newlyEliminatedUserIds as $userId) {
        $nextEliminationOrder += 1;
        $updateStmt->execute([
            $roundNumber,
            $nextEliminationOrder,
            'eliminated',
            $gameId,
            $userId,
        ]);
    }
}

function rumble_list_alive_players(PDO $pdo, int $gameId): array
{
    $aliveStmt = $pdo->prepare(
        'SELECT gm.user_id, u.username, COALESCE(rps.current_health, 100) AS current_health, rps.owned_abilities_json FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = ? AND gm.role <> ? AND u.is_active = 1 AND COALESCE(rps.current_health, 100) > 0 '
        . 'ORDER BY u.username ASC, gm.user_id ASC'
    );
    $aliveStmt->execute([
        $gameId,
        'observer',
    ]);

    return $aliveStmt->fetchAll();
}

function rumble_round_end_winners(array $aliveRows, int $roundNumber): array
{
    $winnerRows = [];
    foreach ($aliveRows as $row) {
        $ownedAbilityIds = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
        $isWinner = false;
        foreach ($ownedAbilityIds as $ownedAbilityId) {
            $ability = rumble_ability_by_id($ownedAbilityId);
            if ($ability === null) {
                continue;
            }
            $contract = rumble_ability_runtime_contract($ability);
            foreach ((array)($contract['conditions'] ?? []) as $condition) {
                if ((string)($condition['evaluation_timing'] ?? '') !== 'round_end') {
                    continue;
                }
                $roundRule = is_array($condition['round_rule'] ?? null) ? (array)$condition['round_rule'] : [];
                if ((string)($roundRule['kind'] ?? '') !== 'exact_round' || (int)($roundRule['round_number'] ?? 0) !== $roundNumber) {
                    continue;
                }
                $predicate = is_array($condition['predicate'] ?? null) ? (array)$condition['predicate'] : [];
                if ((string)($predicate['kind'] ?? 'owner_alive') !== 'owner_alive') {
                    continue;
                }
                $isWinner = true;
                break 2;
            }
        }
        if ($isWinner) {
            $winnerRows[] = $row;
        }
    }

    return $winnerRows;
}

function rumble_finalize_standings(PDO $pdo, int $gameId, int $roundNumber, array $winnerRows): ?int
{
    if (!rumble_has_standings_table() || empty($winnerRows)) {
        return null;
    }

    rumble_ensure_standings_rows($pdo, $gameId);

    $winnerUserIds = [];
    $winnerNames = [];
    foreach ($winnerRows as $row) {
        $winnerUserId = (int)$row['user_id'];
        if (isset($winnerUserIds[$winnerUserId])) {
            continue;
        }

        $winnerUserIds[$winnerUserId] = true;
        $winnerNames[] = (string)$row['username'];
    }

    if (empty($winnerUserIds)) {
        return null;
    }

    $standingsStmt = $pdo->prepare(
        'SELECT gps.user_id, gps.elimination_order, u.username FROM game_player_standings gps '
        . 'JOIN users u ON u.id = gps.user_id '
        . 'WHERE gps.game_id = ? AND u.is_active = 1'
    );
    $standingsStmt->execute([$gameId]);
    $standingRows = $standingsStmt->fetchAll();

    $nonWinnerRows = [];
    foreach ($standingRows as $row) {
        $userId = (int)$row['user_id'];
        if (isset($winnerUserIds[$userId])) {
            continue;
        }

        $nonWinnerRows[] = $row;
    }

    usort($nonWinnerRows, static function (array $leftRow, array $rightRow): int {
        $leftSurvived = $leftRow['elimination_order'] === null;
        $rightSurvived = $rightRow['elimination_order'] === null;
        if ($leftSurvived !== $rightSurvived) {
            return $leftSurvived ? -1 : 1;
        }

        if (!$leftSurvived) {
            $orderCompare = (int)$rightRow['elimination_order'] <=> (int)$leftRow['elimination_order'];
            if ($orderCompare !== 0) {
                return $orderCompare;
            }
        }

        $nameCompare = strcasecmp((string)$leftRow['username'], (string)$rightRow['username']);
        if ($nameCompare !== 0) {
            return $nameCompare;
        }

        return (int)$leftRow['user_id'] <=> (int)$rightRow['user_id'];
    });

    $rankByUserId = [];
    foreach (array_keys($winnerUserIds) as $winnerUserId) {
        $rankByUserId[(int)$winnerUserId] = 1;
    }

    $nextRank = 2;
    foreach ($nonWinnerRows as $row) {
        $rankByUserId[(int)$row['user_id']] = $nextRank;
        $nextRank += 1;
    }

    $updateStandingStmt = $pdo->prepare(
        'UPDATE game_player_standings SET final_rank = ?, result_status = ? WHERE game_id = ? AND user_id = ?'
    );
    foreach ($rankByUserId as $userId => $rank) {
        $updateStandingStmt->execute([
            $rank,
            isset($winnerUserIds[$userId]) ? 'winner' : 'eliminated',
            $gameId,
            $userId,
        ]);
    }

    sort($winnerNames, SORT_NATURAL | SORT_FLAG_CASE);
    $winnerSummary = implode(', ', $winnerNames);

    $closeGameStmt = $pdo->prepare('UPDATE games SET status = ? WHERE id = ?');
    $closeGameStmt->execute([
        'closed',
        $gameId,
    ]);

    $closeStateStmt = $pdo->prepare(db_upsert_sql(
        'INSERT INTO game_state (game_id, phase, current_round, ended_at, winner_summary) '
        . 'VALUES (?, ?, ?, ' . db_now_sql() . ', ?)',
        ['game_id'],
        [
            'ended_at' => db_now_sql(),
            'winner_summary' => db_insert_value_sql('winner_summary'),
        ]
    ));
    $closeStateStmt->execute([
        $gameId,
        'battle',
        $roundNumber,
        $winnerSummary,
    ]);

    ksort($winnerUserIds, SORT_NUMERIC);
    return (int)array_key_first($winnerUserIds);
}

function rumble_finalize_standings_if_won(PDO $pdo, int $gameId, int $roundNumber): ?int
{
    if (!rumble_has_standings_table()) {
        return null;
    }

    rumble_ensure_standings_rows($pdo, $gameId);

    $aliveRows = rumble_list_alive_players($pdo, $gameId);
    $winnerRows = rumble_round_end_winners($aliveRows, $roundNumber);
    if (empty($winnerRows) && count($aliveRows) === 1) {
        $winnerRows = [$aliveRows[0]];
    }

    return rumble_finalize_standings($pdo, $gameId, $roundNumber, $winnerRows);
}

function rumble_build_final_standings(int $gameId): ?array
{
    if (!rumble_has_standings_table()) {
        return null;
    }

    $stmt = db()->prepare(
        'SELECT gps.user_id, gps.final_rank, gps.eliminated_round, gps.result_status, u.username, rps.ship_name '
        . 'FROM game_player_standings gps '
        . 'JOIN users u ON u.id = gps.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gps.game_id AND rps.user_id = gps.user_id '
        . 'WHERE gps.game_id = ? AND gps.final_rank IS NOT NULL AND u.is_active = 1 '
        . 'ORDER BY gps.final_rank ASC, u.username ASC'
    );
    $stmt->execute([$gameId]);
    $rows = $stmt->fetchAll();
    if (empty($rows)) {
        return null;
    }

    $winnerNames = [];
    $entries = [];
    foreach ($rows as $row) {
        $rank = (int)$row['final_rank'];
        $username = (string)$row['username'];
        if ($rank === 1) {
            $winnerNames[] = $username;
        }
        $entries[] = [
            'user_id' => (int)$row['user_id'],
            'rank' => $rank,
            'username' => $username,
            'ship_name' => trim((string)($row['ship_name'] ?? '')) !== '' ? trim((string)$row['ship_name']) : $username,
            'eliminated_round' => $row['eliminated_round'] !== null ? (int)$row['eliminated_round'] : null,
            'result_status' => (string)$row['result_status'],
        ];
    }

    return [
        'winner_name' => implode(', ', $winnerNames),
        'entries' => $entries,
    ];
}

function rumble_game_build_detail_payload(int $gameId, array $game, array $user): array
{
    $isInProgress = (string)($game['status'] ?? '') === 'in_progress';
    $roundNumber = (int)($game['current_round'] ?? 1);
    $phase = (string)($game['phase'] ?? default_phase_for_game_type((string)$game['game_type']));

    if ($isInProgress) {
        rumble_initialize_player_state($gameId);
    }
    if ($isInProgress && $phase === 'bidding') {
        rumble_ensure_bidding_offer($gameId, $roundNumber, (int)$game['owner_user_id']);
    }

    $participantsStmt = db()->prepare(
        'SELECT COUNT(*) FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
        . ' AND COALESCE(rps.current_health, 100) > 0'
    );
    $participantsStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $participantCount = (int)$participantsStmt->fetchColumn();

    $submittedActionType = $phase === 'bidding' ? 'bid' : 'order';
    $submittedStmt = db()->prepare(
        'SELECT COUNT(DISTINCT user_id) FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
    );
    $submittedStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => $submittedActionType,
    ]);
    $submittedCount = (int)$submittedStmt->fetchColumn();

    $playersStmt = db()->prepare(
        'SELECT gm.user_id, u.username, COALESCE(rps.current_health, 100) AS current_health, gm.role, rps.ship_name, rps.owned_abilities_json '
        . 'FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND u.is_active = 1 '
        . 'AND (gm.role <> :observer_role OR rps.user_id IS NOT NULL) '
        . 'ORDER BY COALESCE(rps.current_health, 100) > 0 DESC, u.username ASC'
    );
    $playersStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $players = [];
    $playerNameByUserId = [];
    $playerRows = [];
    foreach ($playersStmt->fetchAll() as $row) {
        $ownedAbilityIds = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
        $ownedAbilities = rumble_owned_abilities_public_view($ownedAbilityIds);
        $playerRows[] = [
            'user_id' => (int)$row['user_id'],
            'current_health' => max(0, (int)$row['current_health']),
            'owned_ability_ids' => $ownedAbilityIds,
        ];

        $players[] = [
            'user_id' => (int)$row['user_id'],
            'username' => (string)$row['username'],
            'ship_name' => trim((string)($row['ship_name'] ?? '')) !== ''
                ? trim((string)$row['ship_name'])
                : (string)$row['username'],
            'health' => max(0, (int)$row['current_health']),
            'is_self' => (int)$row['user_id'] === (int)$user['id'],
            'is_defeated' => (int)$row['current_health'] <= 0,
            'member_role' => (string)$row['role'],
            'owned_abilities' => $ownedAbilities,
        ];

        $playerNameByUserId[(int)$row['user_id']] = trim((string)($row['ship_name'] ?? '')) !== ''
            ? trim((string)$row['ship_name'])
            : (string)$row['username'];
    }

    $roundStartEffects = rumble_fetch_round_start_effects($gameId, $roundNumber);
    $targetingState = rumble_collect_round_targeting_state($playerRows, $roundStartEffects);
    $selfUserId = (int)$user['id'];
    $selfCannotAttack = !empty($targetingState['cannot_attack_by_user'][$selfUserId]);
    foreach ($players as &$playerEntry) {
        $playerId = (int)$playerEntry['user_id'];
        $isOpponentTargetable = empty($targetingState['untargetable_by_user'][$playerId]);
        $isBlockedForSelfAttack = $selfCannotAttack || !empty(($targetingState['blocked_attack_targets_by_user'][$selfUserId] ?? [])[$playerId]);
        $playerEntry['is_opponent_targetable'] = $isOpponentTargetable;
        $playerEntry['can_be_attacked_by_self'] = $isOpponentTargetable && !$isBlockedForSelfAttack;
        $playerEntry['cannot_attack'] = !empty($targetingState['cannot_attack_by_user'][$playerId]);
        $playerEntry['blocked_attack_target_user_ids'] = array_map(
            'intval',
            array_keys((array)($targetingState['blocked_attack_targets_by_user'][$playerId] ?? []))
        );
    }
    unset($playerEntry);

    $offer = rumble_fetch_offer_payload($gameId, $roundNumber);
    $offeredAbilities = [];
    foreach (($offer['items'] ?? []) as $offerItem) {
        $publicItem = rumble_offer_item_public_view($offerItem);
        if ($publicItem === null) {
            continue;
        }
        $offeredAbilities[] = $publicItem;
    }

    $currentBids = null;
    if ($phase === 'bidding') {
        $currentBidStmt = db()->prepare(
            'SELECT payload FROM game_actions '
            . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND user_id = :user_id '
            . 'ORDER BY id DESC LIMIT 1'
        );
        $currentBidStmt->execute([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'action_type' => 'bid',
            'user_id' => (int)$user['id'],
        ]);
        $currentBidPayload = $currentBidStmt->fetchColumn();
        if ($currentBidPayload !== false) {
            $decodedBid = json_decode((string)$currentBidPayload, true);
            $currentBids = rumble_normalize_bid_map(isset($decodedBid['bids']) ? $decodedBid['bids'] : [], (array)($offer['items'] ?? []));
        }
    }

    $currentOrderStmt = db()->prepare(
        'SELECT payload FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type AND user_id = :user_id '
        . 'ORDER BY id DESC LIMIT 1'
    );
    $currentOrderStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'order',
        'user_id' => (int)$user['id'],
    ]);
    $currentPayloadRaw = $currentOrderStmt->fetchColumn();
    $currentOrder = null;
    if ($currentPayloadRaw !== false) {
        $decoded = json_decode((string)$currentPayloadRaw, true);
        if (is_array($decoded)) {
            $attacks = is_array($decoded['attacks'] ?? null) ? $decoded['attacks'] : [];
            $normalizedAttacks = [];
            foreach ($attacks as $targetKey => $amountRaw) {
                if ((!is_int($targetKey) && !ctype_digit((string)$targetKey)) || (!is_int($amountRaw) && !ctype_digit((string)$amountRaw))) {
                    continue;
                }

                $amount = (int)$amountRaw;
                if ($amount <= 0) {
                    continue;
                }

                $normalizedAttacks[(string)((int)$targetKey)] = $amount;
            }

            $defense = $decoded['defense'] ?? 0;
            $abilityActivations = rumble_normalize_ability_activations($decoded['ability_activations'] ?? []);
            $abilityEnergySpent = 0;
            foreach ($abilityActivations as $activation) {
                $abilityEnergySpent += rumble_activation_energy_cost($activation);
            }
            $attackEnergySpent = 0;
            foreach ($normalizedAttacks as $amount) {
                $attackEnergySpent += max(0, (int)$amount);
            }
            $currentOrder = [
                'attacks' => $normalizedAttacks,
                'ability_activations' => $abilityActivations,
                'defense' => max(0, (int)$defense),
                'energy_budget' => max(0, (int)($decoded['energy_budget'] ?? 0)),
                'attack_energy_spent' => max(0, (int)($decoded['attack_energy_spent'] ?? $attackEnergySpent)),
                'ability_energy_spent' => max(0, (int)($decoded['ability_energy_spent'] ?? $abilityEnergySpent)),
                'total_energy_spent' => max(0, (int)($decoded['total_energy_spent'] ?? ($attackEnergySpent + $abilityEnergySpent))),
            ];
        }
    }

    $previousRound = max(0, $roundNumber - 1);
    $previousOrders = [];
    $currentRoundEvents = [];
    $previousRoundEvents = [];

    $eventRowsStmt = db()->prepare(
        'SELECT id, round_number, owner_user_id, target_user_id, effect_key, trigger_timing, payload, created_at '
        . 'FROM rumble_round_effects '
        . 'WHERE game_id = :game_id AND round_number IN (:current_round, :previous_round) '
        . 'ORDER BY round_number ASC, id ASC'
    );
    $eventRowsStmt->execute([
        'game_id' => $gameId,
        'current_round' => $roundNumber,
        'previous_round' => $previousRound,
    ]);
    foreach ($eventRowsStmt->fetchAll() as $eventRow) {
        $roundForEvent = (int)($eventRow['round_number'] ?? 0);
        $payload = json_decode((string)($eventRow['payload'] ?? '{}'), true);
        $normalizedEvent = [
            'id' => (int)($eventRow['id'] ?? 0),
            'round_number' => $roundForEvent,
            'owner_user_id' => (int)($eventRow['owner_user_id'] ?? 0),
            'target_user_id' => isset($eventRow['target_user_id']) ? ($eventRow['target_user_id'] === null ? null : (int)$eventRow['target_user_id']) : null,
            'effect_key' => (string)($eventRow['effect_key'] ?? ''),
            'trigger_timing' => (string)($eventRow['trigger_timing'] ?? ''),
            'payload' => is_array($payload) ? $payload : [],
            'text' => rumble_round_effect_human_text([
                'effect_key' => (string)($eventRow['effect_key'] ?? ''),
                'owner_user_id' => (int)($eventRow['owner_user_id'] ?? 0),
                'target_user_id' => isset($eventRow['target_user_id']) ? ($eventRow['target_user_id'] === null ? null : (int)$eventRow['target_user_id']) : null,
                'payload' => is_array($payload) ? $payload : [],
            ], $playerNameByUserId),
            'created_at' => (string)($eventRow['created_at'] ?? ''),
        ];

        if ($roundForEvent === $roundNumber) {
            $currentRoundEvents[] = $normalizedEvent;
        } elseif ($roundForEvent === $previousRound) {
            $previousRoundEvents[] = $normalizedEvent;
        }
    }

    if ($previousRound > 0) {
        $previousStmt = db()->prepare(
            'SELECT a.user_id, u.username, a.payload FROM game_actions a '
            . 'JOIN users u ON u.id = a.user_id '
            . 'WHERE a.game_id = :game_id AND a.round_number = :round_number AND a.action_type = :action_type '
            . 'ORDER BY u.username ASC'
        );
        $previousStmt->execute([
            'game_id' => $gameId,
            'round_number' => $previousRound,
            'action_type' => 'order',
        ]);

        foreach ($previousStmt->fetchAll() as $row) {
            $decoded = json_decode((string)$row['payload'], true);
            if (!is_array($decoded)) {
                $decoded = [];
            }

            $attacks = is_array($decoded['attacks'] ?? null) ? $decoded['attacks'] : [];
            $normalizedAttacks = [];
            foreach ($attacks as $targetKey => $amountRaw) {
                if ((!is_int($targetKey) && !ctype_digit((string)$targetKey)) || (!is_int($amountRaw) && !ctype_digit((string)$amountRaw))) {
                    continue;
                }

                $amount = (int)$amountRaw;
                if ($amount <= 0) {
                    continue;
                }

                $normalizedAttacks[(string)((int)$targetKey)] = $amount;
            }

            $previousOrders[] = [
                'user_id' => (int)$row['user_id'],
                'username' => (string)$row['username'],
                'attacks' => $normalizedAttacks,
                'ability_activations' => rumble_normalize_ability_activations($decoded['ability_activations'] ?? []),
                'defense' => max(0, (int)($decoded['defense'] ?? 0)),
                'energy_budget' => max(0, (int)($decoded['energy_budget'] ?? 0)),
                'attack_energy_spent' => max(0, (int)($decoded['attack_energy_spent'] ?? 0)),
                'ability_energy_spent' => max(0, (int)($decoded['ability_energy_spent'] ?? 0)),
                'total_energy_spent' => max(0, (int)($decoded['total_energy_spent'] ?? 0)),
            ];
        }
    }

    return [
        'final_standings' => rumble_build_final_standings($gameId),
        'rumble_turn_progress' => [
            'phase_mode' => $phase,
            'round_number' => $roundNumber,
            'submitted_count' => $submittedCount,
            'participant_count' => $participantCount,
            'players' => $players,
            'ability_catalog' => rumble_ability_catalog_public_view(),
            'offered_abilities' => $offeredAbilities,
            'current_bids' => $currentBids,
            'current_order' => $currentOrder,
            'current_round_event_log' => $currentRoundEvents,
            'previous_round_orders' => $previousOrders,
            'previous_round_event_log' => $previousRoundEvents,
        ],
    ];
}

function rumble_initialize_player_state(int $gameId): void
{
    $stmt = db()->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health, owned_abilities_json) '
        . 'SELECT gm.game_id, gm.user_id, 100, :owned_abilities_json FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
        ]
    ));
    $stmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
        'owned_abilities_json' => json_encode([], JSON_UNESCAPED_UNICODE),
    ]);
}

function rumble_ensure_bidding_offer(int $gameId, int $roundNumber, int $actorUserId): void
{
    $existingStmt = db()->prepare(
        'SELECT id FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type '
        . 'ORDER BY id DESC LIMIT 1'
    );
    $existingStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'ability_offer',
    ]);
    if ($existingStmt->fetchColumn() !== false) {
        return;
    }

    $participantsStmt = db()->prepare(
        'SELECT COUNT(*) FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
    );
    $participantsStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $participantCount = max(0, (int)$participantsStmt->fetchColumn());

    $abilityCount = count(rumble_ability_library());
    $offerCount = min($abilityCount, max(0, $participantCount * 2));
    $offeredAbilityIds = rumble_pick_random_abilities($offerCount);
    $offeredItems = [];
    foreach ($offeredAbilityIds as $index => $abilityId) {
        $offeredItems[] = [
            'offer_item_key' => rumble_offer_item_key((int)$index, (string)$abilityId),
            'ability_id' => (string)$abilityId,
        ];
    }

    $insertStmt = db()->prepare(
        'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
        . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
    );
    $insertStmt->execute([
        'game_id' => $gameId,
        'user_id' => $actorUserId,
        'action_type' => 'ability_offer',
        'payload' => json_encode(['items' => $offeredItems], JSON_UNESCAPED_UNICODE),
        'round_number' => $roundNumber,
        'phase' => 'bidding',
        'revealed_at' => gmdate('Y-m-d H:i:s'),
    ]);
}

function rumble_fetch_offer_payload(int $gameId, int $roundNumber): array
{
    $offerStmt = db()->prepare(
        'SELECT payload FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type '
        . 'ORDER BY id DESC LIMIT 1'
    );
    $offerStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'ability_offer',
    ]);
    $raw = $offerStmt->fetchColumn();
    if ($raw === false) {
        return ['ability_ids' => []];
    }

    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) {
        return ['ability_ids' => []];
    }

    $items = rumble_normalize_offer_items($decoded);

    return [
        'items' => $items,
        'ability_ids' => array_values(array_map(static fn (array $item): string => (string)$item['ability_id'], $items)),
    ];
}

function rumble_action_upsert_order(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);
    if ($role === 'observer') {
        error_response('Observers cannot submit actions.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Game actions are only allowed while game is in progress.', 409);
    }

    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();

    $roundNumber = (int)($state['current_round'] ?? 1);
    $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
    if ($phase !== 'battle') {
        error_response('Rumble orders are only available during battle phase.', 409);
    }

    $ensureStmt = db()->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) VALUES (:game_id, :user_id, 100)',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
        ]
    ));
    $ensureStmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
    ]);

    $healthStmt = db()->prepare('SELECT current_health, owned_abilities_json FROM rumble_player_state WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
    $healthStmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
    ]);
    $stateRow = $healthStmt->fetch();
    $currentHealth = (int)($stateRow['current_health'] ?? 0);
    if ($currentHealth <= 0) {
        error_response('Eliminated players cannot submit orders.', 409);
    }

    $ownedAbilityIds = rumble_parse_owned_abilities(isset($stateRow['owned_abilities_json']) ? (string)$stateRow['owned_abilities_json'] : null);
    $ownedAbilityMap = array_fill_keys(array_keys(rumble_owned_ability_counts($ownedAbilityIds)), true);
    $ownedAbilityCounts = rumble_owned_ability_counts($ownedAbilityIds);

    $body = json_input();
    $attacksRaw = $body['attacks'] ?? [];
    $abilityActivationsRaw = $body['ability_activations'] ?? [];
    if (!is_array($attacksRaw)) {
        error_response('Attacks must be an object keyed by target user id.', 422);
    }

    try {
        $normalizedAbilityActivations = rumble_normalize_ability_activations($abilityActivationsRaw, true);
    } catch (InvalidArgumentException $ex) {
        error_response($ex->getMessage(), 422);
    }

    $targetsStmt = db()->prepare(
        'SELECT gm.user_id, COALESCE(rps.current_health, 100) AS current_health, rps.owned_abilities_json FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
    );
    $targetsStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $targetRows = $targetsStmt->fetchAll();
    $roundStartEffects = rumble_fetch_round_start_effects($gameId, $roundNumber);
    $targetingState = rumble_collect_round_targeting_state($targetRows, $roundStartEffects);
    $validAttackTargetMap = [];
    $validAbilityTargetMap = [];
    foreach ($targetRows as $targetRow) {
        $targetId = (int)($targetRow['user_id'] ?? 0);
        if ($targetId <= 0 || $targetId === (int)$user['id']) {
            continue;
        }
        if (empty($targetingState['alive_by_user'][$targetId])) {
            continue;
        }
        if (!empty($targetingState['untargetable_by_user'][$targetId])) {
            continue;
        }
        $validAbilityTargetMap[$targetId] = true;
        if (!empty($targetingState['cannot_attack_by_user'][(int)$user['id']])) {
            continue;
        }
        if (!empty(($targetingState['blocked_attack_targets_by_user'][(int)$user['id']] ?? [])[$targetId])) {
            continue;
        }
        $validAttackTargetMap[$targetId] = true;
    }

    $normalizedAttacks = [];
    $totalAttack = 0;
    foreach ($attacksRaw as $targetKey => $amountRaw) {
        if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
            error_response('Attack target ids must be integers.', 422);
        }

        $targetId = (int)$targetKey;
        if (!isset($validAttackTargetMap[$targetId])) {
            error_response('One or more attack targets are invalid.', 422);
        }

        if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
            error_response('Attack amounts must be whole non-negative numbers.', 422);
        }

        $amount = (int)$amountRaw;
        if ($amount < 0) {
            error_response('Attack amounts must be non-negative.', 422);
        }

        if ($amount === 0) {
            continue;
        }

        $normalizedAttacks[(string)$targetId] = $amount;
        $totalAttack += $amount;
    }

    $activationCounts = [];
    $activationCopyKeys = [];
    foreach ($normalizedAbilityActivations as $activation) {
        $abilityId = (string)($activation['ability_id'] ?? '');
        if ($abilityId === '' || !isset($ownedAbilityMap[$abilityId])) {
            error_response('One or more activated abilities are not owned by this player.', 422);
        }

        $activationCounts[$abilityId] = max(0, (int)($activationCounts[$abilityId] ?? 0)) + 1;
        if ($activationCounts[$abilityId] > max(0, (int)($ownedAbilityCounts[$abilityId] ?? 0))) {
            error_response('One or more activated abilities exceed the number of copies you own.', 422);
        }

        if (array_key_exists('ability_copy_index', $activation)) {
            $copyKey = $abilityId . '__' . (int)$activation['ability_copy_index'];
            if (isset($activationCopyKeys[$copyKey])) {
                error_response('Each owned ability copy can only be activated once per round.', 422);
            }
            $activationCopyKeys[$copyKey] = true;
            if ((int)$activation['ability_copy_index'] > max(0, (int)($ownedAbilityCounts[$abilityId] ?? 0))) {
                error_response('One or more activated ability copies are invalid.', 422);
            }
        }

        if (array_key_exists('target_user_id', $activation)) {
            $targetId = (int)$activation['target_user_id'];
            if (!isset($validAbilityTargetMap[$targetId])) {
                error_response('One or more ability activation targets are invalid.', 422);
            }
        }
    }

    $abilityEnergySpent = 0;
    foreach ($normalizedAbilityActivations as $activation) {
        try {
            $abilityEnergySpent += rumble_activation_energy_cost($activation, true);
        } catch (InvalidArgumentException $ex) {
            error_response($ex->getMessage(), 422);
        }
    }

    $energyBudget = rumble_player_round_energy_budget($currentHealth, $ownedAbilityIds);
    $attackEnergySpent = $totalAttack;
    $totalEnergySpent = $attackEnergySpent + $abilityEnergySpent;
    if ($totalEnergySpent > $energyBudget) {
        error_response('Invalid order: total energy spent exceeds your round energy budget.', 422);
    }

    $defense = $currentHealth - $totalAttack;
    if ($defense < 0) {
        error_response('Invalid order: defense cannot be negative.', 422);
    }

    ksort($normalizedAttacks, SORT_NUMERIC);
    $payload = [
        'attacks' => $normalizedAttacks,
        'ability_activations' => $normalizedAbilityActivations,
        'defense' => $defense,
        'energy_budget' => $energyBudget,
        'attack_energy_spent' => $attackEnergySpent,
        'ability_energy_spent' => $abilityEnergySpent,
        'total_energy_spent' => $totalEnergySpent,
    ];

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $deleteStmt = $pdo->prepare(
            'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
        );
        $deleteStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$user['id'],
            'round_number' => $roundNumber,
            'action_type' => 'order',
        ]);

        $insertStmt = $pdo->prepare(
            'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
            . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
        );
        $insertStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$user['id'],
            'action_type' => 'order',
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'round_number' => $roundNumber,
            'phase' => $phase,
            'revealed_at' => gmdate('Y-m-d H:i:s'),
        ]);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    success_response([
        'submitted' => true,
        'round' => $roundNumber,
        'defense' => $defense,
        'energy_budget' => $energyBudget,
        'attack_energy_spent' => $attackEnergySpent,
        'ability_energy_spent' => $abilityEnergySpent,
        'total_energy_spent' => $totalEnergySpent,
    ], 201);
}

function rumble_action_upsert_bids(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);
    if ($role === 'observer') {
        error_response('Observers cannot submit bids.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Bids are only allowed while game is in progress.', 409);
    }

    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();
    $roundNumber = (int)($state['current_round'] ?? 1);
    $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
    if ($phase !== 'bidding') {
        error_response('Bids are only allowed during bidding phase.', 409);
    }

    $ensureStmt = db()->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) VALUES (:game_id, :user_id, 100)',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
        ]
    ));
    $ensureStmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
    ]);

    $healthStmt = db()->prepare('SELECT current_health FROM rumble_player_state WHERE game_id = :game_id AND user_id = :user_id LIMIT 1');
    $healthStmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
    ]);
    $currentHealth = (int)($healthStmt->fetchColumn() ?: 0);
    if ($currentHealth <= 0) {
        error_response('Eliminated players cannot submit bids.', 409);
    }

    $offer = rumble_action_current_offer($gameId, $roundNumber);
    if ($offer === null) {
        error_response('No ability offer is available for this game.', 409);
    }

    $allowedOfferItems = (array)($offer['items'] ?? []);
    $allowedByKey = [];
    foreach ($allowedOfferItems as $item) {
        $offerItemKey = trim((string)($item['offer_item_key'] ?? ''));
        if ($offerItemKey === '') {
            continue;
        }
        $allowedByKey[$offerItemKey] = (string)($item['ability_id'] ?? '');
    }

    $body = json_input();
    $bidsRaw = $body['bids'] ?? [];
    if (!is_array($bidsRaw)) {
        error_response('Bids must be an object keyed by offer item.', 422);
    }

    $normalized = rumble_normalize_bid_map($bidsRaw, $allowedOfferItems);
    $totalBid = 0;
    foreach ($bidsRaw as $offerItemKeyRaw => $amountRaw) {
        $offerItemKey = trim((string)$offerItemKeyRaw);
        if ($offerItemKey === '') {
            error_response('One or more offer item keys are invalid for this offer.', 422);
        }

        if (!isset($allowedByKey[$offerItemKey]) && !in_array($offerItemKey, array_values($allowedByKey), true)) {
            error_response('One or more offer item keys are invalid for this offer.', 422);
        }

        if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
            error_response('Bid amounts must be whole non-negative numbers.', 422);
        }

        $amount = (int)$amountRaw;
        if ($amount < 0) {
            error_response('Bid amounts must be non-negative.', 422);
        }
        $totalBid += max(0, $amount);
    }

    $payload = [
        'bids' => $normalized,
        'total_bid' => $totalBid,
    ];

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $deleteStmt = $pdo->prepare(
            'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
        );
        $deleteStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$user['id'],
            'round_number' => $roundNumber,
            'action_type' => 'bid',
        ]);

        $insertStmt = $pdo->prepare(
            'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
            . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
        );
        $insertStmt->execute([
            'game_id' => $gameId,
            'user_id' => (int)$user['id'],
            'action_type' => 'bid',
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'round_number' => $roundNumber,
            'phase' => 'bidding',
            'revealed_at' => null,
        ]);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    rumble_action_maybe_auto_resolve_bidding($gameId, $roundNumber);

    success_response([
        'submitted' => true,
        'phase' => 'bidding',
        'round' => $roundNumber,
        'total_bid' => $totalBid,
    ], 201);
}

function rumble_action_upsert_ship_name(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);
    if ($role === 'observer') {
        error_response('Observers cannot set ship names.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    $body = json_input();
    $shipNameRaw = (string)($body['ship_name'] ?? '');
    $shipName = trim($shipNameRaw);
    if (strlen($shipName) > 60) {
        error_response('Ship name must be at most 60 characters.', 422);
    }

    $saveValue = $shipName === '' ? null : $shipName;

    $stmt = db()->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health, ship_name, owned_abilities_json) '
        . 'VALUES (:game_id, :user_id, 100, :ship_name, :owned_abilities_json)',
        ['game_id', 'user_id'],
        [
            'ship_name' => ':ship_name_update',
        ]
    ));
    $stmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
        'ship_name' => $saveValue,
        'owned_abilities_json' => json_encode([], JSON_UNESCAPED_UNICODE),
        'ship_name_update' => $saveValue,
    ]);

    success_response([
        'updated' => true,
        'ship_name' => $saveValue ?? (string)($user['username'] ?? ''),
    ]);
}

function rumble_action_cancel_bids(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);
    if ($role === 'observer') {
        error_response('Observers cannot submit bids.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Bids are only allowed while game is in progress.', 409);
    }

    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();
    $roundNumber = (int)($state['current_round'] ?? 1);
    $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
    if ($phase !== 'bidding') {
        error_response('Bids are only allowed during bidding phase.', 409);
    }

    $deleteStmt = db()->prepare(
        'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
    );
    $deleteStmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
        'round_number' => $roundNumber,
        'action_type' => 'bid',
    ]);

    success_response([
        'canceled' => true,
        'deleted' => $deleteStmt->rowCount() > 0,
        'phase' => 'bidding',
        'round' => $roundNumber,
    ]);
}

function rumble_action_end_bidding(int $gameId): void
{
    $user = require_user();
    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    $role = game_member_role((int)$user['id'], $gameId);
    $isOwner = (int)$game['owner_user_id'] === (int)$user['id'];
    $isAdmin = (int)($user['is_admin'] ?? 0) === 1;
    if ($role === null && !$isAdmin) {
        error_response('Only game members can perform this action.', 403);
    }
    if (!$isOwner && !$isAdmin) {
        error_response('Only the game owner or an admin can end bidding.', 403);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Bids are only allowed while game is in progress.', 409);
    }

    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();
    $roundNumber = (int)($state['current_round'] ?? 1);
    $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
    if ($phase !== 'bidding') {
        error_response('Bidding is already closed for this round.', 409);
    }

    $resolved = rumble_action_resolve_bidding_and_enter_battle($gameId, $roundNumber);

    success_response([
        'resolved' => true,
        'phase' => 'battle',
        'round' => $roundNumber,
        'assigned_count' => $resolved,
    ]);
}

function rumble_action_maybe_auto_resolve_bidding(int $gameId, int $roundNumber): void
{
    $stateStmt = db()->prepare('SELECT phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $phase = (string)($stateStmt->fetchColumn() ?: 'bidding');
    if ($phase !== 'bidding') {
        return;
    }

    $participantsStmt = db()->prepare(
        'SELECT COUNT(*) FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
        . 'AND COALESCE(rps.current_health, 100) > 0'
    );
    $participantsStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $participantCount = (int)$participantsStmt->fetchColumn();
    if ($participantCount <= 0) {
        return;
    }

    $submittedStmt = db()->prepare(
        'SELECT COUNT(DISTINCT user_id) FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
    );
    $submittedStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'bid',
    ]);
    $submittedCount = (int)$submittedStmt->fetchColumn();
    if ($submittedCount < $participantCount) {
        return;
    }

    rumble_action_resolve_bidding_and_enter_battle($gameId, $roundNumber);
}

function rumble_action_current_offer(int $gameId, int $roundNumber): ?array
{
    $offerStmt = db()->prepare(
        'SELECT payload FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type '
        . 'ORDER BY id DESC LIMIT 1'
    );
    $offerStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'ability_offer',
    ]);
    $raw = $offerStmt->fetchColumn();
    if ($raw === false) {
        return null;
    }

    $payload = json_decode((string)$raw, true);
    if (!is_array($payload)) {
        return null;
    }

    $items = rumble_normalize_offer_items($payload);

    return [
        'items' => $items,
        'ability_ids' => array_values(array_map(static fn (array $item): string => (string)$item['ability_id'], $items)),
    ];
}

function rumble_action_resolve_bidding_and_enter_battle(int $gameId, int $roundNumber): int
{
    $pdo = db();

    $ensureStmt = $pdo->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) '
        . 'SELECT gm.game_id, gm.user_id, 100 FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
        ]
    ));
    $ensureStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);

    $offer = rumble_action_current_offer($gameId, $roundNumber);
    if ($offer === null || empty($offer['items'])) {
        error_response('No ability offer is available for this game.', 409);
    }

    $playersStmt = $pdo->prepare(
        'SELECT gm.user_id, COALESCE(rps.current_health, 100) AS current_health, rps.owned_abilities_json '
        . 'FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'LEFT JOIN rumble_player_state rps ON rps.game_id = gm.game_id AND rps.user_id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1 '
        . 'AND COALESCE(rps.current_health, 100) > 0'
    );
    $playersStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $playerRows = $playersStmt->fetchAll();

    $remainingHealth = [];
    $healthBeforeByUserId = [];
    $ownedByUser = [];
    foreach ($playerRows as $row) {
        $userId = (int)$row['user_id'];
        $remainingHealth[$userId] = (int)$row['current_health'];
        $healthBeforeByUserId[$userId] = (int)$row['current_health'];
        $ownedByUser[$userId] = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
    }

    if (empty($remainingHealth)) {
        return 0;
    }

    $bidStmt = $pdo->prepare(
        'SELECT user_id, payload FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
    );
    $bidStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'bid',
    ]);
    $bidRows = $bidStmt->fetchAll();

    $offerItems = (array)($offer['items'] ?? []);
    $bidsByOfferItem = [];
    foreach ($offerItems as $offerItem) {
        $offerItemKey = trim((string)($offerItem['offer_item_key'] ?? ''));
        if ($offerItemKey === '') {
            continue;
        }
        $bidsByOfferItem[$offerItemKey] = [];
    }

    foreach ($bidRows as $row) {
        $userId = (int)$row['user_id'];
        if (!isset($remainingHealth[$userId])) {
            continue;
        }

        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            continue;
        }

        $bids = rumble_normalize_bid_map(isset($payload['bids']) ? $payload['bids'] : [], $offerItems);
        foreach ($bids as $offerItemKey => $amount) {
            if (!isset($bidsByOfferItem[$offerItemKey])) {
                continue;
            }
            $bidsByOfferItem[$offerItemKey][$userId] = (int)$amount;
        }
    }

    $assigned = [];
    foreach ($offerItems as $offerItem) {
        $offerItemKey = trim((string)($offerItem['offer_item_key'] ?? ''));
        $abilityId = trim((string)($offerItem['ability_id'] ?? ''));
        if ($offerItemKey === '' || $abilityId === '') {
            continue;
        }

        $abilityBids = $bidsByOfferItem[$offerItemKey] ?? [];
        if (empty($abilityBids)) {
            continue;
        }

        $bidLevels = array_values(array_unique(array_map(static fn ($v): int => (int)$v, array_values($abilityBids))));
        rsort($bidLevels, SORT_NUMERIC);
        $winningBid = 0;
        $candidateIds = [];
        foreach ($bidLevels as $bidLevel) {
            if ($bidLevel <= 0) {
                continue;
            }

            $eligibleAtLevel = [];
            foreach ($abilityBids as $userId => $bidAmount) {
                if ((int)$bidAmount !== (int)$bidLevel) {
                    continue;
                }
                $eligibleAtLevel[] = (int)$userId;
            }

            if (empty($eligibleAtLevel)) {
                continue;
            }

            $winningBid = (int)$bidLevel;
            $candidateIds = $eligibleAtLevel;
            break;
        }

        if ($winningBid <= 0 || empty($candidateIds)) {
            continue;
        }

        $winnerId = $candidateIds[count($candidateIds) === 1 ? 0 : random_int(0, count($candidateIds) - 1)];
        $remainingHealth[$winnerId] = $remainingHealth[$winnerId] - $winningBid;
        $ownedByUser[$winnerId][] = $abilityId;
        $assigned[] = [
            'offer_item_key' => $offerItemKey,
            'ability_id' => $abilityId,
            'user_id' => $winnerId,
            'bid' => $winningBid,
        ];
    }

    $pdo->beginTransaction();
    try {
        $updateStateStmt = $pdo->prepare(db_upsert_sql(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round)',
            ['game_id'],
            [
                'phase' => ':phase_update',
            ]
        ));
        $updateStateStmt->execute([
            'game_id' => $gameId,
            'phase' => 'battle',
            'current_round' => $roundNumber,
            'phase_update' => 'battle',
        ]);

        $updatePlayerStmt = $pdo->prepare(
            'UPDATE rumble_player_state SET current_health = :current_health, owned_abilities_json = :owned_abilities_json '
            . 'WHERE game_id = :game_id AND user_id = :user_id'
        );
        $defeatedUserIds = [];
        foreach ($remainingHealth as $userId => $health) {
            $updatePlayerStmt->execute([
                'current_health' => (int)$health,
                'owned_abilities_json' => rumble_encode_owned_abilities($ownedByUser[$userId] ?? []),
                'game_id' => $gameId,
                'user_id' => $userId,
            ]);

            if ((int)$health <= 0) {
                $defeatedUserIds[] = (int)$userId;
            }
        }

        if (!empty($defeatedUserIds)) {
            $rolePlaceholders = implode(',', array_fill(0, count($defeatedUserIds), '?'));
            $defeatRoleSql = 'UPDATE game_members SET role = ? WHERE game_id = ? AND user_id IN (' . $rolePlaceholders . ') AND role <> ?';
            $defeatRoleParams = array_merge(['observer', $gameId], $defeatedUserIds, ['observer']);
            $defeatRoleStmt = $pdo->prepare($defeatRoleSql);
            $defeatRoleStmt->execute($defeatRoleParams);
        }

        rumble_record_eliminations($pdo, $gameId, $roundNumber, $healthBeforeByUserId, $defeatedUserIds);

        $deleteAssignmentStmt = $pdo->prepare(
            'DELETE FROM game_actions WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
        );
        $deleteAssignmentStmt->execute([
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'action_type' => 'ability_assignment',
        ]);

        $insertAssignmentStmt = $pdo->prepare(
            'INSERT INTO game_actions (game_id, user_id, action_type, payload, round_number, phase, revealed_at) '
            . 'VALUES (:game_id, :user_id, :action_type, :payload, :round_number, :phase, :revealed_at)'
        );
        $assignmentActorId = (int)array_key_first($remainingHealth);
        $insertAssignmentStmt->execute([
            'game_id' => $gameId,
            'user_id' => $assignmentActorId,
            'action_type' => 'ability_assignment',
            'payload' => json_encode(['assigned' => $assigned], JSON_UNESCAPED_UNICODE),
            'round_number' => $roundNumber,
            'phase' => 'bidding',
            'revealed_at' => gmdate('Y-m-d H:i:s'),
        ]);

        rumble_finalize_standings_if_won($pdo, $gameId, $roundNumber);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    return count($assigned);
}

function rumble_action_cancel_order(int $gameId): void
{
    $user = require_user();
    $role = game_require_member_or_403((int)$user['id'], $gameId);
    if ($role === 'observer') {
        error_response('Observers cannot submit actions.', 403);
    }

    $game = game_find_by_id($gameId);
    if ($game === null) {
        error_response('Game not found.', 404);
    }

    if (normalize_game_type((string)$game['game_type']) !== 'rumble') {
        error_response('This endpoint is only available for rumble games.', 409);
    }

    if ((string)$game['status'] !== 'in_progress') {
        error_response('Game actions are only allowed while game is in progress.', 409);
    }

    $stateStmt = db()->prepare('SELECT current_round, phase FROM game_state WHERE game_id = :game_id LIMIT 1');
    $stateStmt->execute(['game_id' => $gameId]);
    $state = $stateStmt->fetch();
    $roundNumber = (int)($state['current_round'] ?? 1);
    $phase = (string)($state['phase'] ?? default_phase_for_game_type((string)$game['game_type']));
    if ($phase !== 'battle') {
        error_response('Rumble orders are only available during battle phase.', 409);
    }

    $deleteStmt = db()->prepare(
        'DELETE FROM game_actions WHERE game_id = :game_id AND user_id = :user_id AND round_number = :round_number AND action_type = :action_type'
    );
    $deleteStmt->execute([
        'game_id' => $gameId,
        'user_id' => (int)$user['id'],
        'round_number' => $roundNumber,
        'action_type' => 'order',
    ]);

    success_response([
        'canceled' => true,
        'deleted' => $deleteStmt->rowCount() > 0,
        'round' => $roundNumber,
    ]);
}

function rumble_action_resolve_round_and_advance(int $gameId, int $roundNumber): int
{
    $pdo = db();

    $ensureStmt = $pdo->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health) '
        . 'SELECT gm.game_id, gm.user_id, 100 FROM game_members gm '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE gm.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
        ]
    ));
    $ensureStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);

    $playersStmt = $pdo->prepare(
        'SELECT rps.user_id, rps.current_health, rps.owned_abilities_json FROM rumble_player_state rps '
        . 'JOIN game_members gm ON gm.game_id = rps.game_id AND gm.user_id = rps.user_id '
        . 'JOIN users u ON u.id = gm.user_id '
        . 'WHERE rps.game_id = :game_id AND gm.role <> :observer_role AND u.is_active = 1'
    );
    $playersStmt->execute([
        'game_id' => $gameId,
        'observer_role' => 'observer',
    ]);
    $playerRows = $playersStmt->fetchAll();
    if (empty($playerRows)) {
        return 0;
    }

    $healthByUser = [];
    $healthBeforeByUser = [];
    $ownedAbilityIdsByUser = [];
    $ownedAbilitySetByUser = [];
    $energyBudgetByUser = [];
    $roundStartDefenseBonusByUser = [];
    $activatedDefenseBonusByUser = [];
    $untargetableByUser = [];
    $cannotAttackByUser = [];
    $blockedAttackTargetsByUser = [];
    $armorReductionByUser = [];
    $nimbleDodgeByUser = [];
    $focusedDefenseByUser = [];
    $reflectiveShieldByUser = [];
    $defeatRestoreHealthByUser = [];
    $roundEndUpkeepHealthLossByUser = [];
    $preRoundEffectRows = [];

    foreach ($playerRows as $row) {
        $userId = (int)$row['user_id'];
        $health = max(0, (int)$row['current_health']);
        $ownedAbilityIds = rumble_parse_owned_abilities(isset($row['owned_abilities_json']) ? (string)$row['owned_abilities_json'] : null);
        $abilitySet = array_fill_keys($ownedAbilityIds, true);

        if (isset($abilitySet['automated_repair_systems'])) {
            $health = min(100, $health + 5);
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_heal',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'automated_repair_systems', 'amount' => 5],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
        if (isset($abilitySet['replicators'])) {
            $health += 5;
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_heal',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'replicators', 'amount' => 5],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
        if (isset($abilitySet['mcguffin_generator']) && $roundNumber === 3) {
            $health += 50;
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_heal',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'mcguffin_generator', 'amount' => 50],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }

        $healthByUser[$userId] = $health;
        $healthBeforeByUser[$userId] = $health;
        $ownedAbilityIdsByUser[$userId] = $ownedAbilityIds;
        $ownedAbilitySetByUser[$userId] = $abilitySet;
        $energyBudgetByUser[$userId] = rumble_player_round_energy_budget($health, $ownedAbilityIds);

        $roundStartDefenseBonusByUser[$userId] = isset($abilitySet['shield_boosters']) ? 20 : 0;
        $activatedDefenseBonusByUser[$userId] = 0;
        $untargetableByUser[$userId] = false;
        foreach ($ownedAbilityIds as $ownedAbilityId) {
            $ownedAbility = rumble_ability_by_id($ownedAbilityId);
            if ($ownedAbility === null) {
                continue;
            }
            foreach (rumble_ability_state_grants($ownedAbility, 'always') as $state) {
                rumble_apply_runtime_state_to_targeting_maps($state, $userId, null, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser);
            }
        }
        $armorReductionByUser[$userId] = isset($abilitySet['heavy_armor']) ? 10 : (isset($abilitySet['armor']) ? 5 : 0);
        $nimbleDodgeByUser[$userId] = false;
        $focusedDefenseByUser[$userId] = [];
        $reflectiveShieldByUser[$userId] = isset($abilitySet['reflective_shield']);
        $defeatRestoreHealthByUser[$userId] = isset($abilitySet['backup_generator']) ? 30 : (isset($abilitySet['escape_pods']) ? 20 : 0);
        $roundEndUpkeepHealthLossByUser[$userId] = isset($abilitySet['holoship']) ? 5 : 0;

        $preRoundEffectRows[] = [
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'owner_user_id' => $userId,
            'target_user_id' => null,
            'ability_instance_id' => null,
            'effect_key' => 'step1:set_round_stats',
            'trigger_timing' => 'resolve',
            'payload' => ['health' => $health, 'energy_budget' => $energyBudgetByUser[$userId]],
            'is_resolved' => 1,
            'resolved_at' => gmdate('Y-m-d H:i:s'),
        ];

        if (($roundStartDefenseBonusByUser[$userId] ?? 0) > 0) {
            $preRoundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step2:passive_round_start_defense',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'shield_boosters', 'defense_bonus' => (int)$roundStartDefenseBonusByUser[$userId]],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
    }

    $roundEffectRows = $preRoundEffectRows;

    $pendingRoundStartEffects = rumble_fetch_round_start_effects($gameId, $roundNumber);
    $roundTargetingState = rumble_collect_round_targeting_state($playerRows, $pendingRoundStartEffects);
    $untargetableByUser = array_replace($untargetableByUser, (array)($roundTargetingState['untargetable_by_user'] ?? []));
    $cannotAttackByUser = array_replace(array_fill_keys(array_keys($healthByUser), false), (array)($roundTargetingState['cannot_attack_by_user'] ?? []));
    $blockedAttackTargetsByUser = array_replace(array_fill_keys(array_keys($healthByUser), []), (array)($roundTargetingState['blocked_attack_targets_by_user'] ?? []));
    $activePersistentRoundStartEffectsByUser = [];
    $roundStartEffectIdsToResolve = [];
    foreach ($pendingRoundStartEffects as $effectRow) {
        $effectId = (int)($effectRow['id'] ?? 0);
        $ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
        $targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null ? (int)$effectRow['target_user_id'] : null;
        if ($effectId <= 0 || !isset($healthByUser[$ownerUserId])) {
            continue;
        }

        $payload = json_decode((string)($effectRow['payload'] ?? '{}'), true);
        if (!is_array($payload)) {
            $payload = [];
        }

        $scheduledState = rumble_runtime_state_from_payload($payload, $ownerUserId, $targetUserId);
        if ($scheduledState !== null) {
            $roundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $ownerUserId,
                'target_user_id' => $targetUserId,
                'ability_instance_id' => null,
                'effect_key' => 'step2:scheduled_status',
                'trigger_timing' => 'resolve',
                'payload' => ['effect' => (string)($payload['effect'] ?? ''), 'state' => $scheduledState],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];

            $duration = is_array($scheduledState['duration'] ?? null) ? (array)$scheduledState['duration'] : [];
            $sourceAbilityId = rumble_canonical_ability_id((string)($payload['source_ability_id'] ?? ''));
            if ((string)($duration['kind'] ?? '') === 'until_removed' && $sourceAbilityId !== '') {
                $activePersistentRoundStartEffectsByUser[$ownerUserId][$sourceAbilityId] = [
                    'target_user_id' => $targetUserId,
                    'effect_key' => (string)($effectRow['effect_key'] ?? ''),
                    'payload' => $payload,
                ];
            }
        }

        $roundStartEffectIdsToResolve[] = $effectId;
    }

    $ordersStmt = $pdo->prepare(
        'SELECT user_id, payload FROM game_actions '
        . 'WHERE game_id = :game_id AND round_number = :round_number AND action_type = :action_type'
    );
    $ordersStmt->execute([
        'game_id' => $gameId,
        'round_number' => $roundNumber,
        'action_type' => 'order',
    ]);
    $orderRows = $ordersStmt->fetchAll();
    usort($orderRows, static function (array $a, array $b): int {
        return ((int)($a['user_id'] ?? 0)) <=> ((int)($b['user_id'] ?? 0));
    });

    $normalIncomingByTargetByAttacker = [];
    $unblockableIncomingByTargetByAttacker = [];
    $defenseByUser = [];
    $abilityEnergySpentByUser = [];
    $attackEnergySpentByUser = [];
    $totalEnergySpentByUser = [];

    foreach ($healthByUser as $userId => $health) {
        $normalIncomingByTargetByAttacker[$userId] = [];
        $unblockableIncomingByTargetByAttacker[$userId] = [];
        $defenseByUser[$userId] = max(0, $health + (int)($roundStartDefenseBonusByUser[$userId] ?? 0));
        $abilityEnergySpentByUser[$userId] = 0;
        $attackEnergySpentByUser[$userId] = 0;
        $totalEnergySpentByUser[$userId] = 0;
    }

    $activationHealthLossByUser = [];
    $activationHealingByUser = [];
    $efficientTargetingByUser = [];
    $mineLayerDamageByUser = [];
    $schemingTargetByUser = [];
    $retaliationDamageByUser = [];
    $toggleActivatedByUser = [];
    foreach ($healthByUser as $userId => $health) {
        $retaliationDamageByUser[$userId] = 0;
        $toggleActivatedByUser[$userId] = [];
    }

    foreach ($orderRows as $row) {
        $userId = (int)$row['user_id'];
        if (!isset($healthByUser[$userId])) {
            continue;
        }

        $health = $healthByUser[$userId];
        if ($health <= 0) {
            continue;
        }

        $payload = json_decode((string)$row['payload'], true);
        if (!is_array($payload)) {
            continue;
        }

        $attacks = isset($payload['attacks']) && is_array($payload['attacks']) ? $payload['attacks'] : [];
        $activations = rumble_normalize_ability_activations($payload['ability_activations'] ?? []);

        $ownedMap = array_fill_keys($ownedAbilityIdsByUser[$userId] ?? [], true);
        $energyBudget = max(0, (int)($energyBudgetByUser[$userId] ?? 0));
        $remainingEnergy = $energyBudget;

        foreach ($activations as $activation) {
            $abilityId = (string)($activation['ability_id'] ?? '');
            if ($abilityId === '' || !isset($ownedMap[$abilityId])) {
                continue;
            }

            try {
                $activationCost = rumble_activation_energy_cost($activation, true);
            } catch (InvalidArgumentException $ex) {
                continue;
            }

            if ($activationCost > $remainingEnergy) {
                continue;
            }

            $ability = rumble_ability_by_id($abilityId);
            if ($ability === null) {
                continue;
            }

            $targetId = array_key_exists('target_user_id', $activation) ? (int)$activation['target_user_id'] : 0;
            if ($targetId > 0 && (!isset($healthByUser[$targetId]) || $targetId === $userId || $healthByUser[$targetId] <= 0)) {
                continue;
            }
            if ($targetId > 0 && !empty($untargetableByUser[$targetId])) {
                continue;
            }

            $remainingEnergy -= $activationCost;
            $abilityEnergySpentByUser[$userId] += $activationCost;

            $templateKey = rumble_ability_template_key($ability);
            $templateParams = rumble_ability_template_params($ability);
            $runtimeContract = rumble_ability_runtime_contract($ability);
            $activationContract = is_array($runtimeContract['activation'] ?? null) ? (array)$runtimeContract['activation'] : [];
            $effectPayload = ['ability_id' => $abilityId, 'activation' => $activation, 'cost' => $activationCost];
            $healthBurn = max(0, (int)($templateParams['health_burn'] ?? 0));
            if ($healthBurn > 0) {
                $activationHealthLossByUser[$userId] = max(0, (int)($activationHealthLossByUser[$userId] ?? 0)) + $healthBurn;
                $effectPayload['health_burn'] = $healthBurn;
            }

            if ($activationContract !== []) {
                $activationKind = trim((string)($activationContract['kind'] ?? 'activated'));
                $isActiveToggle = !empty($activePersistentRoundStartEffectsByUser[$userId][$abilityId]);
                if ($activationKind === 'toggle') {
                    $toggleActivatedByUser[$userId][$abilityId] = true;
                    $effectPayload['mode'] = $isActiveToggle ? 'deactivate' : 'activate';
                }

                foreach ((array)($activationContract['effects'] ?? []) as $effect) {
                    if (!is_array($effect)) {
                        continue;
                    }
                    rumble_apply_runtime_activation_effect($effect, $userId, $targetId > 0 ? $targetId : null, $activation, $untargetableByUser, $cannotAttackByUser, $blockedAttackTargetsByUser, $nimbleDodgeByUser, $focusedDefenseByUser, $activatedDefenseBonusByUser, $mineLayerDamageByUser, $schemingTargetByUser, $effectPayload);
                }

                if (!$isActiveToggle) {
                    $scheduledAny = false;
                    foreach ((array)($activationContract['scheduled_effects'] ?? []) as $effect) {
                        if (!is_array($effect)) {
                            continue;
                        }
                        $scheduledAny = rumble_append_runtime_scheduled_effect($effect, $gameId, $roundNumber, $userId, $targetId > 0 ? $targetId : null, $abilityId, $roundEffectRows) || $scheduledAny;
                    }
                    if ($scheduledAny) {
                        $effectPayload['scheduled_for_round'] = $roundNumber + 1;
                    }
                }
            } elseif ($templateKey === 'activated_spend_with_target_policy') {
                $effectFormula = (array)($templateParams['effect_formula'] ?? []);
                $effectKind = (string)($effectFormula['kind'] ?? '');
                if ($effectKind === 'damage_constant' && $targetId > 0) {
                    $damage = max(0, (int)($effectFormula['value'] ?? 0));
                    $channel = (string)($effectFormula['channel'] ?? 'normal');
                    if ($channel === 'unblockable') {
                        $unblockableIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($unblockableIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $damage;
                    } else {
                        $normalIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($normalIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $damage;
                    }
                    $effectPayload['applied_damage'] = $damage;
                    $effectPayload['channel'] = $channel;
                } elseif ($effectKind === 'damage_floor_half_x') {
                    $x = max(0, (int)($activation['x_cost'] ?? 0));
                    $damage = (int)floor($x / 2);
                    if ($damage > 0) {
                        foreach ($healthByUser as $candidateId => $candidateHealth) {
                            if ($candidateId === $userId || $candidateHealth <= 0) {
                                continue;
                            }
                            if (!empty($untargetableByUser[$candidateId])) {
                                continue;
                            }
                            $normalIncomingByTargetByAttacker[$candidateId][$userId] = max(0, (int)($normalIncomingByTargetByAttacker[$candidateId][$userId] ?? 0)) + $damage;
                        }
                    }
                    $effectPayload['applied_damage_each'] = $damage;
                } elseif ($effectKind === 'heal_x') {
                    $healing = max(0, (int)($activation['x_cost'] ?? 0));
                    if ($healing > 0) {
                        $activationHealingByUser[$userId] = max(0, (int)($activationHealingByUser[$userId] ?? 0)) + $healing;
                        $effectPayload['healing'] = $healing;
                    }
                } elseif ($effectKind === 'second_largest_attack_free') {
                    $efficientTargetingByUser[$userId] = true;
                    $effectPayload['enabled'] = true;
                }
            } elseif ($templateKey === 'activated_defense_mode') {
            }

            $roundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => $targetId > 0 ? $targetId : null,
                'ability_instance_id' => null,
                'effect_key' => 'activation:' . $abilityId,
                'trigger_timing' => 'resolve',
                'payload' => $effectPayload,
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }

        $defenseByUser[$userId] += max(0, (int)($activatedDefenseBonusByUser[$userId] ?? 0));

        $remaining = min($health, $remainingEnergy);
        $used = 0;
        $attackableTargetCount = 0;
        $positiveAttackSpends = [];
        $orderedTargets = array_keys($attacks);
        sort($orderedTargets, SORT_NUMERIC);
        if (empty($cannotAttackByUser[$userId])) {
            foreach ($orderedTargets as $targetKey) {
                if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
                    continue;
                }
                $targetId = (int)$targetKey;
                if (!isset($healthByUser[$targetId]) || $targetId === $userId || $healthByUser[$targetId] <= 0 || !empty($untargetableByUser[$targetId])) {
                    continue;
                }
                if (!empty(($blockedAttackTargetsByUser[$userId] ?? [])[$targetId])) {
                    continue;
                }
                $amountRaw = $attacks[$targetKey] ?? 0;
                if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
                    continue;
                }
                if ((int)$amountRaw > 0) {
                    $attackableTargetCount++;
                    $positiveAttackSpends[] = (int)$amountRaw;
                }
            }
        }
        $singleAttackBonusApplies = isset($ownedMap['death_ray']) && $attackableTargetCount === 1;
        if (!empty($efficientTargetingByUser[$userId])) {
            rsort($positiveAttackSpends, SORT_NUMERIC);
            if (count($positiveAttackSpends) >= 2) {
                $remaining += max(0, (int)$positiveAttackSpends[1]);
            }
        }

        foreach ($orderedTargets as $targetKey) {
            if ($remaining <= 0) {
                break;
            }

            if (!is_int($targetKey) && !ctype_digit((string)$targetKey)) {
                continue;
            }

            $targetId = (int)$targetKey;
            if (!isset($healthByUser[$targetId]) || $targetId === $userId) {
                continue;
            }
            if (!empty($untargetableByUser[$targetId])) {
                continue;
            }
            if (!empty($cannotAttackByUser[$userId]) || !empty(($blockedAttackTargetsByUser[$userId] ?? [])[$targetId])) {
                continue;
            }

            $amountRaw = $attacks[$targetKey] ?? 0;
            if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
                continue;
            }

            $amount = max(0, (int)$amountRaw);
            if ($amount === 0) {
                continue;
            }

            $spend = min($amount, $remaining);
            if ($spend <= 0) {
                continue;
            }

            $attackDamage = $spend;
            if (isset($ownedMap['heavy_guns'])) {
                $attackDamage += 10;
            }
            if ($singleAttackBonusApplies) {
                $attackDamage = (int)floor($attackDamage * 1.5);
            }

            $incomingAttackMultiplier = (float)($focusedDefenseByUser[$targetId][$userId] ?? 1.0);
            if ($incomingAttackMultiplier > 0.0 && $incomingAttackMultiplier !== 1.0) {
                $attackDamage = (int)floor($attackDamage * $incomingAttackMultiplier);
            }

            if ($attackDamage > 0) {
                $normalIncomingByTargetByAttacker[$targetId][$userId] = max(0, (int)($normalIncomingByTargetByAttacker[$targetId][$userId] ?? 0)) + $attackDamage;
            }
            $used += $spend;
            $remaining -= $spend;
        }

        $attackEnergySpentByUser[$userId] = $used;
        $totalEnergySpentByUser[$userId] = $attackEnergySpentByUser[$userId] + $abilityEnergySpentByUser[$userId];
        $defenseByUser[$userId] = max(0, $health - $used);

        foreach ((array)($activePersistentRoundStartEffectsByUser[$userId] ?? []) as $sourceAbilityId => $persistentEffect) {
            if (!empty(($toggleActivatedByUser[$userId] ?? [])[$sourceAbilityId])) {
                continue;
            }

            $persistentPayload = is_array($persistentEffect['payload'] ?? null) ? (array)$persistentEffect['payload'] : [];
            if (!isset($persistentPayload['state']) || !is_array($persistentPayload['state'])) {
                continue;
            }

            $persistentState = (array)$persistentPayload['state'];
            $roundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber + 1,
                'owner_user_id' => $userId,
                'target_user_id' => isset($persistentEffect['target_user_id']) && $persistentEffect['target_user_id'] !== null ? (int)$persistentEffect['target_user_id'] : null,
                'ability_instance_id' => null,
                'effect_key' => (string)($persistentEffect['effect_key'] ?? ('status:' . (string)($persistentState['state_key'] ?? 'state'))),
                'trigger_timing' => 'round_start',
                'payload' => $persistentPayload,
                'is_resolved' => 0,
                'resolved_at' => null,
            ];
        }
        $defenseByUser[$userId] += max(0, (int)($roundStartDefenseBonusByUser[$userId] ?? 0)) + max(0, (int)($activatedDefenseBonusByUser[$userId] ?? 0));

        $roundEffectRows[] = [
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'owner_user_id' => $userId,
            'target_user_id' => null,
            'ability_instance_id' => null,
            'effect_key' => 'step4:energy_summary',
            'trigger_timing' => 'resolve',
            'payload' => [
                'energy_budget' => $energyBudget,
                'attack_energy_spent' => $attackEnergySpentByUser[$userId],
                'ability_energy_spent' => $abilityEnergySpentByUser[$userId],
                'total_energy_spent' => $totalEnergySpentByUser[$userId],
                'energy_remaining' => max(0, $energyBudget - $totalEnergySpentByUser[$userId]),
            ],
            'is_resolved' => 1,
            'resolved_at' => gmdate('Y-m-d H:i:s'),
        ];
    }

    foreach ($normalIncomingByTargetByAttacker as $targetId => $attackerMap) {
        if (empty($attackerMap)) {
            continue;
        }

        if (isset($schemingTargetByUser[$targetId])) {
            $schemingAttackerId = (int)$schemingTargetByUser[$targetId];
            $schemingAmount = max(0, (int)($attackerMap[$schemingAttackerId] ?? 0));
            if ($schemingAmount > 0) {
                $normalIncomingByTargetByAttacker[$targetId][$schemingAttackerId] = 0;
                $retaliationDamageByUser[$schemingAttackerId] = max(0, (int)($retaliationDamageByUser[$schemingAttackerId] ?? 0)) + $schemingAmount;
                $roundEffectRows[] = [
                    'game_id' => $gameId,
                    'round_number' => $roundNumber,
                    'owner_user_id' => (int)$targetId,
                    'target_user_id' => $schemingAttackerId,
                    'ability_instance_id' => null,
                    'effect_key' => 'trigger:scheming',
                    'trigger_timing' => 'resolve',
                    'payload' => ['negated_attack' => $schemingAmount],
                    'is_resolved' => 1,
                    'resolved_at' => gmdate('Y-m-d H:i:s'),
                ];
            }
        }

        if (!empty($nimbleDodgeByUser[$targetId])) {
            $largestAttackerId = null;
            $largestAmount = -1;
            foreach ($attackerMap as $attackerId => $amount) {
                $amountInt = max(0, (int)$amount);
                if ($amountInt > $largestAmount || ($amountInt === $largestAmount && (int)$attackerId < (int)$largestAttackerId)) {
                    $largestAmount = $amountInt;
                    $largestAttackerId = (int)$attackerId;
                }
            }
            if ($largestAttackerId !== null && $largestAmount > 0) {
                $normalIncomingByTargetByAttacker[$targetId][$largestAttackerId] = 0;
                $roundEffectRows[] = [
                    'game_id' => $gameId,
                    'round_number' => $roundNumber,
                    'owner_user_id' => (int)$targetId,
                    'target_user_id' => $largestAttackerId,
                    'ability_instance_id' => null,
                    'effect_key' => 'trigger:nimble_dodge',
                    'trigger_timing' => 'resolve',
                    'payload' => ['negated_attack' => $largestAmount],
                    'is_resolved' => 1,
                    'resolved_at' => gmdate('Y-m-d H:i:s'),
                ];
            }
        }

        $reduction = max(0, (int)($armorReductionByUser[$targetId] ?? 0));
        if ($reduction > 0) {
            foreach ($attackerMap as $attackerId => $amount) {
                $normalIncomingByTargetByAttacker[$targetId][$attackerId] = max(0, (int)$amount - $reduction);
            }
        }

        $mineLayerDamage = max(0, (int)($mineLayerDamageByUser[$targetId] ?? 0));
        if ($mineLayerDamage > 0) {
            foreach ($normalIncomingByTargetByAttacker[$targetId] as $attackerId => $amount) {
                if (max(0, (int)$amount) <= 0) {
                    continue;
                }
                $retaliationDamageByUser[(int)$attackerId] = max(0, (int)($retaliationDamageByUser[(int)$attackerId] ?? 0)) + $mineLayerDamage;
            }
        }
    }

    $nextHealthByUser = [];

    foreach ($healthByUser as $userId => $health) {
        if ($health <= 0) {
            $nextHealthByUser[$userId] = 0;
            continue;
        }

        $normalByAttacker = $normalIncomingByTargetByAttacker[$userId] ?? [];
        $unblockableByAttacker = $unblockableIncomingByTargetByAttacker[$userId] ?? [];
        ksort($normalByAttacker, SORT_NUMERIC);
        ksort($unblockableByAttacker, SORT_NUMERIC);

        $remainingDefense = max(0, (int)($defenseByUser[$userId] ?? 0));
        $damageByAttacker = [];

        foreach ($normalByAttacker as $attackerId => $amount) {
            $normalAmount = max(0, (int)$amount);
            if ($normalAmount <= 0) {
                continue;
            }

            $absorbed = min($remainingDefense, $normalAmount);
            $remainingDefense -= $absorbed;
            $postDefense = $normalAmount - $absorbed;
            if ($postDefense > 0) {
                $damageByAttacker[(int)$attackerId] = max(0, (int)($damageByAttacker[(int)$attackerId] ?? 0)) + $postDefense;
            }
        }

        foreach ($unblockableByAttacker as $attackerId => $amount) {
            $unblockableAmount = max(0, (int)$amount);
            if ($unblockableAmount <= 0) {
                continue;
            }
            $damageByAttacker[(int)$attackerId] = max(0, (int)($damageByAttacker[(int)$attackerId] ?? 0)) + $unblockableAmount;
        }

        $damage = 0;
        foreach ($damageByAttacker as $attackerId => $amount) {
            $damage += max(0, (int)$amount);
            if (!empty($reflectiveShieldByUser[$userId]) && isset($retaliationDamageByUser[(int)$attackerId])) {
                $retaliationDamageByUser[(int)$attackerId] += (int)floor(max(0, (int)$amount) / 2);
            }
        }

        $preRetaliationHealth = max(0, $health - $damage - max(0, (int)($activationHealthLossByUser[$userId] ?? 0)));
        $nextHealthByUser[$userId] = min(1000, $preRetaliationHealth + max(0, (int)($activationHealingByUser[$userId] ?? 0)));

        $normalIncomingTotal = 0;
        foreach ($normalByAttacker as $v) {
            $normalIncomingTotal += max(0, (int)$v);
        }
        $unblockableIncomingTotal = 0;
        foreach ($unblockableByAttacker as $v) {
            $unblockableIncomingTotal += max(0, (int)$v);
        }
        $roundEffectRows[] = [
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'owner_user_id' => $userId,
            'target_user_id' => null,
            'ability_instance_id' => null,
            'effect_key' => 'step6:damage_resolution',
            'trigger_timing' => 'resolve',
            'payload' => [
                'normal_incoming' => $normalIncomingTotal,
                'unblockable_incoming' => $unblockableIncomingTotal,
                'defense_available' => max(0, (int)($defenseByUser[$userId] ?? 0)),
                'final_damage' => $damage,
                'next_health' => $nextHealthByUser[$userId],
            ],
            'is_resolved' => 1,
            'resolved_at' => gmdate('Y-m-d H:i:s'),
        ];
    }

    foreach ($retaliationDamageByUser as $userId => $retaliationDamage) {
        if (!isset($nextHealthByUser[$userId]) || $retaliationDamage <= 0) {
            continue;
        }
        $nextHealthByUser[$userId] = max(0, (int)$nextHealthByUser[$userId] - $retaliationDamage);
    }

    foreach ($nextHealthByUser as $userId => $nextHealth) {
        $upkeepLoss = max(0, (int)($roundEndUpkeepHealthLossByUser[$userId] ?? 0));
        if ($upkeepLoss > 0 && $nextHealth > 0) {
            $nextHealthByUser[$userId] = max(0, $nextHealth - $upkeepLoss);
            $roundEffectRows[] = [
                'game_id' => $gameId,
                'round_number' => $roundNumber,
                'owner_user_id' => $userId,
                'target_user_id' => null,
                'ability_instance_id' => null,
                'effect_key' => 'step7:upkeep_cost',
                'trigger_timing' => 'resolve',
                'payload' => ['source_ability_id' => 'holoship', 'health_loss' => $upkeepLoss],
                'is_resolved' => 1,
                'resolved_at' => gmdate('Y-m-d H:i:s'),
            ];
        }
    }

    foreach ($nextHealthByUser as $userId => $nextHealth) {
        if ($nextHealth > 0) {
            continue;
        }
        $restoreHealth = max(0, (int)($defeatRestoreHealthByUser[$userId] ?? 0));
        if ($restoreHealth <= 0) {
            continue;
        }

        $nextHealthByUser[$userId] = $restoreHealth;
        if (!empty($ownedAbilitySetByUser[$userId]['backup_generator'])) {
            unset($ownedAbilitySetByUser[$userId]['backup_generator']);
        } elseif (!empty($ownedAbilitySetByUser[$userId]['escape_pods'])) {
            unset($ownedAbilitySetByUser[$userId]['escape_pods']);
        }

        $ownedAbilityIdsByUser[$userId] = array_values(array_keys($ownedAbilitySetByUser[$userId]));
        sort($ownedAbilityIdsByUser[$userId], SORT_STRING);

        $roundEffectRows[] = [
            'game_id' => $gameId,
            'round_number' => $roundNumber,
            'owner_user_id' => $userId,
            'target_user_id' => null,
            'ability_instance_id' => null,
            'effect_key' => 'trigger:on_defeat_restore',
            'trigger_timing' => 'resolve',
            'payload' => ['restored_health' => $restoreHealth],
            'is_resolved' => 1,
            'resolved_at' => gmdate('Y-m-d H:i:s'),
        ];
    }

    $pdo->beginTransaction();
    try {
        $updateHealthStmt = $pdo->prepare(
            'UPDATE rumble_player_state SET current_health = :current_health, owned_abilities_json = :owned_abilities_json WHERE game_id = :game_id AND user_id = :user_id'
        );
        $defeatedUserIds = [];
        foreach ($nextHealthByUser as $userId => $nextHealth) {
            $updateHealthStmt->execute([
                'current_health' => $nextHealth,
                'owned_abilities_json' => rumble_encode_owned_abilities($ownedAbilityIdsByUser[$userId] ?? []),
                'game_id' => $gameId,
                'user_id' => $userId,
            ]);

            if ($nextHealth <= 0) {
                $defeatedUserIds[] = $userId;
            }
        }

        if (!empty($defeatedUserIds)) {
            $rolePlaceholders = implode(',', array_fill(0, count($defeatedUserIds), '?'));
            $defeatRoleSql = 'UPDATE game_members SET role = ? WHERE game_id = ? AND user_id IN (' . $rolePlaceholders . ') AND role <> ?';
            $defeatRoleParams = array_merge(['observer', $gameId], $defeatedUserIds, ['observer']);
            $defeatRoleStmt = $pdo->prepare($defeatRoleSql);
            $defeatRoleStmt->execute($defeatRoleParams);
        }

        rumble_record_eliminations($pdo, $gameId, $roundNumber, $healthBeforeByUser, $defeatedUserIds);

        if (!empty($roundStartEffectIdsToResolve)) {
            $idPlaceholders = implode(',', array_fill(0, count($roundStartEffectIdsToResolve), '?'));
            $resolveSql = 'UPDATE rumble_round_effects SET is_resolved = 1, resolved_at = ? WHERE id IN (' . $idPlaceholders . ')';
            $resolveParams = array_merge([gmdate('Y-m-d H:i:s')], $roundStartEffectIdsToResolve);
            $resolveStmt = $pdo->prepare($resolveSql);
            $resolveStmt->execute($resolveParams);
        }

        if (!empty($roundEffectRows)) {
            $insertEffectStmt = $pdo->prepare(
                'INSERT INTO rumble_round_effects '
                . '(game_id, round_number, owner_user_id, target_user_id, ability_instance_id, effect_key, trigger_timing, payload, is_resolved, resolved_at) '
                . 'VALUES (:game_id, :round_number, :owner_user_id, :target_user_id, :ability_instance_id, :effect_key, :trigger_timing, :payload, :is_resolved, :resolved_at)'
            );
            foreach ($roundEffectRows as $effectRow) {
                $insertEffectStmt->execute([
                    'game_id' => $effectRow['game_id'],
                    'round_number' => $effectRow['round_number'],
                    'owner_user_id' => $effectRow['owner_user_id'],
                    'target_user_id' => $effectRow['target_user_id'],
                    'ability_instance_id' => $effectRow['ability_instance_id'],
                    'effect_key' => $effectRow['effect_key'],
                    'trigger_timing' => $effectRow['trigger_timing'],
                    'payload' => json_encode($effectRow['payload'], JSON_UNESCAPED_UNICODE),
                    'is_resolved' => $effectRow['is_resolved'],
                    'resolved_at' => $effectRow['resolved_at'],
                ]);
            }
        }

        $stateStmt = $pdo->prepare(db_upsert_sql(
            'INSERT INTO game_state (game_id, phase, current_round) VALUES (:game_id, :phase, :current_round)',
            ['game_id'],
            [
                'current_round' => db_greatest_sql('current_round', ':next_round'),
                'phase' => ':phase_update',
            ]
        ));
        $stateStmt->execute([
            'game_id' => $gameId,
            'phase' => 'battle',
            'current_round' => $roundNumber,
            'next_round' => $roundNumber + 1,
            'phase_update' => 'battle',
        ]);

        rumble_finalize_standings_if_won($pdo, $gameId, $roundNumber);

        $pdo->commit();
    } catch (Throwable $ex) {
        $pdo->rollBack();
        throw $ex;
    }

    return count($orderRows);
}
