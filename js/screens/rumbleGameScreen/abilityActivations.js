import { collectRefs, cloneTemplateNode } from '../dom.js';
import { abilityCostFromDraft, getAbilityControlSpec, isActivatedAbility } from './abilities.js';
import { reconcileSelectOptions } from './domHelpers.js';
import { getOwnedAbilityDraftKey, normalizeAbilityActivationMap, placeChildAt } from './normalization.js';

export function ensureAbilityActivationRow(context, ability) {
	const key = getOwnedAbilityDraftKey(ability);
	if (context.abilityActivationRowsById.has(key)) {
		return context.abilityActivationRowsById.get(key);
	}

	const row = cloneTemplateNode(context.abilityActivationRowTemplate);
	const rowRefs = collectRefs(row);
	const refs = {
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

	context.abilityActivationList.appendChild(row);
	context.abilityActivationRowsById.set(key, refs);
	return refs;
}

export function reconcileAbilityActivationList(context) {
	const selfOwnedAbilities = context.getSelfOwnedAbilities();
	const activationMap = context.getEffectiveAbilityActivationMap();
	const canEdit = !!context.lastPerms.can_act && context.uiState.isEditing && !context.orderBusy && !context.isBiddingPhase();

	let focusedKey = null;
	let focusedControl = null;
	let selectionStart = null;
	let selectionEnd = null;
	const activeEl = document.activeElement;
	if (activeEl) {
		Array.from(context.abilityActivationRowsById.entries()).forEach(function eachEntry(entry) {
			const key = entry[0];
			const refs = entry[1];
			if (refs.toggleInput === activeEl) {
				focusedKey = key;
				focusedControl = 'toggle';
			} else if (refs.targetSelect === activeEl) {
				focusedKey = key;
				focusedControl = 'target';
			} else if (refs.xCostInput === activeEl) {
				focusedKey = key;
				focusedControl = 'x_cost';
				selectionStart = refs.xCostInput.selectionStart;
				selectionEnd = refs.xCostInput.selectionEnd;
			}
		});
	}

	const aliveTargets = context.serverSnapshot.players.filter(function eachPlayer(player) {
		return !player.is_self && !player.is_defeated && Number(player.health || 0) > 0;
	});

	const active = new Set();
	selfOwnedAbilities.forEach(function eachAbility(ability) {
		const key = getOwnedAbilityDraftKey(ability);
		active.add(key);
		const refs = ensureAbilityActivationRow(context, ability);
		const abilityName = String(ability.title || ability.name || key);
		const copyIndex = Math.max(0, Number(ability.ability_copy_index || 0));
		refs.name.textContent = copyIndex > 1 ? (abilityName + ' #' + copyIndex) : abilityName;
		refs.meta.textContent = String(ability.template_kind || 'unknown');
		refs.description.textContent = String(ability.description || '');
		placeChildAt(context.abilityActivationList, refs.row, active.size - 1);

		const activated = isActivatedAbility(ability);
		const controlSpec = getAbilityControlSpec(ability);
		const hasTarget = controlSpec.showTarget;
		const hasXCost = controlSpec.showXCost;

		const currentActivation = activationMap[key] || { is_enabled: false };
		const enabled = currentActivation.is_enabled !== false;
		refs.readonlyText.textContent = context.describeActivationReadonly(ability, activationMap);

		const showInteractiveControls = activated && canEdit;
		refs.toggleWrap.style.display = showInteractiveControls ? '' : 'none';
		refs.targetWrap.style.display = showInteractiveControls && hasTarget ? '' : 'none';
		refs.xCostWrap.style.display = showInteractiveControls && hasXCost ? '' : 'none';
		refs.readonlyText.style.display = showInteractiveControls ? 'none' : '';

		if (showInteractiveControls) {
			refs.toggleInput.disabled = !canEdit;
			refs.toggleInput.checked = enabled;
			const estimatedCost = abilityCostFromDraft(ability, currentActivation);
			refs.toggleLabel.textContent = 'Activate (cost: ' + estimatedCost + ')';

			if (hasTarget) {
				const options = [{ value: '', label: 'Select target' }].concat(aliveTargets.map(function eachTarget(player) {
					return {
						value: String(player.user_id),
						label: String(player.ship_name || player.username || ('User ' + player.user_id)),
					};
				}));
				reconcileSelectOptions(refs.targetSelect, refs.targetOptionByValue, options);
				const currentTarget = Object.prototype.hasOwnProperty.call(currentActivation, 'target_user_id')
					? String(currentActivation.target_user_id)
					: '';
				if (refs.targetSelect.value !== currentTarget) {
					refs.targetSelect.value = currentTarget;
				}
				refs.targetSelect.disabled = !enabled || !canEdit;
			}

			if (hasXCost) {
				const xValue = String(Math.max(0, Number(currentActivation.x_cost || 0)));
				if (refs.xCostInput.value !== xValue) {
					refs.xCostInput.value = xValue;
				}
				refs.xCostInput.disabled = !enabled || !canEdit;
			}
		}
	});

	Array.from(context.abilityActivationRowsById.keys()).forEach(function eachExisting(key) {
		if (active.has(key)) {
			return;
		}

		const refs = context.abilityActivationRowsById.get(key);
		if (refs && refs.row.parentNode === context.abilityActivationList) {
			context.abilityActivationList.removeChild(refs.row);
		}
		context.abilityActivationRowsById.delete(key);
	});

	if (focusedKey && context.abilityActivationRowsById.has(focusedKey)) {
		const refs = context.abilityActivationRowsById.get(focusedKey);
		if (!refs) {
			return;
		}

		if (focusedControl === 'toggle' && refs.toggleWrap.style.display !== 'none') {
			refs.toggleInput.focus();
		} else if (focusedControl === 'target' && refs.targetWrap.style.display !== 'none' && !refs.targetSelect.disabled) {
			refs.targetSelect.focus();
		} else if (focusedControl === 'x_cost' && refs.xCostWrap.style.display !== 'none' && !refs.xCostInput.disabled) {
			refs.xCostInput.focus();
			if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
				refs.xCostInput.setSelectionRange(selectionStart, selectionEnd);
			}
		}
	}
}