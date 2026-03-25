import { collectRefs, cloneTemplateNode, showConfirmModal } from '../dom.js';
import { placeChildAt } from './normalization.js';
import { reconcileSelectOptions } from './domHelpers.js';

export function clearAdminCheatSelections(context) {
	context.localDraft.adminCheatSelections = {};
}

export function ensureAdminCheatAbilityRow(context, ability) {
	const key = String(ability.id || '');
	if (context.adminCheatAbilityRowsById.has(key)) {
		return context.adminCheatAbilityRowsById.get(key);
	}

	const row = cloneTemplateNode(context.adminCheatAbilityRowTemplate);
	const rowRefs = collectRefs(row);
	const refs = {
		row,
		checkbox: rowRefs.checkbox,
		name: rowRefs.name,
		meta: rowRefs.meta,
		description: rowRefs.description,
		status: rowRefs.status,
	};

	rowRefs.checkbox.addEventListener('change', function onCheatAbilityToggle() {
		const nextSelections = Object.assign({}, context.localDraft.adminCheatSelections || {});
		nextSelections[key] = !!rowRefs.checkbox.checked;
		if (!nextSelections[key]) {
			delete nextSelections[key];
		}
		context.localDraft.adminCheatSelections = nextSelections;
		context.reconcileUi();
	});

	context.adminCheatAbilityList.appendChild(row);
	context.adminCheatAbilityRowsById.set(key, refs);
	return refs;
}

export function reconcileAdminCheatPanel(context) {
	const available = !!context.isAdminCheatVisible();
	if (!available) {
		context.uiState.adminCheatExpanded = false;
	}
	context.adminCheatToggleRow.style.display = available ? '' : 'none';
	context.adminCheatToggleBtn.textContent = 'Admin Cheat: ' + (context.uiState.adminCheatExpanded ? 'Hide' : 'Show');
	context.adminCheatToggleHint.textContent = available
		? 'Global Admin UI is enabled for this in-progress game.'
		: 'Global Admin UI must also be enabled.';
	context.adminCheatPanel.style.display = available && context.uiState.adminCheatExpanded ? '' : 'none';
	if (!available || !context.uiState.adminCheatExpanded) {
		return;
	}

	const eligiblePlayers = context.getCheatEligiblePlayers();
	const options = [{ value: '', label: 'Select player' }].concat(eligiblePlayers.map(function eachPlayer(player) {
		return {
			value: String(player.user_id),
			label: String(player.ship_name || player.username || ('User ' + player.user_id)),
		};
	}));
	reconcileSelectOptions(context.adminCheatTargetSelect, context.adminCheatTargetOptionByValue, options);

	const targetStillAvailable = eligiblePlayers.some(function eachPlayer(player) {
		return String(player.user_id) === String(context.localDraft.adminCheatTargetUserId || '');
	});
	if (!targetStillAvailable) {
		context.localDraft.adminCheatTargetUserId = '';
	}
	if (context.adminCheatTargetSelect.value !== String(context.localDraft.adminCheatTargetUserId || '')) {
		context.adminCheatTargetSelect.value = String(context.localDraft.adminCheatTargetUserId || '');
	}

	const selectedTarget = context.getCheatTargetPlayer();
	const selectedAbilityIds = context.getSelectedCheatAbilityIds();
	const ownedCounts = {};
	if (selectedTarget && Array.isArray(selectedTarget.owned_abilities)) {
		selectedTarget.owned_abilities.forEach(function eachOwnedAbility(ability) {
			const key = String(ability.id || '');
			ownedCounts[key] = Math.max(0, Number(ownedCounts[key] || 0)) + 1;
		});
	}

	let focusedAbilityId = null;
	const activeEl = document.activeElement;
	if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'checkbox') {
		Array.from(context.adminCheatAbilityRowsById.entries()).forEach(function eachEntry(entry) {
			if (entry[1].checkbox === activeEl) {
				focusedAbilityId = entry[0];
			}
		});
	}

	const active = new Set();
	context.serverSnapshot.abilityCatalog.forEach(function eachAbility(ability) {
		const key = String(ability.id || '');
		active.add(key);
		const refs = ensureAdminCheatAbilityRow(context, ability);
		const checked = !!(context.localDraft.adminCheatSelections && context.localDraft.adminCheatSelections[key]);
		const ownedCount = Math.max(0, Number(ownedCounts[key] || 0));

		refs.name.textContent = String(ability.title || ability.name || key);
		refs.meta.textContent = String(ability.template_kind || 'unknown');
		refs.description.textContent = String(ability.description || '');
		refs.status.textContent = ownedCount > 0 ? ('Owned x' + ownedCount) : (checked ? 'Will grant' : 'Available');
		refs.checkbox.disabled = !!context.adminCheatBusy;
		refs.checkbox.checked = checked;
		placeChildAt(context.adminCheatAbilityList, refs.row, active.size - 1);
	});

	Array.from(context.adminCheatAbilityRowsById.keys()).forEach(function eachExisting(key) {
		if (active.has(key)) {
			return;
		}

		const refs = context.adminCheatAbilityRowsById.get(key);
		if (refs && refs.row.parentNode === context.adminCheatAbilityList) {
			context.adminCheatAbilityList.removeChild(refs.row);
		}
		context.adminCheatAbilityRowsById.delete(key);
	});

	if (focusedAbilityId && context.adminCheatAbilityRowsById.has(focusedAbilityId)) {
		const focusedRefs = context.adminCheatAbilityRowsById.get(focusedAbilityId);
		if (focusedRefs && !focusedRefs.checkbox.disabled) {
			focusedRefs.checkbox.focus();
		}
	}

	context.adminCheatHint.textContent = selectedTarget
		? ('Target: ' + String(selectedTarget.ship_name || selectedTarget.username || ('User ' + selectedTarget.user_id)))
		: 'Visible only to admins while Admin UI is enabled.';
	context.adminCheatSummary.textContent = selectedAbilityIds.length > 0
		? (selectedAbilityIds.length + ' selected')
		: 'Select a player and abilities to grant.';
	context.adminCheatTargetSelect.disabled = !!context.adminCheatBusy || eligiblePlayers.length === 0;
	context.adminCheatSubmitBtn.textContent = context.adminCheatBusy ? 'Granting...' : 'Grant Selected';
	context.adminCheatSubmitBtn.disabled = !!context.adminCheatBusy || !selectedTarget || selectedAbilityIds.length === 0;
	context.adminCheatClearBtn.disabled = !!context.adminCheatBusy || selectedAbilityIds.length === 0;
	context.adminCheatEmptyText.style.display = context.serverSnapshot.abilityCatalog.length === 0 ? '' : 'none';
}

