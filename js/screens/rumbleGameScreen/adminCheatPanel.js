import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate, showConfirmModal } from '../dom.js';
import { placeChildAt } from './normalization.js';
import { reconcileSelectOptions } from './domHelpers.js';

const ADMIN_CHEAT_PANEL_HTML = `
	<div>
		<div class="row mobile-stack" data-ref="adminCheatToggleRow" style="display: none; align-items: center; margin: 0 0 8px 0; gap: 8px;">
			<button data-ref="adminCheatToggleBtn">Admin Cheat: Show</button>
			<small data-ref="adminCheatToggleHint" style="opacity: 0.85;">Global Admin UI must also be enabled.</small>
		</div>
		<div data-ref="adminCheatPanel" style="display: none; margin: 0 0 10px 0; padding: 10px; border: 1px dashed rgba(0, 0, 0, 0.25); border-radius: 10px; background: rgba(0, 0, 0, 0.03);">
			<div class="row mobile-stack" style="align-items: center; margin-bottom: 8px;">
				<h4 style="margin: 0;">Admin Ability Cheat</h4>
				<div data-ref="adminCheatSummary" style="margin-left: auto; opacity: 0.85;">Select a player and abilities to grant.</div>
			</div>
			<p data-ref="adminCheatHint" style="margin: 0 0 8px 0; opacity: 0.85;">Visible only to admins while Admin UI is enabled.</p>
			<div class="row mobile-stack" style="align-items: center; margin: 0 0 8px 0; gap: 8px;">
				<label for="rumble-admin-cheat-target" style="min-width: 100px;">Target player</label>
				<select id="rumble-admin-cheat-target" data-ref="adminCheatTargetSelect" style="flex: 1;"></select>
				<button data-ref="adminCheatSubmitBtn">Grant Selected</button>
				<button data-ref="adminCheatClearBtn">Clear</button>
			</div>
			<div class="list" data-ref="adminCheatAbilityList" style="max-height: 260px; overflow: auto; padding-right: 4px;"></div>
			<p data-ref="adminCheatEmptyText" style="margin: 8px 0 0 0; opacity: 0.85;">No abilities available.</p>
		</div>
	</div>
`;

const ADMIN_CHEAT_ABILITY_ROW_TEMPLATE_HTML = `
	<label class="row mobile-stack" style="align-items: flex-start; margin-bottom: 6px; gap: 8px; cursor: pointer;">
		<input type="checkbox" data-ref="checkbox" style="width: auto; margin-top: 2px;">
		<div style="flex: 1; min-width: 0;">
			<div class="row mobile-stack" style="align-items: center; gap: 8px; margin: 0 0 2px 0;">
				<div data-ref="name" style="font-weight: 600;"></div>
				<small data-ref="meta" style="opacity: 0.8;"></small>
				<small data-ref="status" style="opacity: 0.85;"></small>
			</div>
			<div data-ref="description" style="opacity: 0.9;"></div>
		</div>
	</label>
`;

