<?php

// Ability catalog and template helpers for Rumble (migrated from
// api/lib/rumble.php). These functions read the DB-backed ability
// definitions and provide canonical ids, template catalog, and public
// views.

function rumble_default_ability_library(): array
{
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

