import { collectRefs, createNodeFromHtml, showConfirmModal } from '../dom.js';
import { activationArrayToMap, normalizeAttacksMap, normalizeBidsMap } from './normalization.js';

const PHASE_CONTROLS_HTML = `
	<div class="row mobile-stack" data-ref="buttonRow" style="margin-top: 8px;">
		<button class="primary" data-ref="submitBtn">Submit Bids</button>
		<button data-ref="editBtn">Edit Bids</button>
		<button data-ref="cancelBtn">Cancel Bids</button>
		<button data-ref="phaseActionBtn">End Bidding</button>
	</div>
`;

export function bindRefreshHandler(context) {
	context.refreshBtn.addEventListener('click', function onRefreshClick() {
		context.refreshRumbleState({ silent: false });
	});
}

export function createPhaseControlsController(context) {
	const root = createNodeFromHtml(PHASE_CONTROLS_HTML);
	const refs = collectRefs(root);

	refs.submitBtn.addEventListener('click', async function onSubmitOrder() {
		if (!context.getLastGameId() || !context.getLastPerms().can_act || context.isOrderBusy()) {
			return;
		}

		context.setOrderBusy(true);
		context.reconcileUi();
		try {
			if (context.isBiddingPhase()) {
				const bids = normalizeBidsMap(context.localDraft.bids);
				const bidValidation = context.getBidValidation();
				if (bidValidation.invalidAbilityIds.length > 0) {
					context.setStatusNode('Invalid bids: one or more offered abilities are unavailable.', 'error');
					return;
				}

				await context.api.submitRumbleBids(context.getLastGameId(), bids);
				context.uiState.isEditing = false;
				context.localDraft.dirtyBids = false;
				await context.refreshRumbleState({ silent: true });
				context.setStatusNode('Bids submitted.', 'ok');
				return;
			}

			const attacks = normalizeAttacksMap(context.localDraft.attacks);
			const abilityActivations = context.getEffectiveAbilityActivationArray();
			const validation = context.getOrderValidation();
			if (validation.invalidTargets.length > 0) {
				context.setStatusNode('Invalid order: remove attacks assigned to defeated or unavailable players.', 'error');
				return;
			}

			if (validation.invalidAbilityTargets.length > 0 || validation.missingAbilityTargets.length > 0) {
				context.setStatusNode('Invalid ability activations: choose valid living targets for enabled targeted abilities.', 'error');
				return;
			}

			if (validation.invalidDefense) {
				context.setStatusNode('Invalid order: defense cannot be negative.', 'error');
				return;
			}

			if (validation.invalidEnergy) {
				context.setStatusNode('Invalid order: total energy spend exceeds your budget.', 'error');
				return;
			}

			await context.api.submitRumbleOrder(context.getLastGameId(), attacks, abilityActivations);
			context.uiState.isEditing = false;
			context.localDraft.dirtyAttacks = false;
			context.localDraft.dirtyAbilityActivations = false;
			await context.refreshRumbleState({ silent: true });
			context.setStatusNode('Orders submitted.', 'ok');
		} catch (err) {
			context.setStatusNode(err.message || 'Unable to submit update.', 'error');
		} finally {
			context.setOrderBusy(false);
			context.reconcileUi();
		}
	});

	refs.editBtn.addEventListener('click', function onEditOrders() {
		if (!context.getLastPerms().can_act || context.isOrderBusy()) {
			return;
		}

		if (context.isBiddingPhase()) {
			if (!context.hasSubmittedBids()) {
				return;
			}

			context.localDraft.bids = normalizeBidsMap(context.serverSnapshot.currentBids || {});
			context.localDraft.dirtyBids = false;
			context.uiState.isEditing = true;
			context.reconcileUi();
			return;
		}

		if (!context.serverSnapshot.currentOrder) {
			return;
		}

		context.localDraft.attacks = normalizeAttacksMap(context.serverSnapshot.currentOrder.attacks || {});
		context.localDraft.dirtyAttacks = false;
		context.localDraft.abilityActivations = activationArrayToMap(context.serverSnapshot.currentOrder.ability_activations || []);
		context.localDraft.dirtyAbilityActivations = false;
		context.uiState.isEditing = true;
		context.reconcileUi();
	});

	refs.cancelBtn.addEventListener('click', async function onCancelOrder() {
		if (!context.getLastGameId() || !context.getLastPerms().can_act || context.isOrderBusy()) {
			return;
		}

		context.setOrderBusy(true);
		context.reconcileUi();
		try {
			if (context.isBiddingPhase()) {
				if (!context.hasSubmittedBids()) {
					return;
				}

				await context.api.cancelRumbleBids(context.getLastGameId());
				context.localDraft.bids = {};
				context.localDraft.dirtyBids = false;
				context.uiState.isEditing = true;
				await context.refreshRumbleState({ silent: true });
				context.setStatusNode('Bids canceled.', 'ok');
				return;
			}

			if (!context.serverSnapshot.currentOrder) {
				return;
			}

			await context.api.cancelRumbleOrder(context.getLastGameId());
			context.localDraft.attacks = {};
			context.localDraft.dirtyAttacks = false;
			context.localDraft.abilityActivations = {};
			context.localDraft.dirtyAbilityActivations = false;
			context.uiState.isEditing = true;
			await context.refreshRumbleState({ silent: true });
			context.setStatusNode('Orders canceled.', 'ok');
		} catch (err) {
			context.setStatusNode(err.message || 'Unable to cancel update.', 'error');
		} finally {
			context.setOrderBusy(false);
			context.reconcileUi();
		}
	});

	refs.phaseActionBtn.addEventListener('click', async function onPhaseAction() {
		if (!context.getLastGameId() || !context.getLastPerms().can_delete || !context.getLastPerms().can_end_turn || context.isOrderBusy()) {
			return;
		}

		if (context.isBiddingPhase()) {
			const confirmedEndBidding = await showConfirmModal({
				title: 'Confirm End Bidding',
				message: 'Resolve bidding now and move the game to combat?',
				cancelLabel: 'Cancel',
				confirmLabel: 'End Bidding',
			});
			if (!confirmedEndBidding) {
				return;
			}

			context.setOrderBusy(true);
			context.reconcileUi();
			try {
				await context.api.endRumbleBidding(context.getLastGameId());
				context.clearDraftDirty();
				await context.refreshRumbleState({ silent: true });
				context.setStatusNode('Bidding ended. Combat phase started.', 'ok');
			} catch (err) {
				context.setStatusNode(err.message || 'Unable to end bidding.', 'error');
			} finally {
				context.setOrderBusy(false);
				context.reconcileUi();
			}
			return;
		}

		const confirmed = await showConfirmModal({
			title: 'Confirm End Turn',
			message: 'Resolve this rumble turn now?',
			cancelLabel: 'Cancel',
			confirmLabel: 'End Turn',
		});
		if (!confirmed) {
			return;
		}

		context.setOrderBusy(true);
		context.reconcileUi();
		try {
			await context.api.endRumbleTurn(context.getLastGameId());
			context.localDraft.dirtyAttacks = false;
			context.localDraft.dirtyAbilityActivations = false;
			await context.refreshRumbleState({ silent: true });
			context.setStatusNode('Turn resolved.', 'ok');
		} catch (err) {
			context.setStatusNode(err.message || 'Unable to end turn.', 'error');
		} finally {
			context.setOrderBusy(false);
			context.reconcileUi();
		}
	});

	function reconcile() {
		const canAct = !!context.getLastPerms().can_act;
		const orderBusy = context.isOrderBusy();
		if (context.isBiddingPhase()) {
			const hasSubmitted = context.hasSubmittedBids();
			refs.submitBtn.style.display = canAct && !(hasSubmitted && !context.uiState.isEditing) ? '' : 'none';
			refs.submitBtn.textContent = hasSubmitted ? 'Save Bids' : 'Submit Bids';
			refs.submitBtn.disabled = orderBusy || !canAct;

			refs.editBtn.style.display = canAct && hasSubmitted && !context.uiState.isEditing ? '' : 'none';
			refs.editBtn.textContent = 'Edit Bids';
			refs.editBtn.disabled = orderBusy || !canAct;

			refs.cancelBtn.style.display = canAct && hasSubmitted ? '' : 'none';
			refs.cancelBtn.textContent = 'Cancel Bids';
			refs.cancelBtn.disabled = orderBusy || !canAct;

			refs.phaseActionBtn.style.display = context.getLastPerms().can_delete ? '' : 'none';
			refs.phaseActionBtn.textContent = 'End Bidding';
			refs.phaseActionBtn.disabled = orderBusy || !context.getLastPerms().can_end_turn;
			return;
		}

		const hasSubmitted = context.hasSubmittedOrder();
		refs.submitBtn.style.display = canAct && !(hasSubmitted && !context.uiState.isEditing) ? '' : 'none';
		refs.submitBtn.textContent = hasSubmitted ? 'Save Orders' : 'Submit Orders';
		refs.submitBtn.disabled = orderBusy || !canAct;

		refs.editBtn.style.display = canAct && hasSubmitted && !context.uiState.isEditing ? '' : 'none';
		refs.editBtn.textContent = 'Edit Orders';
		refs.editBtn.disabled = orderBusy || !canAct;

		refs.cancelBtn.style.display = canAct && hasSubmitted ? '' : 'none';
		refs.cancelBtn.textContent = 'Cancel Orders';
		refs.cancelBtn.disabled = orderBusy || !canAct;

		refs.phaseActionBtn.style.display = context.getLastPerms().can_delete ? '' : 'none';
		refs.phaseActionBtn.textContent = 'End Turn';
		refs.phaseActionBtn.disabled = orderBusy || !context.getLastPerms().can_end_turn;
	}

	return {
		root,
		reconcile,
	};
}