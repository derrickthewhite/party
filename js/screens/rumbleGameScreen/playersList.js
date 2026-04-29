import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { getRumbleSummaryIcon } from '../../gameStateIcons.js';
import { setPlayerIconImage } from '../../playerIcons.js';
import { normalizeAttacksMap, placeChildAt } from './normalization.js';

const PLAYERS_LIST_SECTION_HTML = `
	<div>
		<p data-ref="attackHelpText" style="margin: 4px 0 8px 0;">Attack allocations (enter power to send at each target):</p>
		<p data-ref="orderValidationText" style="margin: 0 0 8px 0; font-weight: 600;"></p>
		<div class="list" data-ref="playersList"></div>
	</div>
`;

const PLAYER_ROW_TEMPLATE_HTML = `
	<div class="rumble-player-row" style="margin-bottom: 6px;">
		<div class="rumble-player-identity">
			<img class="player-icon rumble-player-row-icon" data-ref="icon" alt="">
			<div style="flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0;">
				<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
					<div class="rumble-player-name" data-ref="name"></div>
					<small data-ref="abilities" style="opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;"></small>
				</div>
				<small data-ref="conditions" style="opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;"></small>
				<div class="rumble-round-report" data-ref="report"></div>
			</div>
		</div>
		<div class="rumble-player-controls" data-ref="right">
			<div data-ref="label" style="line-height: 1.2;"></div>
			<input type="number" min="0" step="1" placeholder="Attack amount" data-ref="input">
		</div>
	</div>
`;

function toWholeNumber(value) {
	return Math.max(0, Math.floor(Number(value || 0)));
}

