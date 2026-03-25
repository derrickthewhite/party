import { showConfirmModal } from '../dom.js';
import { activationArrayToMap, normalizeAttacksMap, normalizeBidsMap } from './normalization.js';

export function bindRefreshHandler(context) {
	context.refreshBtn.addEventListener('click', function onRefreshClick() {
		context.refreshRumbleState({ silent: false });
	});
}

export function bindPhaseControlHandlers(context) {
	context.submitBtn.addEventListener('click', async function onSubmitOrder() {
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

	context.editBtn.addEventListener('click', function onEditOrders() {
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

	context.cancelBtn.addEventListener('click', async function onCancelOrder() {
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

	context.phaseActionBtn.addEventListener('click', async function onPhaseAction() {
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
}