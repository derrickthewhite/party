import {
	activationArrayToMap,
	getOwnedAbilityDraftKey,
	normalizeAbilityActivationArray,
	normalizeAbilityActivationMap,
	normalizeAttacksMap,
	normalizeBidsMap,
} from './normalization.js';
import { isActivatedAbility } from './abilities.js';

export function isBiddingPhase(serverSnapshot) {
	return String(serverSnapshot && serverSnapshot.phaseMode ? serverSnapshot.phaseMode : '') === 'bidding';
}

export function isDraftDirty(serverSnapshot, localDraft) {
	return isBiddingPhase(serverSnapshot)
		? !!(localDraft && localDraft.dirtyBids)
		: !!(localDraft && (localDraft.dirtyAttacks || localDraft.dirtyAbilityActivations));
}

export function clearDraftDirty(localDraft) {
	if (!localDraft) {
		return;
	}

	localDraft.dirtyAttacks = false;
	localDraft.dirtyAbilityActivations = false;
	localDraft.dirtyBids = false;
}

export function getSelfPlayer(serverSnapshot) {
	const players = Array.isArray(serverSnapshot && serverSnapshot.players) ? serverSnapshot.players : [];
	const row = players.find(function eachPlayer(player) {
		return !!player.is_self;
	});
	return row || null;
}

export function getSelfOwnedAbilities(serverSnapshot) {
	const selfPlayer = getSelfPlayer(serverSnapshot);
	if (!selfPlayer || !Array.isArray(selfPlayer.owned_abilities)) {
		return [];
	}

	return selfPlayer.owned_abilities;
}

export function getCheatEligiblePlayers(serverSnapshot) {
	const players = Array.isArray(serverSnapshot && serverSnapshot.players) ? serverSnapshot.players : [];
	return players.filter(function eachPlayer(player) {
		return String(player.member_role || '').toLowerCase() !== 'observer';
	});
}

export function getSelectedCheatAbilityIds(localDraft) {
	return Object.keys(localDraft && localDraft.adminCheatSelections ? localDraft.adminCheatSelections : {}).filter(function eachAbilityId(abilityId) {
		return !!localDraft.adminCheatSelections[abilityId];
	}).sort();
}

export function getCheatTargetPlayer(serverSnapshot, localDraft) {
	const targetUserId = Number(localDraft && localDraft.adminCheatTargetUserId ? localDraft.adminCheatTargetUserId : 0);
	if (!targetUserId) {
		return null;
	}

	const players = Array.isArray(serverSnapshot && serverSnapshot.players) ? serverSnapshot.players : [];
	const row = players.find(function eachPlayer(player) {
		return Number(player.user_id) === targetUserId;
	});
	return row || null;
}

export function hasSubmittedOrder(serverSnapshot) {
	return !!(serverSnapshot && serverSnapshot.currentOrder);
}

export function hasSubmittedBids(serverSnapshot) {
	return !!serverSnapshot && serverSnapshot.currentBids !== null;
}

export function getEffectiveAttacks(serverSnapshot, localDraft, uiState) {
	if (hasSubmittedOrder(serverSnapshot) && !(uiState && uiState.isEditing)) {
		return normalizeAttacksMap(serverSnapshot.currentOrder.attacks || {});
	}

	return normalizeAttacksMap(localDraft && localDraft.attacks ? localDraft.attacks : {});
}

export function getEffectiveBids(serverSnapshot, localDraft, uiState) {
	if (hasSubmittedBids(serverSnapshot) && !(uiState && uiState.isEditing)) {
		return normalizeBidsMap(serverSnapshot.currentBids || {});
	}

	return normalizeBidsMap(localDraft && localDraft.bids ? localDraft.bids : {});
}

export function getEffectiveAbilityActivationMap(serverSnapshot, localDraft, uiState) {
	if (hasSubmittedOrder(serverSnapshot) && !(uiState && uiState.isEditing)) {
		const activations = serverSnapshot.currentOrder && Array.isArray(serverSnapshot.currentOrder.ability_activations)
			? serverSnapshot.currentOrder.ability_activations
			: [];
		return activationArrayToMap(activations);
	}

	return normalizeAbilityActivationMap(localDraft && localDraft.abilityActivations ? localDraft.abilityActivations : {});
}

export function getEffectiveAbilityActivationArray(serverSnapshot, localDraft, uiState) {
	const activationMap = getEffectiveAbilityActivationMap(serverSnapshot, localDraft, uiState);
	const activations = [];
	let orderIndex = 0;
	getSelfOwnedAbilities(serverSnapshot).forEach(function eachAbility(ability) {
		if (!isActivatedAbility(ability)) {
			return;
		}

		const abilityId = String(ability.id || '');
		const draftKey = getOwnedAbilityDraftKey(ability);
		const draft = activationMap[draftKey] || { is_enabled: false };
		if (draft.is_enabled === false) {
			return;
		}

		const activation = {
			ability_id: abilityId,
			client_order_index: orderIndex,
		};
		if (Object.prototype.hasOwnProperty.call(ability, 'ability_copy_index')) {
			activation.ability_copy_index = Math.max(1, Math.floor(Number(ability.ability_copy_index || 0)));
		}
		if (Object.prototype.hasOwnProperty.call(draft, 'target_user_id')) {
			activation.target_user_id = Math.max(1, Math.floor(Number(draft.target_user_id || 0)));
		}
		if (Object.prototype.hasOwnProperty.call(draft, 'x_cost')) {
			activation.x_cost = Math.max(0, Math.floor(Number(draft.x_cost || 0)));
		}
		if (Object.prototype.hasOwnProperty.call(draft, 'mode')) {
			activation.mode = String(draft.mode || '').trim();
		}
		if (Object.prototype.hasOwnProperty.call(draft, 'is_enabled')) {
			activation.is_enabled = draft.is_enabled !== false;
		}

		activations.push(activation);
		orderIndex += 1;
	});

	return normalizeAbilityActivationArray(activations);
}