function fallbackAbilityName(abilityId) {
	return String(abilityId || 'Unknown')
		.split('_')
		.filter(Boolean)
		.map(function eachWord(part) {
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(' ');
}

function buildAbilityNameById(abilityCatalog) {
	const names = new Map();
	(Array.isArray(abilityCatalog) ? abilityCatalog : []).forEach(function eachAbility(ability) {
		const abilityId = String(ability && ability.id ? ability.id : '').trim();
		if (!abilityId) {
			return;
		}

		const label = String(ability && (ability.title || ability.name) ? (ability.title || ability.name) : '').trim();
		names.set(abilityId, label || fallbackAbilityName(abilityId));
	});
	return names;
}

function buildAbilityById(abilityCatalog) {
	const abilities = new Map();
	(Array.isArray(abilityCatalog) ? abilityCatalog : []).forEach(function eachAbility(ability) {
		const abilityId = String(ability && ability.id ? ability.id : '').trim();
		if (!abilityId) {
			return;
		}

		abilities.set(abilityId, ability);
	});
	return abilities;
}

function getAbilityName(abilityNameById, abilityId) {
	const key = String(abilityId || '').trim();
	return abilityNameById.get(key) || fallbackAbilityName(key);
}

function getPlayerDisplayName(player) {
	return String(player && (player.ship_name || player.username) ? (player.ship_name || player.username) : 'Unknown');
}

function buildPlayerNameById(players) {
	const names = new Map();
	(Array.isArray(players) ? players : []).forEach(function eachPlayer(player) {
		names.set(String(Number(player.user_id)), getPlayerDisplayName(player));
	});
	return names;
}

function ensureSummary(summaryByUser, userId) {
	const key = String(Number(userId));
	if (summaryByUser.has(key)) {
		return summaryByUser.get(key);
	}

	const summary = {
		startEnergy: 0,
		startHealth: 0,
		attackEnergySpent: 0,
		abilityEnergySpent: 0,
		defense: 0,
		incomingTotal: 0,
		damageTaken: 0,
		burn: 0,
		healing: 0,
		endHealth: null,
		outgoingTargets: [],
		incomingSources: [],
		abilityActivations: [],
		healingSources: [],
		hasData: false,
	};
	summaryByUser.set(key, summary);
	return summary;
}

function pushIncomingSource(summaryByUser, targetUserId, source) {
	const targetId = Number(targetUserId);
	if (targetId <= 0 || !source || toWholeNumber(source.amount) <= 0) {
		return;
	}

	const summary = ensureSummary(summaryByUser, targetId);
	summary.hasData = true;
	summary.incomingSources.push({
		label: String(source.label || 'Unknown'),
		amount: toWholeNumber(source.amount),
	});
}

function buildPreviousRoundSummaryMap(context) {
	const summaryByUser = new Map();
	const players = Array.isArray(context.serverSnapshot.players) ? context.serverSnapshot.players : [];
	const playerNameById = buildPlayerNameById(players);
	const abilityNameById = buildAbilityNameById(context.serverSnapshot.abilityCatalog);
	const previousOrders = Array.isArray(context.serverSnapshot.previousRoundOrders) ? context.serverSnapshot.previousRoundOrders : [];
	const previousEvents = Array.isArray(context.serverSnapshot.previousRoundEventLog) ? context.serverSnapshot.previousRoundEventLog : [];

	previousOrders.forEach(function eachOrder(order) {
		const userId = Number(order && order.user_id ? order.user_id : 0);
		if (userId <= 0) {
			return;
		}

		const summary = ensureSummary(summaryByUser, userId);
		summary.hasData = true;
		summary.defense = toWholeNumber(order.defense);

		const attacks = normalizeAttacksMap(order && order.attacks ? order.attacks : {});
		Object.keys(attacks).sort(function sortTargets(left, right) {
			return Number(left) - Number(right);
		}).forEach(function eachTarget(targetKey) {
			const amount = toWholeNumber(attacks[targetKey]);
			if (amount <= 0) {
				return;
			}

			const targetId = Number(targetKey);
			const targetLabel = playerNameById.get(String(targetId)) || ('User ' + String(targetId));
			summary.outgoingTargets.push({
				label: targetLabel,
				amount,
			});
			pushIncomingSource(summaryByUser, targetId, {
				label: (playerNameById.get(String(userId)) || ('User ' + String(userId))) + ' attack',
				amount,
			});
		});
	});

	previousEvents.forEach(function eachEvent(event) {
		const ownerUserId = Number(event && event.owner_user_id ? event.owner_user_id : 0);
		const targetUserId = Number(event && event.target_user_id ? event.target_user_id : 0);
		const effectKey = String(event && event.effect_key ? event.effect_key : '');
		const payload = event && event.payload && typeof event.payload === 'object' ? event.payload : {};

		if (ownerUserId > 0) {
			const summary = ensureSummary(summaryByUser, ownerUserId);
			summary.hasData = true;

			if (effectKey === 'step1:set_round_stats') {
				summary.startEnergy = toWholeNumber(payload.energy_budget);
				summary.startHealth = toWholeNumber(payload.health);
				return;
			}

			if (effectKey === 'step4:energy_summary') {
				summary.attackEnergySpent = toWholeNumber(payload.attack_energy_spent);
				summary.abilityEnergySpent = toWholeNumber(payload.ability_energy_spent);
				return;
			}

			if (effectKey === 'step2:passive_round_start_heal') {
				const amount = toWholeNumber(payload.amount);
				if (amount > 0) {
					summary.healing += amount;
					summary.healingSources.push({
						label: getAbilityName(abilityNameById, payload.source_ability_id),
						amount,
					});
				}
				return;
			}

			if (effectKey === 'step6:damage_resolution') {
				summary.incomingTotal = toWholeNumber(payload.normal_incoming)
					+ toWholeNumber(payload.defense_only_incoming)
					+ toWholeNumber(payload.unblockable_incoming);
				summary.damageTaken = toWholeNumber(payload.final_damage);
				summary.endHealth = toWholeNumber(payload.next_health);
				return;
			}

			if (effectKey === 'step7:upkeep_cost') {
				summary.burn += toWholeNumber(payload.health_loss);
				if (typeof summary.endHealth === 'number') {
					summary.endHealth = Math.max(0, summary.endHealth - toWholeNumber(payload.health_loss));
				}
				return;
			}

			if (effectKey === 'trigger:on_defeat_restore') {
				const restoredHealth = toWholeNumber(payload.restored_health);
				if (restoredHealth > 0) {
					summary.healing += restoredHealth;
					summary.healingSources.push({
						label: getAbilityName(abilityNameById, payload.source_ability_id),
						amount: restoredHealth,
					});
				}
				summary.endHealth = toWholeNumber(payload.restored_health);
				return;
			}

			if (effectKey.indexOf('activation:') === 0) {
				const abilityId = String(payload.ability_id || effectKey.slice('activation:'.length));
				const activationEntry = {
					label: getAbilityName(abilityNameById, abilityId),
					cost: toWholeNumber(payload.cost),
					healthBurn: toWholeNumber(payload.health_burn),
					healing: toWholeNumber(payload.healing),
					targetLabel: targetUserId > 0 ? (playerNameById.get(String(targetUserId)) || ('User ' + String(targetUserId))) : '',
					mode: String(payload.mode || '').trim(),
				};
				summary.abilityActivations.push(activationEntry);
				summary.burn += activationEntry.healthBurn;
				if (activationEntry.healing > 0) {
					summary.healing += activationEntry.healing;
					summary.healingSources.push({
						label: activationEntry.label,
						amount: activationEntry.healing,
					});
				}

				const appliedDamage = toWholeNumber(payload.applied_damage);
				if (targetUserId > 0 && appliedDamage > 0) {
					pushIncomingSource(summaryByUser, targetUserId, {
						label: (playerNameById.get(String(ownerUserId)) || ('User ' + String(ownerUserId))) + ' ' + activationEntry.label,
						amount: appliedDamage,
					});
				}

				const appliedDamageEach = toWholeNumber(payload.applied_damage_each);
				if (appliedDamageEach > 0) {
					players.forEach(function eachTargetPlayer(player) {
						const candidateId = Number(player && player.user_id ? player.user_id : 0);
						if (candidateId <= 0 || candidateId === ownerUserId) {
							return;
						}

						pushIncomingSource(summaryByUser, candidateId, {
							label: (playerNameById.get(String(ownerUserId)) || ('User ' + String(ownerUserId))) + ' ' + activationEntry.label,
							amount: appliedDamageEach,
						});
					});
				}
			}
		}

		if (effectKey === 'step2:scheduled_attack' && targetUserId > 0) {
			pushIncomingSource(summaryByUser, targetUserId, {
				label: (playerNameById.get(String(ownerUserId)) || ('User ' + String(ownerUserId))) + ' ' + getAbilityName(abilityNameById, payload.source_ability_id),
				amount: toWholeNumber(payload.damage),
			});
		}
	});

	return summaryByUser;
}

function formatOutgoingTargetsTitle(summary) {
	if (!summary || summary.outgoingTargets.length === 0) {
		return 'No attacks';
	}

	const totalOutgoing = summary.outgoingTargets.reduce(function addTotal(total, target) {
		return total + toWholeNumber(target.amount);
	}, 0);
	const lines = ['Targets'];
	summary.outgoingTargets.forEach(function eachTarget(target) {
		lines.push(target.label + ': ' + toWholeNumber(target.amount));
	});
	if (totalOutgoing !== toWholeNumber(summary.attackEnergySpent)) {
		lines.push('Total outgoing attack power: ' + totalOutgoing);
	}
	return lines.join('\n');
}

function formatAbilityActivationsTitle(summary) {
	if (!summary || summary.abilityActivations.length === 0) {
		return 'No ability costs';
	}

	const lines = ['Abilities'];
	summary.abilityActivations.forEach(function eachActivation(activation) {
		const parts = [activation.label];
		if (activation.targetLabel) {
			parts.push('on ' + activation.targetLabel);
		}
		parts.push('cost ' + toWholeNumber(activation.cost));
		if (activation.healthBurn > 0) {
			parts.push('burn ' + activation.healthBurn);
		}
		if (activation.healing > 0) {
			parts.push('heal ' + activation.healing);
		}
		if (activation.mode) {
			parts.push(activation.mode);
		}
		lines.push(parts.join(' | '));
	});
	return lines.join('\n');
}

function formatHealingSourcesTitle(summary) {
	if (!summary || summary.healingSources.length === 0) {
		return 'No healing';
	}

	const lines = ['Healing'];
	summary.healingSources.forEach(function eachSource(source) {
		lines.push(source.label + ': ' + toWholeNumber(source.amount));
	});
	return lines.join('\n');
}

function formatIncomingSourcesTitle(summary) {
	if (!summary || summary.incomingSources.length === 0) {
		return 'No incoming attacks';
	}

	const totalListed = summary.incomingSources.reduce(function addTotal(total, source) {
		return total + toWholeNumber(source.amount);
	}, 0);
	const lines = ['Incoming'];
	summary.incomingSources.forEach(function eachSource(source) {
		lines.push(source.label + ': ' + toWholeNumber(source.amount));
	});
	if (toWholeNumber(summary.incomingTotal) > totalListed) {
		lines.push('Other effects: ' + (toWholeNumber(summary.incomingTotal) - totalListed));
		lines.push('Incoming total is after round modifiers and prevention.');
		return lines.join('\n');
	}
	if (toWholeNumber(summary.incomingTotal) !== totalListed) {
		lines.push('Incoming total is after round modifiers and prevention.');
	}
	return lines.join('\n');
}

function setSummaryIconNode(node, kind) {
	if (!node) {
		return;
	}

	const icon = getRumbleSummaryIcon(kind);
	if (!icon || !icon.url) {
		node.style.display = 'none';
		node.dataset.iconId = '';
		node.removeAttribute('src');
		node.alt = '';
		node.title = '';
		return;
	}

	const iconId = icon.group + ':' + icon.key;
	if (node.dataset.iconId !== iconId) {
		node.src = icon.url;
		node.dataset.iconId = iconId;
	}

	node.alt = '';
	node.title = '';
	node.setAttribute('aria-hidden', 'true');
	node.style.display = '';
}

function createSummarySegment(kind) {
	const root = document.createElement('span');
	root.className = 'rumble-round-report-segment';

	const icon = document.createElement('img');
	icon.className = 'rumble-round-report-icon';
	setSummaryIconNode(icon, kind);

	const value = document.createElement('span');
	value.className = 'rumble-round-report-value';

	root.appendChild(icon);
	root.appendChild(value);

	return {
		root,
		value,
	};
}

function syncSummarySegment(segment, value, title) {
	segment.root.style.display = '';
	segment.value.textContent = String(toWholeNumber(value));
	segment.root.title = title || '';
	segment.root.classList.toggle('has-title', !!title);
}

function hideSummarySegment(segment) {
	segment.root.style.display = 'none';
	segment.root.title = '';
	segment.root.classList.remove('has-title');
}

function reconcileRoundSummary(rowRefs, summary) {
	if (!summary || !summary.hasData) {
		rowRefs.report.style.display = 'none';
		return;
	}

	rowRefs.report.style.display = '';
	syncSummarySegment(rowRefs.reportStartEnergy, summary.startEnergy, 'Round start energy');
	syncSummarySegment(rowRefs.reportStartHealth, summary.startHealth, 'Round start health');
	syncSummarySegment(rowRefs.reportAttackSpend, summary.attackEnergySpent, formatOutgoingTargetsTitle(summary));
	syncSummarySegment(rowRefs.reportAbilitySpend, summary.abilityEnergySpent, formatAbilityActivationsTitle(summary));
	syncSummarySegment(rowRefs.reportDefense, summary.defense, 'Reserved defense');
	syncSummarySegment(rowRefs.reportIncoming, summary.incomingTotal, formatIncomingSourcesTitle(summary));
	syncSummarySegment(rowRefs.reportDamage, summary.damageTaken, 'Damage that got through');
	if (summary.burn > 0) {
		syncSummarySegment(rowRefs.reportBurn, summary.burn, 'Health burn and upkeep costs');
	} else {
		hideSummarySegment(rowRefs.reportBurn);
	}
	if (summary.healing > 0) {
		syncSummarySegment(rowRefs.reportHealing, summary.healing, formatHealingSourcesTitle(summary));
	} else {
		hideSummarySegment(rowRefs.reportHealing);
	}
	syncSummarySegment(rowRefs.reportEndHealth, typeof summary.endHealth === 'number' ? summary.endHealth : summary.startHealth, 'Health after last round');
}

function createArrowSeparator() {
	const root = document.createElement('span');
	root.className = 'rumble-round-report-arrow';
	const icon = document.createElement('img');
	icon.className = 'rumble-round-report-icon rumble-round-report-arrow-icon';
	setSummaryIconNode(icon, 'arrow');
	root.appendChild(icon);
	return root;
}

function ensureChipButton(chipMap, chipId, extraClassName) {
	let badge = chipMap.get(chipId);
	if (badge) {
		return badge;
	}

	badge = document.createElement('button');
	badge.type = 'button';
	badge.className = extraClassName ? ('ability-chip-button ' + extraClassName) : 'ability-chip-button';
	badge.style.padding = '1px 6px';
	badge.style.border = '1px solid rgba(0, 0, 0, 0.2)';
	badge.style.borderRadius = '999px';
	chipMap.set(chipId, badge);
	return badge;
}

function reconcileOwnedAbilities(refs, ownedAbilities, showAbilityInfoModal) {
	const list = Array.isArray(ownedAbilities) ? ownedAbilities : [];
	if (list.length === 0) {
		refs.abilities.style.display = 'none';
		refs.abilities.textContent = '';
		refs.abilities.title = '';
		refs.abilityBadgeById.clear();
		return;
	}

	refs.abilities.style.display = '';
	refs.abilities.title = '';

	const grouped = {};
	list.forEach(function eachAbility(ability, index) {
		const abilityId = String(ability && ability.id ? ability.id : ('ability_' + String(index)));
		if (!grouped[abilityId]) {
			grouped[abilityId] = {
				ability,
				count: 0,
			};
		}
		grouped[abilityId].count += 1;
	});

	const activeIds = new Set();
	Object.keys(grouped).sort().forEach(function eachAbilityId(abilityId, index) {
		const groupedEntry = grouped[abilityId];
		const ability = groupedEntry.ability;
		activeIds.add(abilityId);

			const badge = ensureChipButton(refs.abilityBadgeById, abilityId, '');

		const abilityName = String(ability && (ability.title || ability.name) ? (ability.title || ability.name) : 'Unknown');
		const description = String(ability && ability.description ? ability.description : 'No description available.');
		badge.textContent = groupedEntry.count > 1 ? (abilityName + ' x' + groupedEntry.count) : abilityName;
		badge.title = abilityName + ': ' + description + (groupedEntry.count > 1 ? ' (owned ' + groupedEntry.count + ' copies)' : '');
		badge.onclick = function onAbilityClick() {
			showAbilityInfoModal(ability);
		};
		placeChildAt(refs.abilities, badge, index);
	});

	Array.from(refs.abilityBadgeById.keys()).forEach(function eachExisting(abilityId) {
		if (activeIds.has(abilityId)) {
			return;
		}

		const badge = refs.abilityBadgeById.get(abilityId);
		if (badge && badge.parentNode === refs.abilities) {
			refs.abilities.removeChild(badge);
		}
		refs.abilityBadgeById.delete(abilityId);
	});
}

function reconcileActiveConditions(refs, activeConditions, abilityById, showAbilityInfoModal) {
	const list = Array.isArray(activeConditions) ? activeConditions : [];
	if (list.length === 0) {
		refs.conditions.style.display = 'none';
		refs.conditions.textContent = '';
		refs.conditions.title = '';
		refs.conditionBadgeById.clear();
		return;
	}

	refs.conditions.style.display = '';
	refs.conditions.title = '';

	const activeIds = new Set();
	list.forEach(function eachCondition(condition, index) {
		const conditionId = String(condition && condition.id ? condition.id : ('condition_' + String(index)));
		activeIds.add(conditionId);
		const badge = ensureChipButton(refs.conditionBadgeById, conditionId, 'condition-chip-button');
		const label = String(condition && condition.label ? condition.label : 'Condition');
		const description = String(condition && condition.description ? condition.description : '');
		const sourceAbilityId = String(condition && condition.source_ability_id ? condition.source_ability_id : '').trim();
		const sourceAbility = sourceAbilityId ? abilityById.get(sourceAbilityId) : null;

		badge.textContent = label;
		badge.title = description || label;
		badge.onclick = sourceAbility
			? function onConditionClick() {
				showAbilityInfoModal(sourceAbility);
			}
			: null;
		placeChildAt(refs.conditions, badge, index);
	});

	Array.from(refs.conditionBadgeById.keys()).forEach(function eachExisting(conditionId) {
		if (activeIds.has(conditionId)) {
			return;
		}

		const badge = refs.conditionBadgeById.get(conditionId);
		if (badge && badge.parentNode === refs.conditions) {
			refs.conditions.removeChild(badge);
		}
		refs.conditionBadgeById.delete(conditionId);
	});
}

export function createPlayersListController(context) {
	const root = createNodeFromHtml(PLAYERS_LIST_SECTION_HTML);
	const refs = collectRefs(root);
	const playerRowTemplate = createTemplate(PLAYER_ROW_TEMPLATE_HTML);
	const playerRowsById = new Map();

	function ensurePlayerRow(player) {
		const key = String(Number(player.user_id));
		if (playerRowsById.has(key)) {
			return playerRowsById.get(key);
		}

		const row = cloneTemplateNode(playerRowTemplate);
		const rowRefs = collectRefs(row);
		const nextRefs = {
			row,
			icon: rowRefs.icon,
			name: rowRefs.name,
			abilities: rowRefs.abilities,
			conditions: rowRefs.conditions,
			report: rowRefs.report,
			right: rowRefs.right,
			label: rowRefs.label,
			input: rowRefs.input,
			abilityBadgeById: new Map(),
			conditionBadgeById: new Map(),
			reportStartEnergy: createSummarySegment('energy'),
			reportStartHealth: createSummarySegment('health'),
			reportAttackSpend: createSummarySegment('attack'),
			reportAbilitySpend: createSummarySegment('abilities'),
			reportDefense: createSummarySegment('defense'),
			reportIncoming: createSummarySegment('incoming'),
			reportDamage: createSummarySegment('damage'),
			reportBurn: createSummarySegment('burn'),
			reportHealing: createSummarySegment('heal'),
			reportEndHealth: createSummarySegment('health'),
		};
		const reportArrowOne = createArrowSeparator();
		const reportArrowTwo = createArrowSeparator();
		rowRefs.report.appendChild(nextRefs.reportStartEnergy.root);
		rowRefs.report.appendChild(nextRefs.reportStartHealth.root);
		rowRefs.report.appendChild(reportArrowOne);
		rowRefs.report.appendChild(nextRefs.reportAttackSpend.root);
		rowRefs.report.appendChild(nextRefs.reportAbilitySpend.root);
		rowRefs.report.appendChild(nextRefs.reportDefense.root);
		rowRefs.report.appendChild(reportArrowTwo);
		rowRefs.report.appendChild(nextRefs.reportIncoming.root);
		rowRefs.report.appendChild(nextRefs.reportDamage.root);
		rowRefs.report.appendChild(nextRefs.reportBurn.root);
		rowRefs.report.appendChild(nextRefs.reportHealing.root);
		rowRefs.report.appendChild(nextRefs.reportEndHealth.root);
		rowRefs.input.addEventListener('input', function onInput() {
			const raw = Number(rowRefs.input.value || 0);
			context.localDraft.attacks[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			context.localDraft.dirtyAttacks = true;
			context.reconcileUi();
		});

		refs.playersList.appendChild(row);
		playerRowsById.set(key, nextRefs);
		return nextRefs;
	}

	function reconcile() {
		const validation = context.getOrderValidation();
		const selfPlayer = context.getSelfPlayer();
		const selfCannotAttack = !!(selfPlayer && selfPlayer.cannot_attack);
		if (!selfPlayer) {
			refs.orderValidationText.textContent = '';
			refs.orderValidationText.style.color = '';
		} else if (validation.invalidDefense) {
			refs.orderValidationText.textContent = 'Orders are invalid: total attacks exceed your available power.';
			refs.orderValidationText.style.color = '#b42318';
		} else if (validation.invalidTargets.length > 0) {
			refs.orderValidationText.textContent = 'Orders are invalid: remove attacks assigned to defeated or unavailable players.';
			refs.orderValidationText.style.color = '#b42318';
		} else {
			refs.orderValidationText.textContent = '';
			refs.orderValidationText.style.color = '';
		}

		let focusedAttackKey = null;
		let selectionStart = null;
		let selectionEnd = null;
		const activeEl = document.activeElement;
		if (activeEl && activeEl.tagName === 'INPUT') {
			Array.from(playerRowsById.entries()).forEach(function eachEntry(entry) {
				const key = entry[0];
				const rowRefs = entry[1];
				if (rowRefs.input === activeEl) {
					focusedAttackKey = key;
					selectionStart = rowRefs.input.selectionStart;
					selectionEnd = rowRefs.input.selectionEnd;
				}
			});
		}

		const active = new Set();
		const submittedAttacks = normalizeAttacksMap(context.serverSnapshot.currentOrder && context.serverSnapshot.currentOrder.attacks ? context.serverSnapshot.currentOrder.attacks : {});
		const editableAttacks = normalizeAttacksMap(context.localDraft.attacks || {});
		const previousRoundSummaryByUser = buildPreviousRoundSummaryMap(context);
		const abilityById = buildAbilityById(context.serverSnapshot.abilityCatalog);

		context.serverSnapshot.players.forEach(function eachPlayer(player) {
			const key = String(Number(player.user_id));
			active.add(key);
			const rowRefs = ensurePlayerRow(player);
			const isDefeated = !!player.is_defeated || Number(player.health || 0) <= 0;

			const displayShipName = getPlayerDisplayName(player);
			setPlayerIconImage(rowRefs.icon, player && player.icon_key ? player.icon_key : null, player && player.username ? player.username : displayShipName);
			rowRefs.icon.setAttribute('alt', displayShipName);
			rowRefs.name.textContent = displayShipName + ' | Health: ' + Math.max(0, Number(player.health || 0));
			rowRefs.row.classList.toggle('is-defeated', isDefeated);
			const ownedAbilities = Array.isArray(player.owned_abilities) ? player.owned_abilities : [];
			const activeConditions = Array.isArray(player.active_conditions) ? player.active_conditions : [];
			reconcileOwnedAbilities(rowRefs, ownedAbilities, context.showAbilityInfoModal);
			reconcileActiveConditions(rowRefs, activeConditions, abilityById, context.showAbilityInfoModal);
			reconcileRoundSummary(rowRefs, previousRoundSummaryByUser.get(key) || null);
			placeChildAt(refs.playersList, rowRefs.row, active.size - 1);

			if (player.is_self) {
				rowRefs.label.textContent = isDefeated ? 'Defeated' : 'You';
				rowRefs.label.style.display = '';
				rowRefs.input.style.display = 'none';
				return;
			}

			if (isDefeated) {
				rowRefs.label.textContent = 'Defeated';
				rowRefs.label.style.display = '';
				rowRefs.input.style.display = 'none';
				return;
			}

			if (!context.getLastPerms().can_act) {
				rowRefs.label.textContent = 'Active';
				rowRefs.label.style.display = '';
				rowRefs.input.style.display = 'none';
				return;
			}

			if (selfCannotAttack || player.can_be_attacked_by_self === false) {
				rowRefs.label.textContent = 'Unavailable this round';
				rowRefs.label.style.display = '';
				rowRefs.input.style.display = 'none';
				return;
			}

			if (context.hasSubmittedOrder() && !context.uiState.isEditing) {
				const submittedAmount = Number(submittedAttacks[key] || 0);
				rowRefs.label.textContent = 'Attack: ' + Math.max(0, Math.floor(submittedAmount));
				rowRefs.label.style.display = '';
				rowRefs.input.style.display = 'none';
				return;
			}

			rowRefs.label.style.display = 'none';
			rowRefs.input.style.display = '';
			const nextValue = String(Math.max(0, Number(editableAttacks[key] || 0)));
			const isFocused = focusedAttackKey === key && document.activeElement === rowRefs.input;
			if (!isFocused && rowRefs.input.value !== nextValue) {
				rowRefs.input.value = nextValue;
			}
			rowRefs.input.disabled = !context.getLastPerms().can_act || context.isOrderBusy();
		});

		Array.from(playerRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = playerRowsById.get(key);
			if (rowRefs && rowRefs.row.parentNode === refs.playersList) {
				refs.playersList.removeChild(rowRefs.row);
			}
			playerRowsById.delete(key);
		});

		if (focusedAttackKey && playerRowsById.has(focusedAttackKey)) {
			const rowRefs = playerRowsById.get(focusedAttackKey);
			if (rowRefs && rowRefs.input && rowRefs.input.style.display !== 'none' && !rowRefs.input.disabled) {
				rowRefs.input.focus();
				if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
					rowRefs.input.setSelectionRange(selectionStart, selectionEnd);
				}
			}
		}
	}

	return {
		root,
		reconcile,
	};
}
