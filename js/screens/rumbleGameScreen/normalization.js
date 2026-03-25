export function childElements(node) {
	return Array.from(node && node.children ? node.children : []);
}

export function placeChildAt(parentNode, childNode, index) {
	if (!parentNode || !childNode) {
		return;
	}

	const existingAtIndex = childElements(parentNode)[index] || null;
	if (existingAtIndex === childNode) {
		return;
	}

	parentNode.insertBefore(childNode, existingAtIndex);
}

export function getOfferItemKey(ability) {
	const explicitKey = String(ability && ability.offer_item_key ? ability.offer_item_key : '').trim();
	if (explicitKey) {
		return explicitKey;
	}

	return String(ability && ability.id ? ability.id : '').trim();
}

export function getOwnedAbilityDraftKey(ability) {
	const explicitKey = String(ability && ability.owned_instance_key ? ability.owned_instance_key : '').trim();
	if (explicitKey) {
		return explicitKey;
	}

	const abilityId = String(ability && ability.id ? ability.id : '').trim();
	const copyIndex = Math.max(0, Number(ability && ability.ability_copy_index ? ability.ability_copy_index : 0));
	return copyIndex > 0 ? (abilityId + '__' + copyIndex) : abilityId;
}

export function getActivationDraftKey(activation) {
	const abilityId = String(activation && activation.ability_id ? activation.ability_id : '').trim();
	const copyIndex = Math.max(0, Number(activation && activation.ability_copy_index ? activation.ability_copy_index : 0));
	return copyIndex > 0 ? (abilityId + '__' + copyIndex) : abilityId;
}

export function normalizeAttacksMap(input) {
	const normalized = {};
	const source = input && typeof input === 'object' ? input : {};
	Object.keys(source).forEach(function eachKey(key) {
		if (!/^\d+$/.test(String(key))) {
			return;
		}

		const amount = Number(source[key]);
		if (!Number.isFinite(amount)) {
			return;
		}

		const integer = Math.max(0, Math.floor(amount));
		if (integer <= 0) {
			return;
		}

		normalized[String(Number(key))] = integer;
	});

	return normalized;
}

export function normalizeBidsMap(input) {
	const normalized = {};
	const source = input && typeof input === 'object' ? input : {};
	Object.keys(source).forEach(function eachKey(key) {
		if (!/^[a-z0-9_]+$/i.test(String(key))) {
			return;
		}

		const amount = Number(source[key]);
		if (!Number.isFinite(amount)) {
			return;
		}

		const integer = Math.max(0, Math.floor(amount));
		if (integer <= 0) {
			return;
		}

		normalized[String(key)] = integer;
	});

	return normalized;
}

export function normalizeAbilityActivationMap(input) {
	const normalized = {};
	const source = input && typeof input === 'object' ? input : {};
	Object.keys(source).forEach(function eachKey(key) {
		if (!/^[a-z0-9_]+$/i.test(String(key))) {
			return;
		}

		const item = source[key];
		if (!item || typeof item !== 'object') {
			return;
		}

		const next = {};
		if (Object.prototype.hasOwnProperty.call(item, 'ability_copy_index')) {
			const copyIndex = Number(item.ability_copy_index);
			if (Number.isFinite(copyIndex) && copyIndex > 0) {
				next.ability_copy_index = Math.floor(copyIndex);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'target_user_id')) {
			const target = Number(item.target_user_id);
			if (Number.isFinite(target) && target > 0) {
				next.target_user_id = Math.floor(target);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'x_cost')) {
			const xCost = Number(item.x_cost);
			if (Number.isFinite(xCost) && xCost >= 0) {
				next.x_cost = Math.floor(xCost);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'mode')) {
			const mode = String(item.mode || '').trim();
			if (mode) {
				next.mode = mode.slice(0, 40);
			}
		}

		next.is_enabled = item.is_enabled !== false;
		normalized[String(key)] = next;
	});

	return normalized;
}

export function normalizeAbilityActivationArray(input) {
	if (!Array.isArray(input)) {
		return [];
	}

	const normalized = [];
	input.forEach(function eachActivation(item, index) {
		if (!item || typeof item !== 'object') {
			return;
		}

		const abilityId = String(item.ability_id || '').trim();
		if (!abilityId) {
			return;
		}

		const normalizedEntry = {
			ability_id: abilityId,
			client_order_index: Math.max(0, Number.isFinite(Number(item.client_order_index))
				? Math.floor(Number(item.client_order_index))
				: index),
		};

		if (Object.prototype.hasOwnProperty.call(item, 'ability_copy_index')) {
			const copyIndex = Number(item.ability_copy_index);
			if (Number.isFinite(copyIndex) && copyIndex > 0) {
				normalizedEntry.ability_copy_index = Math.floor(copyIndex);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'target_user_id')) {
			const target = Number(item.target_user_id);
			if (Number.isFinite(target) && target > 0) {
				normalizedEntry.target_user_id = Math.floor(target);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'x_cost')) {
			const xCost = Number(item.x_cost);
			if (Number.isFinite(xCost) && xCost >= 0) {
				normalizedEntry.x_cost = Math.floor(xCost);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'mode')) {
			const mode = String(item.mode || '').trim();
			if (mode) {
				normalizedEntry.mode = mode.slice(0, 40);
			}
		}

		if (Object.prototype.hasOwnProperty.call(item, 'is_enabled')) {
			normalizedEntry.is_enabled = !!item.is_enabled;
		}

		normalized.push(normalizedEntry);
	});

	normalized.sort(function sortActivations(a, b) {
		if (a.client_order_index !== b.client_order_index) {
			return a.client_order_index - b.client_order_index;
		}

		const abilityCompare = String(a.ability_id).localeCompare(String(b.ability_id));
		if (abilityCompare !== 0) {
			return abilityCompare;
		}

		return Math.max(0, Number(a.ability_copy_index || 0)) - Math.max(0, Number(b.ability_copy_index || 0));
	});

	return normalized;
}

export function activationArrayToMap(activations) {
	const mapped = {};
	normalizeAbilityActivationArray(activations).forEach(function eachActivation(entry) {
		mapped[getActivationDraftKey(entry)] = {
			ability_copy_index: Object.prototype.hasOwnProperty.call(entry, 'ability_copy_index') ? entry.ability_copy_index : undefined,
			target_user_id: Object.prototype.hasOwnProperty.call(entry, 'target_user_id') ? entry.target_user_id : undefined,
			x_cost: Object.prototype.hasOwnProperty.call(entry, 'x_cost') ? entry.x_cost : undefined,
			mode: Object.prototype.hasOwnProperty.call(entry, 'mode') ? entry.mode : undefined,
			is_enabled: Object.prototype.hasOwnProperty.call(entry, 'is_enabled') ? !!entry.is_enabled : true,
		};
	});

	return normalizeAbilityActivationMap(mapped);
}