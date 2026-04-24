<?php

declare(strict_types=1);

require_once __DIR__ . '/sql.php';

// Rumble module scaffolding: require per-area files. These are safe no-op
// stubs for now; implementations will be moved here incrementally.
require_once __DIR__ . '/rumble/ability_catalog.php';
require_once __DIR__ . '/rumble/runtime.php';
require_once __DIR__ . '/rumble/serialization.php';
require_once __DIR__ . '/rumble/admin.php';
require_once __DIR__ . '/rumble/db.php';
require_once __DIR__ . '/rumble/presentation.php';
require_once __DIR__ . '/rumble/actions.php';
require_once __DIR__ . '/rumble/resolver.php';

/**
 * Canonical phase-2 ability library for Rumble.
 *
 * Notes:
 * - This is intentionally data-driven to support future custom ability tooling.
 * - Effects are not fully executed yet; fields are structured for resolver expansion.
 */
// Ability catalog implementations moved to api/lib/rumble/ability_catalog.php

// Serialization helpers moved to api/lib/rumble/serialization.php

function rumble_ability_catalog_public_view(): array
{
    $catalog = [];
    foreach (rumble_ability_library() as $ability) {
        $catalog[] = rumble_ability_public_view($ability);
    }

    if (count($catalog) > 0) {
        $order = [
            'activated' => 0,
            'passive' => 1,
            'triggered' => 2,
        ];
        usort($catalog, static function (array $a, array $b) use ($order): int {
            $ka = (string)($a['template_kind'] ?? '');
            $kb = (string)($b['template_kind'] ?? '');
            $ia = $order[$ka] ?? 99;
            $ib = $order[$kb] ?? 99;
            if ($ia !== $ib) {
                return $ia <=> $ib;
            }
            $nameCmp = strcasecmp((string)($a['name'] ?? ''), (string)($b['name'] ?? ''));
            if ($nameCmp !== 0) {
                return $nameCmp;
            }
            return strcmp((string)($a['id'] ?? ''), (string)($b['id'] ?? ''));
        });
    }

    return $catalog;
}

// Admin implementations moved to api/lib/rumble/admin.php

function rumble_pick_random_abilities(int $count): array
{
    return rumble_pick_random_abilities_from_ids(array_keys(rumble_ability_library()), $count);
}