export function bindAdminCheatHandlers(context) {
	context.adminCheatTargetSelect.addEventListener('change', function onAdminCheatTargetChange() {
		context.localDraft.adminCheatTargetUserId = String(context.adminCheatTargetSelect.value || '');
		context.reconcileUi();
	});

	context.adminCheatToggleBtn.addEventListener('click', function onAdminCheatToggle() {
		if (!context.isAdminCheatVisible()) {
			return;
		}

		context.uiState.adminCheatExpanded = !context.uiState.adminCheatExpanded;
		context.reconcileUi();
	});

	context.adminCheatClearBtn.addEventListener('click', function onAdminCheatClear() {
		if (context.isAdminCheatBusy()) {
			return;
		}

		context.clearAdminCheatSelections();
		context.reconcileUi();
	});

	context.adminCheatSubmitBtn.addEventListener('click', async function onAdminCheatSubmit() {
		if (!context.getLastGameId() || context.isAdminCheatBusy() || !context.isAdminCheatVisible()) {
			return;
		}

		const targetPlayer = context.getCheatTargetPlayer();
		const selectedAbilityIds = context.getSelectedCheatAbilityIds();
		if (!targetPlayer) {
			context.setStatusNode('Choose a target player first.', 'error');
			return;
		}
		if (selectedAbilityIds.length === 0) {
			context.setStatusNode('Select at least one ability to grant.', 'error');
			return;
		}

		const confirmed = await showConfirmModal({
			title: 'Confirm Ability Grant',
			message: 'Grant ' + selectedAbilityIds.length + ' selected abilities to ' + String(targetPlayer.ship_name || targetPlayer.username || ('User ' + targetPlayer.user_id)) + '?',
			cancelLabel: 'Cancel',
			confirmLabel: 'Grant Abilities',
		});
		if (!confirmed) {
			return;
		}

		context.setAdminCheatBusy(true);
		context.reconcileUi();
		try {
			const result = await context.api.grantRumbleAbilities(context.getLastGameId(), targetPlayer.user_id, selectedAbilityIds);
			context.clearAdminCheatSelections();
			await context.refreshRumbleState({ silent: true });
			if (Array.isArray(result.added_ability_ids) && result.added_ability_ids.length > 0) {
				context.setStatusNode('Granted ' + result.added_ability_ids.length + ' abilities to ' + String(result.target_username || targetPlayer.username || targetPlayer.ship_name || ('User ' + targetPlayer.user_id)) + '.', 'ok');
			} else {
				context.setStatusNode(String(result.target_username || targetPlayer.username || targetPlayer.ship_name || ('User ' + targetPlayer.user_id)) + ' already had all selected abilities.', 'ok');
			}
		} catch (err) {
			context.setStatusNode(err.message || 'Unable to grant abilities.', 'error');
		} finally {
			context.setAdminCheatBusy(false);
			context.reconcileUi();
		}
	});
}