import { collectRefs, cloneTemplateNode } from '../dom.js';
import { getOfferItemKey, normalizeBidsMap, placeChildAt } from './normalization.js';

export function ensureAbilityRow(context, ability) {
	const key = getOfferItemKey(ability);
	if (context.abilityRowsById.has(key)) {
		return context.abilityRowsById.get(key);
	}

	const row = cloneTemplateNode(context.abilityRowTemplate);
	const rowRefs = collectRefs(row);
	const name = rowRefs.name;
	const description = rowRefs.description;
	const label = rowRefs.label;
	const input = rowRefs.input;
	input.addEventListener('input', function onInput() {
		const raw = Number(input.value || 0);
		context.localDraft.bids[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
		context.localDraft.dirtyBids = true;
		context.reconcileUi();
	});

	context.abilitiesList.appendChild(row);

	const refs = { row, name, description, label, input };
	context.abilityRowsById.set(key, refs);
	return refs;
}

export function reconcileAbilitiesList(context) {
	let focusedAbilityId = null;
	let selectionStart = null;
	let selectionEnd = null;
	const activeEl = document.activeElement;
	if (activeEl && activeEl.tagName === 'INPUT') {
		Array.from(context.abilityRowsById.entries()).forEach(function eachEntry(entry) {
			const key = entry[0];
			const rowRefs = entry[1];
			if (rowRefs.input === activeEl) {
				focusedAbilityId = key;
				selectionStart = rowRefs.input.selectionStart;
				selectionEnd = rowRefs.input.selectionEnd;
			}
		});
	}

	const active = new Set();
	const submittedBids = normalizeBidsMap(context.serverSnapshot.currentBids || {});
	const editableBids = normalizeBidsMap(context.localDraft.bids || {});
	const canEditBids = !!context.lastPerms.can_act;

	context.serverSnapshot.offeredAbilities.forEach(function eachAbility(ability) {
		const key = getOfferItemKey(ability);
		active.add(key);
		const rowRefs = ensureAbilityRow(context, ability);
		rowRefs.name.textContent = String(ability.title || ability.name || key);
		rowRefs.description.textContent = String(ability.description || '');
		placeChildAt(context.abilitiesList, rowRefs.row, active.size - 1);

		if (!canEditBids) {
			rowRefs.label.textContent = 'No bidding access';
			rowRefs.label.style.display = '';
			rowRefs.input.style.display = 'none';
			return;
		}

		if (context.hasSubmittedBids() && !context.uiState.isEditing) {
			const submittedAmount = Math.max(0, Number(submittedBids[key] || 0));
			rowRefs.label.textContent = 'Bid: ' + Math.floor(submittedAmount);
			rowRefs.label.style.display = '';
			rowRefs.input.style.display = 'none';
			return;
		}

		rowRefs.label.style.display = 'none';
		rowRefs.input.style.display = '';
		const nextValue = String(Math.max(0, Number(editableBids[key] || 0)));
		const isFocused = focusedAbilityId === key && document.activeElement === rowRefs.input;
		if (!isFocused && rowRefs.input.value !== nextValue) {
			rowRefs.input.value = nextValue;
		}
		rowRefs.input.disabled = !canEditBids || !!context.orderBusy;
	});

	Array.from(context.abilityRowsById.keys()).forEach(function eachExisting(key) {
		if (active.has(key)) {
			return;
		}

		const rowRefs = context.abilityRowsById.get(key);
		if (rowRefs && rowRefs.row.parentNode === context.abilitiesList) {
			context.abilitiesList.removeChild(rowRefs.row);
		}
		context.abilityRowsById.delete(key);
	});

	if (focusedAbilityId && context.abilityRowsById.has(focusedAbilityId)) {
		const rowRefs = context.abilityRowsById.get(focusedAbilityId);
		if (rowRefs && rowRefs.input && rowRefs.input.style.display !== 'none' && !rowRefs.input.disabled) {
			rowRefs.input.focus();
			if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
				rowRefs.input.setSelectionRange(selectionStart, selectionEnd);
			}
		}
	}
}