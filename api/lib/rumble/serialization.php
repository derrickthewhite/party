<?php

// Serialization and owned-ability helpers for Rumble (migrated from rumble.php)

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

