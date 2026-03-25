import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { getOfferItemKey, normalizeBidsMap, placeChildAt } from './normalization.js';

const BIDDING_PANEL_HTML = `
	<div>
		<p data-ref="bidHelpText" style="margin: 4px 0 8px 0;">Place secret bids for offered abilities. You can overbid your health, but if bidding leaves you at 0 or less you are eliminated before combat.</p>
		<p data-ref="bidValidationText" style="margin: 0 0 8px 0; font-weight: 600;"></p>
		<div class="row" style="font-weight: 600; margin-bottom: 6px; align-items: center;">
			<div style="flex: 0 0 180px;">Ability</div>
			<div style="flex: 1;">Description</div>
			<div style="width: 220px;">Bid</div>
		</div>
		<div class="list" data-ref="abilitiesList"></div>
	</div>
`;

const ABILITY_ROW_TEMPLATE_HTML = `
	<div class="row mobile-stack" style="align-items: center; margin-bottom: 6px;">
		<div style="flex: 0 0 180px;" data-ref="name"></div>
		<div style="flex: 1;" data-ref="description"></div>
		<div style="width: 220px;" data-ref="right">
			<div data-ref="label"></div>
			<input type="number" min="0" step="1" placeholder="Bid amount" data-ref="input">
		</div>
	</div>
`;

export function createBiddingPanelController(context) {
	const root = createNodeFromHtml(BIDDING_PANEL_HTML);
	const refs = collectRefs(root);
	const abilityRowTemplate = createTemplate(ABILITY_ROW_TEMPLATE_HTML);
	const abilityRowsById = new Map();

	function ensureAbilityRow(ability) {
		const key = getOfferItemKey(ability);
		if (abilityRowsById.has(key)) {
			return abilityRowsById.get(key);
		}

		const row = cloneTemplateNode(abilityRowTemplate);
		const rowRefs = collectRefs(row);
		const nextRefs = {
			row,
			name: rowRefs.name,
			description: rowRefs.description,
			label: rowRefs.label,
			input: rowRefs.input,
		};
		rowRefs.input.addEventListener('input', function onInput() {
			const raw = Number(rowRefs.input.value || 0);
			context.localDraft.bids[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			context.localDraft.dirtyBids = true;
			context.reconcileUi();
		});

		refs.abilitiesList.appendChild(row);
		abilityRowsById.set(key, nextRefs);
		return nextRefs;
	}

	function reconcile() {
		const bidValidation = context.getBidValidation();
		if (bidValidation.invalidAbilityIds.length > 0) {
			refs.bidValidationText.textContent = 'Bids are invalid: one or more offered abilities are unavailable.';
			refs.bidValidationText.style.color = '#b42318';
		} else {
			refs.bidValidationText.textContent = 'Total bid: ' + bidValidation.totalBid;
			refs.bidValidationText.style.color = '';
		}

		let focusedAbilityId = null;
		let selectionStart = null;
		let selectionEnd = null;
		const activeEl = document.activeElement;
		if (activeEl && activeEl.tagName === 'INPUT') {
			Array.from(abilityRowsById.entries()).forEach(function eachEntry(entry) {
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
		const canEditBids = !!context.getLastPerms().can_act;

		context.serverSnapshot.offeredAbilities.forEach(function eachAbility(ability) {
			const key = getOfferItemKey(ability);
			active.add(key);
			const rowRefs = ensureAbilityRow(ability);
			rowRefs.name.textContent = String(ability.title || ability.name || key);
			rowRefs.description.textContent = String(ability.description || '');
			placeChildAt(refs.abilitiesList, rowRefs.row, active.size - 1);

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
			rowRefs.input.disabled = !canEditBids || context.isOrderBusy();
		});

		Array.from(abilityRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = abilityRowsById.get(key);
			if (rowRefs && rowRefs.row.parentNode === refs.abilitiesList) {
				refs.abilitiesList.removeChild(rowRefs.row);
			}
			abilityRowsById.delete(key);
		});

		if (focusedAbilityId && abilityRowsById.has(focusedAbilityId)) {
			const rowRefs = abilityRowsById.get(focusedAbilityId);
			if (rowRefs && rowRefs.input.style.display !== 'none' && !rowRefs.input.disabled) {
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
		setVisible: function setVisible(visible) {
			root.style.display = visible ? '' : 'none';
		},
	};
}