export function createAdminCheatController(context) {
	const root = createNodeFromHtml(ADMIN_CHEAT_PANEL_HTML);
	const refs = collectRefs(root);
	const adminCheatAbilityRowTemplate = createTemplate(ADMIN_CHEAT_ABILITY_ROW_TEMPLATE_HTML);
	const adminCheatAbilityRowsById = new Map();
	const adminCheatTargetOptionByValue = new Map();

	function clearSelections() {
		context.localDraft.adminCheatSelections = {};
	}

	function ensureAdminCheatAbilityRow(ability) {
		const key = String(ability.id || '');
		if (adminCheatAbilityRowsById.has(key)) {
			return adminCheatAbilityRowsById.get(key);
		}

		const row = cloneTemplateNode(adminCheatAbilityRowTemplate);
		const rowRefs = collectRefs(row);
		const nextRefs = {
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

		refs.adminCheatAbilityList.appendChild(row);
		adminCheatAbilityRowsById.set(key, nextRefs);
		return nextRefs;
	}

	refs.adminCheatTargetSelect.addEventListener('change', function onAdminCheatTargetChange() {
		context.localDraft.adminCheatTargetUserId = String(refs.adminCheatTargetSelect.value || '');
		context.reconcileUi();
	});

	refs.adminCheatToggleBtn.addEventListener('click', function onAdminCheatToggle() {
		if (!context.isAdminCheatVisible()) {
			return;
		}

		context.uiState.adminCheatExpanded = !context.uiState.adminCheatExpanded;
		context.reconcileUi();
	});

	refs.adminCheatClearBtn.addEventListener('click', function onAdminCheatClear() {
		if (context.isAdminCheatBusy()) {
			return;
		}

		clearSelections();
		context.reconcileUi();
	});

	refs.adminCheatSubmitBtn.addEventListener('click', async function onAdminCheatSubmit() {
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
			clearSelections();
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

	function reconcile() {
		const available = !!context.isAdminCheatVisible();
		if (!available) {
			context.uiState.adminCheatExpanded = false;
		}
		refs.adminCheatToggleRow.style.display = available ? '' : 'none';
		refs.adminCheatToggleBtn.textContent = 'Admin Cheat: ' + (context.uiState.adminCheatExpanded ? 'Hide' : 'Show');
		refs.adminCheatToggleHint.textContent = available
			? 'Global Admin UI is enabled for this in-progress game.'
			: 'Global Admin UI must also be enabled.';
		refs.adminCheatPanel.style.display = available && context.uiState.adminCheatExpanded ? '' : 'none';
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
		reconcileSelectOptions(refs.adminCheatTargetSelect, adminCheatTargetOptionByValue, options);

		const targetStillAvailable = eligiblePlayers.some(function eachPlayer(player) {
			return String(player.user_id) === String(context.localDraft.adminCheatTargetUserId || '');
		});
		if (!targetStillAvailable) {
			context.localDraft.adminCheatTargetUserId = '';
		}
		if (refs.adminCheatTargetSelect.value !== String(context.localDraft.adminCheatTargetUserId || '')) {
			refs.adminCheatTargetSelect.value = String(context.localDraft.adminCheatTargetUserId || '');
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
			Array.from(adminCheatAbilityRowsById.entries()).forEach(function eachEntry(entry) {
				if (entry[1].checkbox === activeEl) {
					focusedAbilityId = entry[0];
				}
			});
		}

		const active = new Set();
		context.serverSnapshot.abilityCatalog.forEach(function eachAbility(ability) {
			const key = String(ability.id || '');
			active.add(key);
			const rowRefs = ensureAdminCheatAbilityRow(ability);
			const checked = !!(context.localDraft.adminCheatSelections && context.localDraft.adminCheatSelections[key]);
			const ownedCount = Math.max(0, Number(ownedCounts[key] || 0));

			rowRefs.name.textContent = String(ability.title || ability.name || key);
			rowRefs.meta.textContent = String(ability.template_kind || 'unknown');
			rowRefs.description.textContent = String(ability.description || '');
			rowRefs.status.textContent = ownedCount > 0 ? ('Owned x' + ownedCount) : (checked ? 'Will grant' : 'Available');
			rowRefs.checkbox.disabled = context.isAdminCheatBusy();
			rowRefs.checkbox.checked = checked;
			placeChildAt(refs.adminCheatAbilityList, rowRefs.row, active.size - 1);
		});

		Array.from(adminCheatAbilityRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = adminCheatAbilityRowsById.get(key);
			if (rowRefs && rowRefs.row.parentNode === refs.adminCheatAbilityList) {
				refs.adminCheatAbilityList.removeChild(rowRefs.row);
			}
			adminCheatAbilityRowsById.delete(key);
		});

		if (focusedAbilityId && adminCheatAbilityRowsById.has(focusedAbilityId)) {
			const focusedRefs = adminCheatAbilityRowsById.get(focusedAbilityId);
			if (focusedRefs && !focusedRefs.checkbox.disabled) {
				focusedRefs.checkbox.focus();
			}
		}

		refs.adminCheatHint.textContent = selectedTarget
			? ('Target: ' + String(selectedTarget.ship_name || selectedTarget.username || ('User ' + selectedTarget.user_id)))
			: 'Visible only to admins while Admin UI is enabled.';
		refs.adminCheatSummary.textContent = selectedAbilityIds.length > 0
			? (selectedAbilityIds.length + ' selected')
			: 'Select a player and abilities to grant.';
		refs.adminCheatTargetSelect.disabled = context.isAdminCheatBusy() || eligiblePlayers.length === 0;
		refs.adminCheatSubmitBtn.textContent = context.isAdminCheatBusy() ? 'Granting...' : 'Grant Selected';
		refs.adminCheatSubmitBtn.disabled = context.isAdminCheatBusy() || !selectedTarget || selectedAbilityIds.length === 0;
		refs.adminCheatClearBtn.disabled = context.isAdminCheatBusy() || selectedAbilityIds.length === 0;
		refs.adminCheatEmptyText.style.display = context.serverSnapshot.abilityCatalog.length === 0 ? '' : 'none';
	}

	return {
		root,
		reconcile,
	};
}