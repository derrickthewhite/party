<?php

// Runtime helpers for Rumble (migrated from api/lib/rumble.php)
// These are pure/utility factories and state handling helpers used by the
// resolver and presentation code.

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

function rumble_ability_limits(array $ability): array
{
	$contract = rumble_ability_runtime_contract($ability);
	$limits = [];
	foreach ((array)($contract['limits'] ?? []) as $limit) {
		if (is_array($limit)) {
			$limits[] = $limit;
		}
	}
	return $limits;
}

function rumble_validate_ability_activation_limits(array $ability, array $context): ?string
{
	foreach (rumble_ability_limits($ability) as $limit) {
		$kind = trim((string)($limit['kind'] ?? ''));
		if ($kind === 'min_alive_players') {
			$minimum = max(0, (int)($limit['value'] ?? 0));
			$alivePlayers = max(0, (int)($context['alive_player_count'] ?? 0));
			if ($alivePlayers < $minimum) {
				$message = trim((string)($limit['message'] ?? ''));
				return $message !== '' ? $message : 'This ability is not valid in the current game state.';
			}
		}
	}

	return null;
}

function rumble_ability_is_offer_eligible(array $ability, array $context): bool
{
	$alivePlayers = max(0, (int)($context['alive_player_count'] ?? 0));
	foreach (rumble_ability_limits($ability) as $limit) {
		$kind = trim((string)($limit['kind'] ?? ''));
		if ($kind !== 'min_alive_players' && $kind !== 'offer_min_alive_players') {
			continue;
		}

		$minimum = max(0, (int)($limit['value'] ?? 0));
		if ($alivePlayers < $minimum) {
			return false;
		}
	}

	return true;
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

function rumble_ability_trigger_rules(array $ability, string $event): array
{
	$contract = rumble_ability_runtime_contract($ability);
	$rules = [];
	foreach ((array)($contract['triggers'] ?? []) as $rule) {
		if (!is_array($rule)) {
			continue;
		}
		if ((string)($rule['event'] ?? '') !== $event) {
			continue;
		}
		$rules[] = $rule;
	}
	return $rules;
}

function rumble_ability_on_defeat_restore_rule(array $ability): ?array
{
	foreach (rumble_ability_trigger_rules($ability, 'on_defeat') as $rule) {
		foreach ((array)($rule['effects'] ?? []) as $effect) {
			if (!is_array($effect) || (string)($effect['kind'] ?? '') !== 'restore_health') {
				continue;
			}
			$formula = is_array($effect['formula'] ?? null) ? (array)$effect['formula'] : [];
			$value = rumble_runtime_formula_value($formula, []);
			if ($value === null) {
				continue;
			}

			$consumption = is_array($rule['consumption'] ?? null) ? (array)$rule['consumption'] : [];
			return [
				'restored_health' => max(0, (int)floor($value)),
				'priority' => (int)($rule['priority'] ?? 0),
				'remove_from_owned' => !empty($consumption['remove_from_owned']),
			];
		}
	}

	return null;
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

function rumble_apply_runtime_activation_effect(array $effect, int $ownerUserId, ?int $targetUserId, string $abilityId, array $activation, array &$untargetableByUser, array &$cannotAttackByUser, array &$blockedAttackTargetsByUser, array &$nimbleDodgeByUser, array &$focusedDefenseByUser, array &$activatedDefenseBonusByUser, array &$mineLayerDamageByUser, array &$schemingTargetByUser, array &$blockedDamageEnergyBonusRulesByUser, array &$effectPayload): void
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

	if ($kind === 'set_blocked_damage_energy_bonus') {
		$formula = is_array($effect['formula'] ?? null) ? (array)$effect['formula'] : [];
		$value = rumble_runtime_formula_value($formula, $activation);
		if ($value !== null && $value > 0) {
			$blockedDamageEnergyBonusRulesByUser[$ownerUserId][] = [
				'multiplier' => (float)$value,
				'source_ability_id' => $abilityId,
			];
			$effectPayload['blocked_damage_energy_multiplier'] = (float)$value;
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