function rumble_pick_random_abilities_from_ids(array $ids, int $count): array
{
    $ids = array_values(array_filter($ids, static fn ($abilityId): bool => trim((string)$abilityId) !== ''));
    if ($count <= 0) {
        return [];
    }

    if (count($ids) === 0) {
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
            $resource = (string)($cost['resource'] ?? 'energy');
            if (!in_array($resource, ['energy', 'health'], true)) {
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
        return max(0, $totalCost + $healthBurn);
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

function rumble_attack_energy_cost(array $attacks, array $ownedAbilityIds = [], array $abilityActivations = []): int
{
    $totalAttack = 0;
    $positiveAttackSpends = [];
    foreach ($attacks as $amountRaw) {
        if (!is_int($amountRaw) && !ctype_digit((string)$amountRaw)) {
            continue;
        }

        $amount = max(0, (int)$amountRaw);
        if ($amount <= 0) {
            continue;
        }

        $totalAttack += $amount;
        $positiveAttackSpends[] = $amount;
    }

    if ($totalAttack <= 0 || count($positiveAttackSpends) < 2) {
        return $totalAttack;
    }

    $ownedAbilityMap = [];
    foreach ($ownedAbilityIds as $abilityId) {
        $canonicalAbilityId = rumble_canonical_ability_id((string)$abilityId);
        if ($canonicalAbilityId !== '') {
            $ownedAbilityMap[$canonicalAbilityId] = true;
        }
    }

    $secondLargestAttackIsFree = false;
    foreach ($abilityActivations as $activation) {
        $abilityId = rumble_canonical_ability_id((string)($activation['ability_id'] ?? ''));
        if ($abilityId === '' || (!empty($ownedAbilityMap) && !isset($ownedAbilityMap[$abilityId]))) {
            continue;
        }

        $ability = rumble_ability_by_id($abilityId);
        if ($ability === null) {
            continue;
        }

        $templateParams = rumble_ability_template_params($ability);
        $effectFormula = is_array($templateParams['effect_formula'] ?? null) ? (array)$templateParams['effect_formula'] : [];
        if ((string)($effectFormula['kind'] ?? '') === 'second_largest_attack_free') {
            $secondLargestAttackIsFree = true;
            break;
        }
    }

    if (!$secondLargestAttackIsFree) {
        return $totalAttack;
    }

    rsort($positiveAttackSpends, SORT_NUMERIC);
    return max(0, $totalAttack - (int)$positiveAttackSpends[1]);
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

// Presentation helpers moved to api/lib/rumble/presentation.php

function rumble_game_on_join(int $gameId, int $userId): void
{
    $stateStmt = db()->prepare(db_upsert_sql(
        'INSERT INTO rumble_player_state (game_id, user_id, current_health, starting_health) VALUES (:game_id, :user_id, 100, 100)',
        ['game_id', 'user_id'],
        [
            'current_health' => 'current_health',
            'starting_health' => 'starting_health',
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

function rumble_hyperspace_outside_winners(int $gameId, int $roundNumber, array $aliveRows): array
{
    if (count($aliveRows) <= 1) {
        return [];
    }

    $aliveByUserId = [];
    foreach ($aliveRows as $row) {
        $userId = (int)($row['user_id'] ?? 0);
        if ($userId > 0) {
            $aliveByUserId[$userId] = true;
        }
    }
    if (empty($aliveByUserId)) {
        return [];
    }

    $nextRoundEffects = rumble_fetch_round_start_effects($gameId, $roundNumber + 1);
    if (empty($nextRoundEffects)) {
        return [];
    }

    $inHyperspaceByUserId = [];
    foreach ($nextRoundEffects as $effectRow) {
        $ownerUserId = (int)($effectRow['owner_user_id'] ?? 0);
        if ($ownerUserId <= 0 || !isset($aliveByUserId[$ownerUserId])) {
            continue;
        }

        $targetUserId = isset($effectRow['target_user_id']) && $effectRow['target_user_id'] !== null
            ? (int)$effectRow['target_user_id']
            : null;
        $payload = json_decode((string)($effectRow['payload'] ?? '{}'), true);
        if (!is_array($payload)) {
            continue;
        }

        $state = rumble_runtime_state_from_payload($payload, $ownerUserId, $targetUserId);
        if (!is_array($state)) {
            continue;
        }

        if ((string)($state['state_key'] ?? '') === 'hyperspace_active') {
            $inHyperspaceByUserId[$ownerUserId] = true;
        }
    }

    if (empty($inHyperspaceByUserId)) {
        return [];
    }

    $outsideRows = [];
    foreach ($aliveRows as $row) {
        $userId = (int)($row['user_id'] ?? 0);
        if ($userId > 0 && empty($inHyperspaceByUserId[$userId])) {
            $outsideRows[] = $row;
        }
    }

    return count($outsideRows) === 1 ? $outsideRows : [];
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
    if (empty($winnerRows)) {
        $winnerRows = rumble_hyperspace_outside_winners($gameId, $roundNumber, $aliveRows);
    }
    if (empty($winnerRows) && count($aliveRows) === 1) {
        $winnerRows = [$aliveRows[0]];
    }

    return rumble_finalize_standings($pdo, $gameId, $roundNumber, $winnerRows);
}

// Presentation helpers moved to api/lib/rumble/presentation.php


// Shared state/offer helpers moved to api/lib/rumble/db.php and api/lib/rumble/actions.php

// Action request handlers moved to api/lib/rumble/actions.php

// Smaller action helpers moved to api/lib/rumble/actions.php

// Bidding and round resolvers moved to api/lib/rumble/resolver.php
