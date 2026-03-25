import { collectRefs, cloneTemplateNode } from '../dom.js';
import { normalizeAttacksMap, placeChildAt } from './normalization.js';

export function ensurePlayerRow(context, player) {
	const key = String(Number(player.user_id));
	if (context.playerRowsById.has(key)) {
		return context.playerRowsById.get(key);
	}

	const row = cloneTemplateNode(context.playerRowTemplate);
	const rowRefs = collectRefs(row);
	const name = rowRefs.name;
	const abilities = rowRefs.abilities;
	const right = rowRefs.right;
	const label = rowRefs.label;
	const input = rowRefs.input;
	input.addEventListener('input', function onInput() {
		const raw = Number(input.value || 0);
		context.localDraft.attacks[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
		context.localDraft.dirtyAttacks = true;
		context.reconcileUi();
	});

	context.playersList.appendChild(row);

	const refs = { row, name, abilities, right, label, input, abilityBadgeById: new Map() };
	context.playerRowsById.set(key, refs);
	return refs;
}

export function reconcileOwnedAbilities(refs, ownedAbilities) {
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

export function reconcilePlayersList(context) {
	let focusedAttackKey = null;
	let selectionStart = null;
	let selectionEnd = null;
	const activeEl = document.activeElement;
	if (activeEl && activeEl.tagName === 'INPUT') {
		Array.from(context.playerRowsById.entries()).forEach(function eachEntry(entry) {
			const key = entry[0];
			const refs = entry[1];
			if (refs.input === activeEl) {
				focusedAttackKey = key;
				selectionStart = refs.input.selectionStart;
				selectionEnd = refs.input.selectionEnd;
			}
		});
	}

	const active = new Set();
	const submittedAttacks = normalizeAttacksMap(context.serverSnapshot.currentOrder && context.serverSnapshot.currentOrder.attacks ? context.serverSnapshot.currentOrder.attacks : {});
	const editableAttacks = normalizeAttacksMap(context.localDraft.attacks || {});

	context.serverSnapshot.players.forEach(function eachPlayer(player) {
		const key = String(Number(player.user_id));
		active.add(key);
		const refs = ensurePlayerRow(context, player);
		const isDefeated = !!player.is_defeated || Number(player.health || 0) <= 0;

		const displayShipName = String(player.ship_name || player.username || 'Unknown');
		refs.name.textContent = displayShipName + ' | Health: ' + Math.max(0, Number(player.health || 0));
		const ownedAbilities = Array.isArray(player.owned_abilities) ? player.owned_abilities : [];
		reconcileOwnedAbilities(refs, ownedAbilities);
		placeChildAt(context.playersList, refs.row, active.size - 1);

		if (player.is_self) {
			refs.label.textContent = isDefeated ? 'Defeated' : 'You';
			refs.label.style.display = '';
			refs.input.style.display = 'none';
			return;
		}

		if (isDefeated) {
			refs.label.textContent = 'Defeated';
			refs.label.style.display = '';
			refs.input.style.display = 'none';
			return;
		}

		if (!context.lastPerms.can_act) {
			refs.label.textContent = 'Active';
			refs.label.style.display = '';
			refs.input.style.display = 'none';
			return;
		}

		if (context.hasSubmittedOrder() && !context.uiState.isEditing) {
			const submittedAmount = Number(submittedAttacks[key] || 0);
			refs.label.textContent = 'Attack: ' + Math.max(0, Math.floor(submittedAmount));
			refs.label.style.display = '';
			refs.input.style.display = 'none';
			return;
		}

		refs.label.style.display = 'none';
		refs.input.style.display = '';
		const nextValue = String(Math.max(0, Number(editableAttacks[key] || 0)));
		const isFocused = focusedAttackKey === key && document.activeElement === refs.input;
		if (!isFocused && refs.input.value !== nextValue) {
			refs.input.value = nextValue;
		}
		refs.input.disabled = !context.lastPerms.can_act || !!context.orderBusy;
	});

	Array.from(context.playerRowsById.keys()).forEach(function eachExisting(key) {
		if (active.has(key)) {
			return;
		}

		const refs = context.playerRowsById.get(key);
		if (refs && refs.row.parentNode === context.playersList) {
			context.playersList.removeChild(refs.row);
		}
		context.playerRowsById.delete(key);
	});

	if (focusedAttackKey && context.playerRowsById.has(focusedAttackKey)) {
		const refs = context.playerRowsById.get(focusedAttackKey);
		if (refs && refs.input && refs.input.style.display !== 'none' && !refs.input.disabled) {
			refs.input.focus();
			if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
				refs.input.setSelectionRange(selectionStart, selectionEnd);
			}
		}
	}
}