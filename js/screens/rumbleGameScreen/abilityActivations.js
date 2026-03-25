import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { abilityCostFromDraft, getAbilityControlSpec, isActivatedAbility } from './abilities.js';
import { reconcileSelectOptions } from './domHelpers.js';
import { getOwnedAbilityDraftKey, normalizeAbilityActivationMap, placeChildAt } from './normalization.js';

const ABILITY_ACTIVATION_SECTION_HTML = `
	<div data-ref="abilityActivationPanel" style="margin-top: 8px;">
		<p data-ref="abilityActivationHelpText" style="margin: 4px 0 8px 0;">Ability activations (activated abilities consume energy; passive/triggered abilities resolve automatically):</p>
		<p data-ref="abilityValidationText" style="margin: 0 0 8px 0; font-weight: 600;"></p>
		<div class="list" data-ref="abilityActivationList"></div>
	</div>
`;

const ABILITY_ACTIVATION_ROW_TEMPLATE_HTML = `
	<div class="row mobile-stack" style="align-items: flex-start; margin-bottom: 6px;">
		<div style="flex: 1 1 260px; min-width: 220px;">
			<div data-ref="name" style="font-weight: 600;"></div>
			<small data-ref="meta" style="opacity: 0.8;"></small>
			<div data-ref="description" style="margin-top: 3px;"></div>
		</div>
		<div style="flex: 1 1 320px; min-width: 240px; display: grid; gap: 6px;" data-ref="controls">
			<label data-ref="toggleWrap" style="display: inline-flex; align-items: center; gap: 8px;">
				<input type="checkbox" data-ref="toggleInput" style="width: auto;">
				<span data-ref="toggleLabel">Activate</span>
			</label>
			<div data-ref="targetWrap" class="row" style="margin: 0; gap: 8px;">
				<label data-ref="targetLabel" style="min-width: 50px;">Target</label>
				<select data-ref="targetSelect" style="flex: 1;"></select>
			</div>
			<div data-ref="xCostWrap" class="row" style="margin: 0; gap: 8px;">
				<label data-ref="xCostLabel" style="min-width: 50px;">X Cost</label>
				<input type="number" min="0" step="1" data-ref="xCostInput" placeholder="0" style="flex: 1;">
			</div>
			<div data-ref="readonlyText"></div>
		</div>
	</div>
`;

