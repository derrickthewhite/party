import { abilityCostFromDraft, getAbilityControlSpec, isActivatedAbility } from './abilities.js';
import {
	getOfferItemKey,
	getOwnedAbilityDraftKey,
	normalizeAbilityActivationArray,
	normalizeAttacksMap,
} from './normalization.js';

export function playerNameById(players, userId) {
	const targetId = Number(userId);
	const list = Array.isArray(players) ? players : [];
	const row = list.find(function eachPlayer(player) {
		return Number(player.user_id) === targetId;
	});
	return row
		? String(row.ship_name || row.username || ('User ' + targetId))
		: ('User ' + targetId);
}

export function describeOrder(order, players) {
	if (!order || typeof order !== 'object') {
		return 'No order';
	}

	const attacks = normalizeAttacksMap(order.attacks || {});
	const abilityActivations = normalizeAbilityActivationArray(order.ability_activations || []);
	const attackParts = Object.keys(attacks).sort(function sortNumeric(a, b) {
		return Number(a) - Number(b);
	}).map(function eachTarget(targetId) {
		return playerNameById(players, targetId) + ': ' + attacks[targetId];
	});
	const abilityParts = abilityActivations.map(function eachActivation(activation) {
		const parts = [String(activation.ability_id || 'ability')];
		if (Object.prototype.hasOwnProperty.call(activation, 'target_user_id')) {
			parts.push('target ' + playerNameById(players, activation.target_user_id));
		}
		if (Object.prototype.hasOwnProperty.call(activation, 'x_cost')) {
			parts.push('x ' + Math.max(0, Number(activation.x_cost || 0)));
		}
		return parts.join(' ');
	});

	const energyBudget = Math.max(0, Number(order.energy_budget || 0));
	const totalSpent = Math.max(0, Number(order.total_energy_spent || 0));
	const energyPart = energyBudget > 0
		? ' | Energy ' + totalSpent + '/' + energyBudget
		: '';

	if (attackParts.length === 0) {
		const abilityText = abilityParts.length > 0 ? ' | Abilities ' + abilityParts.join(', ') : ' | No abilities';
		return 'Defense ' + Number(order.defense || 0) + ' | No attacks' + abilityText + energyPart;
	}

	const abilityText = abilityParts.length > 0 ? ' | Abilities ' + abilityParts.join(', ') : ' | No abilities';
	return 'Defense ' + Number(order.defense || 0) + ' | Attacks ' + attackParts.join(', ') + abilityText + energyPart;
}

export function getAttackTotal(effectiveAttacks) {
	let total = 0;
	const source = effectiveAttacks && typeof effectiveAttacks === 'object' ? effectiveAttacks : {};
	Object.keys(source).forEach(function eachAttack(targetId) {
		const amount = Number(source[targetId] || 0);
		if (!Number.isFinite(amount)) {
			return;
		}

		total += Math.max(0, Math.floor(amount));
	});

	return Math.max(0, total);
}

export function getBidTotal(effectiveBids) {
	let total = 0;
	const source = effectiveBids && typeof effectiveBids === 'object' ? effectiveBids : {};
	Object.keys(source).forEach(function eachAbility(abilityId) {
		const amount = Number(source[abilityId] || 0);
		if (!Number.isFinite(amount)) {
			return;
		}

		total += Math.max(0, Math.floor(amount));
	});

	return total;
}

export function getDraftActivationSummary(options) {
	const config = options || {};
	if (config.hasSubmittedOrder && !config.isEditing && config.currentOrder) {
		return {
			ability_energy_spent: Math.max(0, Number(config.currentOrder.ability_energy_spent || 0)),
		};
	}

	let abilityEnergySpent = 0;
	const activationMap = config.activationMap && typeof config.activationMap === 'object' ? config.activationMap : {};
	const selfOwnedAbilities = Array.isArray(config.selfOwnedAbilities) ? config.selfOwnedAbilities : [];
	selfOwnedAbilities.forEach(function eachAbility(ability) {
		if (!isActivatedAbility(ability)) {
			return;
		}

		const draftKey = getOwnedAbilityDraftKey(ability);
		const draft = activationMap[draftKey] || { is_enabled: false };
		if (draft.is_enabled === false) {
			return;
		}

		abilityEnergySpent += abilityCostFromDraft(ability, draft);
	});

	return { ability_energy_spent: abilityEnergySpent };
}

