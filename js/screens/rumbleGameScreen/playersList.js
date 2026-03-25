import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { normalizeAttacksMap, placeChildAt } from './normalization.js';

const PLAYERS_LIST_SECTION_HTML = `
	<div>
		<p data-ref="attackHelpText" style="margin: 4px 0 8px 0;">Attack allocations (enter power to send at each target):</p>
		<p data-ref="orderValidationText" style="margin: 0 0 8px 0; font-weight: 600;"></p>
		<div class="list" data-ref="playersList"></div>
	</div>
`;

const PLAYER_ROW_TEMPLATE_HTML = `
	<div class="row mobile-stack" style="align-items: center; margin-bottom: 6px;">
		<div style="flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
			<div data-ref="name"></div>
			<small data-ref="abilities" style="opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;"></small>
		</div>
		<div style="min-width: 220px; display: flex; flex-direction: column; justify-content: center; gap: 4px;" data-ref="right">
			<div data-ref="label" style="line-height: 1.2;"></div>
			<input type="number" min="0" step="1" placeholder="Attack amount" data-ref="input">
		</div>
	</div>
`;

function reconcileOwnedAbilities(refs, ownedAbilities) {
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

		let badge = refs.abilityBadgeById.get(abilityId);
		if (!badge) {
			badge = document.createElement('span');
			badge.style.display = 'inline-block';
			badge.style.padding = '1px 6px';
			badge.style.border = '1px solid rgba(0, 0, 0, 0.2)';
			badge.style.borderRadius = '999px';
			refs.abilityBadgeById.set(abilityId, badge);
		}

		const abilityName = String(ability && (ability.title || ability.name) ? (ability.title || ability.name) : 'Unknown');
		const description = String(ability && ability.description ? ability.description : 'No description available.');
		badge.textContent = groupedEntry.count > 1 ? (abilityName + ' x' + groupedEntry.count) : abilityName;
		badge.title = abilityName + ': ' + description + (groupedEntry.count > 1 ? ' (owned ' + groupedEntry.count + ' copies)' : '');
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
			name: rowRefs.name,
			abilities: rowRefs.abilities,
			right: rowRefs.right,
			label: rowRefs.label,
			input: rowRefs.input,
			abilityBadgeById: new Map(),
		};
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

		context.serverSnapshot.players.forEach(function eachPlayer(player) {
			const key = String(Number(player.user_id));
			active.add(key);
			const rowRefs = ensurePlayerRow(player);
			const isDefeated = !!player.is_defeated || Number(player.health || 0) <= 0;

			const displayShipName = String(player.ship_name || player.username || 'Unknown');
			rowRefs.name.textContent = displayShipName + ' | Health: ' + Math.max(0, Number(player.health || 0));
			const ownedAbilities = Array.isArray(player.owned_abilities) ? player.owned_abilities : [];
			reconcileOwnedAbilities(rowRefs, ownedAbilities);
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