export function createAbilityActivationController(context) {
	const root = createNodeFromHtml(ABILITY_ACTIVATION_SECTION_HTML);
	const refs = collectRefs(root);
	const abilityActivationRowTemplate = createTemplate(ABILITY_ACTIVATION_ROW_TEMPLATE_HTML);
	const abilityActivationRowsById = new Map();

	function ensureAbilityActivationRow(ability) {
		const key = getOwnedAbilityDraftKey(ability);
		if (abilityActivationRowsById.has(key)) {
			return abilityActivationRowsById.get(key);
		}

		const row = cloneTemplateNode(abilityActivationRowTemplate);
		const rowRefs = collectRefs(row);
		const nextRefs = {
			row,
			name: rowRefs.name,
			meta: rowRefs.meta,
			description: rowRefs.description,
			controls: rowRefs.controls,
			toggleWrap: rowRefs.toggleWrap,
			toggleInput: rowRefs.toggleInput,
			toggleLabel: rowRefs.toggleLabel,
			targetWrap: rowRefs.targetWrap,
			targetLabel: rowRefs.targetLabel,
			targetSelect: rowRefs.targetSelect,
			xCostWrap: rowRefs.xCostWrap,
			xCostLabel: rowRefs.xCostLabel,
			xCostInput: rowRefs.xCostInput,
			readonlyText: rowRefs.readonlyText,
			targetOptionByValue: new Map(),
		};

		rowRefs.toggleInput.addEventListener('change', function onToggleChange() {
			const current = normalizeAbilityActivationMap(context.localDraft.abilityActivations || {});
			const nextEntry = current[key] || {};
			nextEntry.is_enabled = !!rowRefs.toggleInput.checked;
			current[key] = nextEntry;
			context.localDraft.abilityActivations = current;
			context.localDraft.dirtyAbilityActivations = true;
			context.reconcileUi();
		});

		rowRefs.targetSelect.addEventListener('change', function onTargetChange() {
			const current = normalizeAbilityActivationMap(context.localDraft.abilityActivations || {});
			const nextEntry = current[key] || {};
			const selected = String(rowRefs.targetSelect.value || '');
			if (/^\d+$/.test(selected) && Number(selected) > 0) {
				nextEntry.target_user_id = Number(selected);
			} else {
				delete nextEntry.target_user_id;
			}
			nextEntry.is_enabled = nextEntry.is_enabled !== false;
			current[key] = nextEntry;
			context.localDraft.abilityActivations = current;
			context.localDraft.dirtyAbilityActivations = true;
			context.reconcileUi();
		});

		rowRefs.xCostInput.addEventListener('input', function onXCostInput() {
			const current = normalizeAbilityActivationMap(context.localDraft.abilityActivations || {});
			const nextEntry = current[key] || {};
			const raw = Number(rowRefs.xCostInput.value || 0);
			nextEntry.x_cost = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			nextEntry.is_enabled = nextEntry.is_enabled !== false;
			current[key] = nextEntry;
			context.localDraft.abilityActivations = current;
			context.localDraft.dirtyAbilityActivations = true;
			context.reconcileUi();
		});

		refs.abilityActivationList.appendChild(row);
		abilityActivationRowsById.set(key, nextRefs);
		return nextRefs;
	}

	function reconcile() {
		const validation = context.getOrderValidation();
		if (validation.invalidAbilityTargets.length > 0) {
			refs.abilityValidationText.textContent = 'Ability activation invalid: one or more targets are defeated or unavailable.';
			refs.abilityValidationText.style.color = '#b42318';
		} else if (validation.missingAbilityTargets.length > 0) {
			refs.abilityValidationText.textContent = 'Ability activation invalid: choose targets for enabled targeted abilities.';
			refs.abilityValidationText.style.color = '#b42318';
		} else if (validation.invalidEnergy) {
			refs.abilityValidationText.textContent = 'Energy invalid: total attack + ability spend exceeds your round energy budget.';
			refs.abilityValidationText.style.color = '#b42318';
		} else {
			refs.abilityValidationText.textContent = '';
			refs.abilityValidationText.style.color = '';
		}

		const selfOwnedAbilities = context.getSelfOwnedAbilities();
		const activationMap = context.getEffectiveAbilityActivationMap();
		const canEdit = !!context.getLastPerms().can_act && context.uiState.isEditing && !context.isOrderBusy() && !context.isBiddingPhase();

		let focusedKey = null;
		let focusedControl = null;
		let selectionStart = null;
		let selectionEnd = null;
		const activeEl = document.activeElement;
		if (activeEl) {
			Array.from(abilityActivationRowsById.entries()).forEach(function eachEntry(entry) {
				const key = entry[0];
				const rowRefs = entry[1];
				if (rowRefs.toggleInput === activeEl) {
					focusedKey = key;
					focusedControl = 'toggle';
				} else if (rowRefs.targetSelect === activeEl) {
					focusedKey = key;
					focusedControl = 'target';
				} else if (rowRefs.xCostInput === activeEl) {
					focusedKey = key;
					focusedControl = 'x_cost';
					selectionStart = rowRefs.xCostInput.selectionStart;
					selectionEnd = rowRefs.xCostInput.selectionEnd;
				}
			});
		}

		const aliveTargets = context.serverSnapshot.players.filter(function eachPlayer(player) {
			return !player.is_self
				&& !player.is_defeated
				&& Number(player.health || 0) > 0
				&& player.is_opponent_targetable !== false;
		});

		const active = new Set();
		selfOwnedAbilities.forEach(function eachAbility(ability) {
			const key = getOwnedAbilityDraftKey(ability);
			active.add(key);
			const rowRefs = ensureAbilityActivationRow(ability);
			const abilityName = String(ability.title || ability.name || key);
			const copyIndex = Math.max(0, Number(ability.ability_copy_index || 0));
			rowRefs.name.textContent = copyIndex > 1 ? (abilityName + ' #' + copyIndex) : abilityName;
			rowRefs.meta.textContent = String(ability.template_kind || 'unknown');
			rowRefs.description.textContent = String(ability.description || '');
			placeChildAt(refs.abilityActivationList, rowRefs.row, active.size - 1);

			const activated = isActivatedAbility(ability);
			const controlSpec = getAbilityControlSpec(ability);
			const hasTarget = controlSpec.showTarget;
			const hasXCost = controlSpec.showXCost;

			const currentActivation = activationMap[key] || { is_enabled: false };
			const enabled = currentActivation.is_enabled !== false;
			rowRefs.readonlyText.textContent = context.describeActivationReadonly(ability, activationMap);

			const showInteractiveControls = activated && canEdit;
			rowRefs.toggleWrap.style.display = showInteractiveControls ? '' : 'none';
			rowRefs.targetWrap.style.display = showInteractiveControls && hasTarget ? '' : 'none';
			rowRefs.xCostWrap.style.display = showInteractiveControls && hasXCost ? '' : 'none';
			rowRefs.readonlyText.style.display = showInteractiveControls ? 'none' : '';

			if (showInteractiveControls) {
				rowRefs.toggleInput.disabled = !canEdit;
				rowRefs.toggleInput.checked = enabled;
				const estimatedCost = abilityCostFromDraft(ability, currentActivation);
				rowRefs.toggleLabel.textContent = 'Activate (cost: ' + estimatedCost + ')';

				if (hasTarget) {
					const options = [{ value: '', label: 'Select target' }].concat(aliveTargets.map(function eachTarget(player) {
						return {
							value: String(player.user_id),
							label: String(player.ship_name || player.username || ('User ' + player.user_id)),
						};
					}));
					reconcileSelectOptions(rowRefs.targetSelect, rowRefs.targetOptionByValue, options);
					const currentTarget = Object.prototype.hasOwnProperty.call(currentActivation, 'target_user_id')
						? String(currentActivation.target_user_id)
						: '';
					if (rowRefs.targetSelect.value !== currentTarget) {
						rowRefs.targetSelect.value = currentTarget;
					}
					rowRefs.targetSelect.disabled = !enabled || !canEdit;
				}

				if (hasXCost) {
					const xValue = String(Math.max(0, Number(currentActivation.x_cost || 0)));
					if (rowRefs.xCostInput.value !== xValue) {
						rowRefs.xCostInput.value = xValue;
					}
					rowRefs.xCostInput.disabled = !enabled || !canEdit;
				}
			}
		});

		Array.from(abilityActivationRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = abilityActivationRowsById.get(key);
			if (rowRefs && rowRefs.row.parentNode === refs.abilityActivationList) {
				refs.abilityActivationList.removeChild(rowRefs.row);
			}
			abilityActivationRowsById.delete(key);
		});

		if (focusedKey && abilityActivationRowsById.has(focusedKey)) {
			const rowRefs = abilityActivationRowsById.get(focusedKey);
			if (!rowRefs) {
				return;
			}

			if (focusedControl === 'toggle' && rowRefs.toggleWrap.style.display !== 'none') {
				rowRefs.toggleInput.focus();
			} else if (focusedControl === 'target' && rowRefs.targetWrap.style.display !== 'none' && !rowRefs.targetSelect.disabled) {
				rowRefs.targetSelect.focus();
			} else if (focusedControl === 'x_cost' && rowRefs.xCostWrap.style.display !== 'none' && !rowRefs.xCostInput.disabled) {
				rowRefs.xCostInput.focus();
				if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
					rowRefs.xCostInput.setSelectionRange(selectionStart, selectionEnd);
				}
			}
		}
	}

	return {
		root,
		reconcile,
	};
}