export function getBidValidation(options) {
	const config = options || {};
	const offeredSet = {};
	const offeredAbilities = Array.isArray(config.offeredAbilities) ? config.offeredAbilities : [];
	offeredAbilities.forEach(function eachAbility(ability) {
		offeredSet[getOfferItemKey(ability)] = true;
	});

	const effectiveBids = config.effectiveBids && typeof config.effectiveBids === 'object' ? config.effectiveBids : {};
	const invalidAbilityIds = Object.keys(effectiveBids).filter(function eachId(abilityId) {
		return !offeredSet[abilityId];
	});

	return {
		totalBid: getBidTotal(effectiveBids),
		invalidAbilityIds,
	};
}

export function getOrderValidation(options) {
	const config = options || {};
	const selfPlayer = config.selfPlayer || null;
	if (!config.canAct) {
		return {
			defense: selfPlayer ? Number(selfPlayer.health || 0) : 0,
			baseDefense: selfPlayer ? Number(selfPlayer.health || 0) : 0,
			directDefenseBonus: 0,
			modifierNotes: [],
			energyBudget: 0,
			attackEnergySpent: 0,
			abilityEnergySpent: 0,
			totalEnergySpent: 0,
			remainingEnergy: 0,
			invalidDefense: false,
			invalidEnergy: false,
			invalidTargets: [],
			invalidAbilityTargets: [],
			missingAbilityTargets: [],
		};
	}

	if (config.hasSubmittedOrder && !config.isEditing) {
		const currentOrder = config.currentOrder || {};
		const energyBudget = Math.max(0, Number(currentOrder.energy_budget || 0));
		const attackEnergySpent = Math.max(0, Number(currentOrder.attack_energy_spent || 0));
		const abilityEnergySpent = Math.max(0, Number(currentOrder.ability_energy_spent || 0));
		const totalEnergySpent = Math.max(0, Number(currentOrder.total_energy_spent || 0)) || (attackEnergySpent + abilityEnergySpent);
		return {
			defense: Number(currentOrder.defense || 0),
			baseDefense: energyBudget - totalEnergySpent,
			directDefenseBonus: Math.max(0, Math.max(0, Number(currentOrder.defense || 0)) - (energyBudget - totalEnergySpent)),
			modifierNotes: [],
			energyBudget,
			attackEnergySpent,
			abilityEnergySpent,
			totalEnergySpent,
			remainingEnergy: energyBudget - totalEnergySpent,
			invalidDefense: false,
			invalidEnergy: false,
			invalidTargets: [],
			invalidAbilityTargets: [],
			missingAbilityTargets: [],
		};
	}

	const players = Array.isArray(config.players) ? config.players : [];
	const attackableTargets = {};
	const abilityTargetableTargets = {};
	players.forEach(function eachPlayer(player) {
		const key = String(Number(player.user_id));
		const isDefeated = !!player.is_defeated || Number(player.health || 0) <= 0;
		if (!player.is_self && !isDefeated && player.is_opponent_targetable !== false) {
			abilityTargetableTargets[key] = true;
		}
		if (!player.is_self && !isDefeated && player.can_be_attacked_by_self !== false) {
			attackableTargets[key] = true;
		}
	});

	const effectiveAttacks = config.effectiveAttacks && typeof config.effectiveAttacks === 'object' ? config.effectiveAttacks : {};
	const invalidTargets = Object.keys(effectiveAttacks).filter(function eachTarget(targetId) {
		return !attackableTargets[targetId];
	});

	const effectiveActivations = config.effectiveAbilityActivationMap && typeof config.effectiveAbilityActivationMap === 'object'
		? config.effectiveAbilityActivationMap
		: {};
	const invalidAbilityTargets = [];
	const missingAbilityTargets = [];
	const selfOwnedAbilities = Array.isArray(config.selfOwnedAbilities) ? config.selfOwnedAbilities : [];
	selfOwnedAbilities.forEach(function eachAbility(ability) {
		if (!isActivatedAbility(ability)) {
			return;
		}

		const abilityKey = getOwnedAbilityDraftKey(ability);
		const activation = effectiveActivations[abilityKey] || { is_enabled: false };
		if (activation.is_enabled === false) {
			return;
		}

		const controlSpec = getAbilityControlSpec(ability);
		if (!controlSpec.showTarget) {
			return;
		}

		if (!Object.prototype.hasOwnProperty.call(activation, 'target_user_id')) {
			if (controlSpec.targetRequired) {
				missingAbilityTargets.push(abilityKey);
			}
			return;
		}

		const targetKey = String(Math.max(0, Number(activation.target_user_id || 0)));
		if (!abilityTargetableTargets[targetKey]) {
			invalidAbilityTargets.push(abilityKey);
		}
	});

	const activationSummary = getDraftActivationSummary({
		hasSubmittedOrder: !!config.hasSubmittedOrder,
		isEditing: !!config.isEditing,
		currentOrder: config.currentOrder || null,
		activationMap: effectiveActivations,
		selfOwnedAbilities,
	});
	const attackEnergySpent = Math.max(0, getAttackTotal(effectiveAttacks));
	const abilityEnergySpent = Math.max(0, Number(activationSummary.ability_energy_spent || 0));
	const totalEnergySpent = attackEnergySpent + abilityEnergySpent;
	const ownedAbilityIds = selfOwnedAbilities.map(function eachAbility(ability) {
		return String(ability.id || '');
	});
	const energyBudget = Math.max(0, Number(selfPlayer ? selfPlayer.health || 0 : 0))
		+ (ownedAbilityIds.indexOf('turbo_generator') >= 0 ? 10 : 0);
	const baseDefense = energyBudget - totalEnergySpent;
	const defense = baseDefense;

	return {
		defense,
		baseDefense,
		directDefenseBonus: 0,
		modifierNotes: [],
		energyBudget,
		attackEnergySpent,
		abilityEnergySpent,
		totalEnergySpent,
		remainingEnergy: energyBudget - totalEnergySpent,
		invalidDefense: defense < 0,
		invalidEnergy: totalEnergySpent > energyBudget,
		invalidTargets,
		invalidAbilityTargets,
		missingAbilityTargets,
	};
}

export function describeActivationReadonly(ability, activationMap, players) {
	if (!isActivatedAbility(ability)) {
		const templateKind = String(ability.template_kind || 'passive');
		if (templateKind === 'triggered') {
			return 'Triggered ability. Resolves automatically when conditions are met.';
		}
		if (templateKind === 'condition') {
			return 'Condition tracker. Evaluated automatically by the round resolver.';
		}
		return 'Passive ability. Always applied automatically by the resolver.';
	}

	const abilityKey = getOwnedAbilityDraftKey(ability);
	const activation = activationMap && activationMap[abilityKey] ? activationMap[abilityKey] : null;
	if (!activation || activation.is_enabled === false) {
		return 'Not activated this round.';
	}

	const parts = ['Activated'];
	if (Object.prototype.hasOwnProperty.call(activation, 'target_user_id')) {
		parts.push('target: ' + playerNameById(players, activation.target_user_id));
	}
	if (Object.prototype.hasOwnProperty.call(activation, 'x_cost')) {
		parts.push('x: ' + Math.max(0, Number(activation.x_cost || 0)));
	}
	parts.push('cost: ' + abilityCostFromDraft(ability, activation));
	return parts.join(' | ');
}