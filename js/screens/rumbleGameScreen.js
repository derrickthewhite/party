import { collectRefs, createNodeFromHtml } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';
import {
	activationArrayToMap,
	normalizeAbilityActivationArray,
	normalizeAttacksMap,
	normalizeBidsMap,
} from './rumbleGameScreen/normalization.js';
import { RUMBLE_PANEL_HTML } from './rumbleGameScreen/templates.js';
import { canEditShipName as canEditShipNameModule, createShipNameController } from './rumbleGameScreen/shipName.js';
import { createAdminCheatController } from './rumbleGameScreen/adminCheatPanel.js';
import { bindRefreshHandler, createPhaseControlsController } from './rumbleGameScreen/phaseControls.js';
import { createBiddingPanelController } from './rumbleGameScreen/biddingPanel.js';
import { createCombatPanelController } from './rumbleGameScreen/combatPanel.js';
import { createEventLogsController } from './rumbleGameScreen/eventLogs.js';
import {
	clearDraftDirty as clearRumbleDraftDirty,
	getCheatEligiblePlayers as getCheatEligiblePlayersState,
	getCheatTargetPlayer as getCheatTargetPlayerState,
	getEffectiveAbilityActivationArray as getEffectiveAbilityActivationArrayState,
	getEffectiveAbilityActivationMap as getEffectiveAbilityActivationMapState,
	getEffectiveAttacks as getEffectiveAttacksState,
	getEffectiveBids as getEffectiveBidsState,
	getSelectedCheatAbilityIds as getSelectedCheatAbilityIdsState,
	getParsedCheatHealth as getParsedCheatHealthState,
	getSelfOwnedAbilities as getSelfOwnedAbilitiesState,
	getSelfPlayer as getSelfPlayerState,
	hasSubmittedBids as hasSubmittedBidsState,
	hasSubmittedOrder as hasSubmittedOrderState,
	isBiddingPhase as getIsBiddingPhase,
} from './rumbleGameScreen/state.js';
import {
	describeActivationReadonly as describeActivationReadonlyValidation,
	describeOrder as describeOrderValidation,
	getBidValidation as getBidValidationFromState,
	getOrderValidation as getOrderValidationFromState,
} from './rumbleGameScreen/validation.js';

export function createRumbleGameScreen(deps) {
	const panel = createNodeFromHtml(RUMBLE_PANEL_HTML);
	const refs = collectRefs(panel);
	const refreshBtn = refs.refreshBtn;
	const phaseTitle = refs.phaseTitle;
	const progressText = refs.progressText;

	panel.style.marginTop = '8px';
	refs.headerSpacer.style.flex = '1';

	let lastGameId = null;
	let lastPerms = {};
	let lastMemberRole = 'none';
	let setStatusNode = function noop() {};
	let refreshBusy = false;
	let orderBusy = false;
	let shipNameBusy = false;
	let adminCheatBusy = false;
	let autoRefreshId = null;

	const serverSnapshot = {
		phaseMode: 'bidding',
		roundNumber: 1,
		submittedCount: 0,
		participantCount: 0,
		players: [],
		abilityCatalog: [],
		offeredAbilities: [],
		currentBids: null,
		currentOrder: null,
		previousRoundOrders: [],
		currentRoundEventLog: [],
		previousRoundEventLog: [],
		selfShipName: '',
	};

	const localDraft = {
		attacks: {},
		abilityActivations: {},
		bids: {},
		dirtyAttacks: false,
		dirtyAbilityActivations: false,
		dirtyBids: false,
		shipName: '',
		dirtyShipName: false,
		adminCheatTargetUserId: '',
		adminCheatSelections: {},
		adminCheatHealthValue: '',
		adminCheatHealthDirty: false,
	};

	const uiState = {
		isEditing: true,
		adminCheatExpanded: false,
	};

	function isBiddingPhase() {
		return getIsBiddingPhase(serverSnapshot);
	}

	function clearDraftDirty() {
		clearRumbleDraftDirty(localDraft);
	}

	function getLastPerms() {
		return lastPerms;
	}

	function getLastGameId() {
		return lastGameId;
	}

	function isOrderBusy() {
		return orderBusy;
	}

	function setOrderBusy(value) {
		orderBusy = value;
	}

	function isShipNameBusy() {
		return shipNameBusy;
	}

	function setShipNameBusy(value) {
		shipNameBusy = value;
	}

	function isAdminCheatBusy() {
		return adminCheatBusy;
	}

	function setAdminCheatBusy(value) {
		adminCheatBusy = value;
	}

	function isAdminCheatVisible() {
		const currentState = deps.state.state || {};
		const user = currentState.user || null;
		const activeGame = currentState.activeGame || null;
		return !!(user && user.is_admin)
			&& !!currentState.adminUiEnabled
			&& !!lastGameId
			&& !!activeGame
			&& String(activeGame.status || '') === 'in_progress';
	}

	function getCheatEligiblePlayers() {
		return getCheatEligiblePlayersState(serverSnapshot);
	}

	function getSelectedCheatAbilityIds() {
		return getSelectedCheatAbilityIdsState(localDraft);
	}

	function getSelfOwnedAbilities() {
		return getSelfOwnedAbilitiesState(serverSnapshot);
	}

	function getParsedCheatHealth() {
		return getParsedCheatHealthState(localDraft);
	}

	function getEffectiveAbilityActivationMap() {
		return getEffectiveAbilityActivationMapState(serverSnapshot, localDraft, uiState);
	}

	function getEffectiveAbilityActivationArray() {
		return getEffectiveAbilityActivationArrayState(serverSnapshot, localDraft, uiState);
	}

	function describeOrder(order) {
		return describeOrderValidation(order, serverSnapshot.players);
	}

	function getSelfPlayer() {
		return getSelfPlayerState(serverSnapshot);
	}

	function getCheatTargetPlayer() {
		return getCheatTargetPlayerState(serverSnapshot, localDraft);
	}

	function hasSubmittedOrder() {
		return hasSubmittedOrderState(serverSnapshot);
	}

	function hasSubmittedBids() {
		return hasSubmittedBidsState(serverSnapshot);
	}

	function getEffectiveAttacks() {
		return getEffectiveAttacksState(serverSnapshot, localDraft, uiState);
	}

	function getEffectiveBids() {
		return getEffectiveBidsState(serverSnapshot, localDraft, uiState);
	}

	function getOrderValidation() {
		return getOrderValidationFromState({
			canAct: !!lastPerms.can_act,
			selfPlayer: getSelfPlayer(),
			hasSubmittedOrder: hasSubmittedOrder(),
			isEditing: uiState.isEditing,
			currentOrder: serverSnapshot.currentOrder,
			players: serverSnapshot.players,
			effectiveAttacks: getEffectiveAttacks(),
			effectiveAbilityActivationMap: getEffectiveAbilityActivationMap(),
			selfOwnedAbilities: getSelfOwnedAbilities(),
		});
	}

	function getBidValidation() {
		return getBidValidationFromState({
			offeredAbilities: serverSnapshot.offeredAbilities,
			effectiveBids: getEffectiveBids(),
		});
	}

	function canEditShipName() {
		return canEditShipNameModule(lastMemberRole);
	}

	function describeActivationReadonly(ability, activationMap) {
		return describeActivationReadonlyValidation(ability, activationMap, serverSnapshot.players);
	}

	const shipNameController = createShipNameController({
		api: deps.api,
		localDraft,
		serverSnapshot,
		canEditShipName,
		getLastGameId,
		isShipNameBusy,
		setShipNameBusy,
		reconcileUi,
		refreshRumbleState,
		setStatusNode: function setControllerStatusNode(text, kind) {
			setStatusNode(text, kind);
		},
	});
	refs.shipNameMount.appendChild(shipNameController.root);

	const biddingPanelController = createBiddingPanelController({
		localDraft,
		serverSnapshot,
		uiState,
		getLastPerms,
		isOrderBusy,
		reconcileUi,
		hasSubmittedBids,
		getBidValidation,
	});
	refs.biddingMount.appendChild(biddingPanelController.root);

	const combatPanelController = createCombatPanelController({
		serverSnapshot,
		localDraft,
		uiState,
		getLastPerms,
		isOrderBusy,
		reconcileUi,
		hasSubmittedOrder,
		getOrderValidation,
		getSelfPlayer,
		getSelfOwnedAbilities,
		getEffectiveAbilityActivationMap,
		isBiddingPhase,
		describeActivationReadonly,
	});
	refs.battleMount.appendChild(combatPanelController.root);

	const phaseControlsController = createPhaseControlsController({
		api: deps.api,
		localDraft,
		uiState,
		serverSnapshot,
		getBidValidation,
		getOrderValidation,
		getEffectiveAbilityActivationArray,
		isBiddingPhase,
		hasSubmittedBids,
		hasSubmittedOrder,
		clearDraftDirty,
		refreshRumbleState,
		reconcileUi,
		setStatusNode: function setControllerStatusNode(text, kind) {
			setStatusNode(text, kind);
		},
		getLastGameId,
		getLastPerms,
		isOrderBusy,
		setOrderBusy,
	});
	refs.phaseControlsMount.appendChild(phaseControlsController.root);

	const eventLogsController = createEventLogsController({
		serverSnapshot,
		describeOrder,
		isBiddingPhase,
	});
	refs.eventLogsMount.appendChild(eventLogsController.root);

	const adminCheatController = createAdminCheatController({
		api: deps.api,
		uiState,
		localDraft,
		serverSnapshot,
		isAdminCheatVisible,
		getCheatEligiblePlayers,
		getCheatTargetPlayer,
		getSelectedCheatAbilityIds,
		getParsedCheatHealth,
		getLastGameId,
		isAdminCheatBusy,
		setAdminCheatBusy,
		reconcileUi,
		refreshRumbleState,
		setStatusNode: function setControllerStatusNode(text, kind) {
			setStatusNode(text, kind);
		},
	});
	refs.adminCheatMount.appendChild(adminCheatController.root);

	function reconcileUi() {
		const bidding = isBiddingPhase();
		shipNameController.reconcile();
		adminCheatController.reconcile();
		phaseControlsController.reconcile();
		biddingPanelController.setVisible(bidding);
		combatPanelController.setVisible(!bidding);

		if (bidding) {
			phaseTitle.textContent = 'Rumble Bidding';
			progressText.textContent = 'Bidding submissions: ' + serverSnapshot.submittedCount + '/' + serverSnapshot.participantCount;
			biddingPanelController.reconcile();
		} else {
			phaseTitle.textContent = 'Rumble Combat';
			progressText.textContent = 'Round ' + serverSnapshot.roundNumber + ' players submitted: ' + serverSnapshot.submittedCount + '/' + serverSnapshot.participantCount;
			combatPanelController.reconcile();
		}

		eventLogsController.reconcile();
	}

	function applyServerSnapshot(game) {
		const progress = game && game.rumble_turn_progress ? game.rumble_turn_progress : null;
		const phaseMode = String(progress && progress.phase_mode ? progress.phase_mode : (game && game.phase ? game.phase : 'bidding')).toLowerCase() === 'battle' ? 'battle' : 'bidding';
		const roundNumber = Number(progress && progress.round_number ? progress.round_number : (game && game.current_round ? game.current_round : 1));
		const submittedCount = Number(progress && progress.submitted_count ? progress.submitted_count : 0);
		const participantCount = Number(progress && progress.participant_count ? progress.participant_count : 0);

		const nextPlayersRaw = progress && Array.isArray(progress.players) ? progress.players : [];
		const selfPlayers = nextPlayersRaw.filter(function eachPlayer(player) {
			return !!player.is_self;
		});
		const otherPlayers = nextPlayersRaw.filter(function eachPlayer(player) {
			return !player.is_self;
		});
		const nextPlayers = selfPlayers.concat(otherPlayers);
		const nextAbilityCatalog = progress && Array.isArray(progress.ability_catalog) ? progress.ability_catalog : [];
		const nextOfferedAbilities = progress && Array.isArray(progress.offered_abilities) ? progress.offered_abilities : [];
		const nextBids = progress && progress.current_bids !== null && typeof progress.current_bids === 'object'
			? normalizeBidsMap(progress.current_bids)
			: null;
		const nextOrder = progress && progress.current_order ? progress.current_order : null;
		const nextPreviousOrders = progress && Array.isArray(progress.previous_round_orders) ? progress.previous_round_orders : [];
		const nextCurrentRoundEvents = progress && Array.isArray(progress.current_round_event_log) ? progress.current_round_event_log : [];
		const nextPreviousRoundEvents = progress && Array.isArray(progress.previous_round_event_log) ? progress.previous_round_event_log : [];
		const nextSelfPlayer = nextPlayers.find(function eachPlayer(player) {
			return !!player.is_self;
		}) || null;
		const nextSelfShipName = nextSelfPlayer
			? String(nextSelfPlayer.ship_name || nextSelfPlayer.username || '')
			: '';

		const phaseChanged = phaseMode !== serverSnapshot.phaseMode;
		const roundChanged = roundNumber !== serverSnapshot.roundNumber;
		const hadOrder = !!serverSnapshot.currentOrder;
		const hasOrderNow = !!nextOrder;
		const hadBids = serverSnapshot.currentBids !== null;
		const hasBidsNow = nextBids !== null;

		serverSnapshot.phaseMode = phaseMode;
		serverSnapshot.roundNumber = roundNumber;
		serverSnapshot.submittedCount = submittedCount;
		serverSnapshot.participantCount = participantCount;
		serverSnapshot.players = nextPlayers;
		serverSnapshot.abilityCatalog = nextAbilityCatalog;
		serverSnapshot.offeredAbilities = nextOfferedAbilities;
		serverSnapshot.currentBids = nextBids;
		serverSnapshot.currentOrder = hasOrderNow ? {
			attacks: normalizeAttacksMap(nextOrder.attacks || {}),
			ability_activations: normalizeAbilityActivationArray(nextOrder.ability_activations || []),
			defense: Math.max(0, Number(nextOrder.defense || 0)),
			energy_budget: Math.max(0, Number(nextOrder.energy_budget || 0)),
			attack_energy_spent: Math.max(0, Number(nextOrder.attack_energy_spent || 0)),
			ability_energy_spent: Math.max(0, Number(nextOrder.ability_energy_spent || 0)),
			total_energy_spent: Math.max(0, Number(nextOrder.total_energy_spent || 0)),
		} : null;
		serverSnapshot.previousRoundOrders = nextPreviousOrders;
		serverSnapshot.currentRoundEventLog = nextCurrentRoundEvents;
		serverSnapshot.previousRoundEventLog = nextPreviousRoundEvents;
		serverSnapshot.selfShipName = nextSelfShipName;

		if (!localDraft.dirtyShipName) {
			localDraft.shipName = nextSelfShipName;
		}

		if (phaseChanged) {
			if (isBiddingPhase()) {
				uiState.isEditing = !hasBidsNow;
				localDraft.bids = hasBidsNow ? normalizeBidsMap(nextBids || {}) : {};
			} else {
				uiState.isEditing = !hasOrderNow;
				localDraft.attacks = hasOrderNow ? normalizeAttacksMap(nextOrder.attacks || {}) : {};
				localDraft.abilityActivations = hasOrderNow ? activationArrayToMap(nextOrder.ability_activations || []) : {};
			}
			clearDraftDirty();
			localDraft.dirtyAbilityActivations = false;
		} else if (isBiddingPhase()) {
			if (roundChanged) {
				uiState.isEditing = !hasBidsNow;
				localDraft.bids = hasBidsNow ? normalizeBidsMap(nextBids || {}) : {};
				localDraft.dirtyBids = false;
			} else if (!hadBids && hasBidsNow) {
				uiState.isEditing = false;
				localDraft.bids = normalizeBidsMap(nextBids || {});
				localDraft.dirtyBids = false;
			} else if (hadBids && !hasBidsNow && !localDraft.dirtyBids) {
				uiState.isEditing = true;
				localDraft.bids = {};
				localDraft.dirtyBids = false;
			} else if (!localDraft.dirtyBids && uiState.isEditing && hasBidsNow) {
				localDraft.bids = normalizeBidsMap(nextBids || {});
			}
		} else if (roundChanged) {
			uiState.isEditing = !hasOrderNow;
			localDraft.attacks = hasOrderNow ? normalizeAttacksMap(nextOrder.attacks || {}) : {};
			localDraft.dirtyAttacks = false;
			localDraft.abilityActivations = hasOrderNow ? activationArrayToMap(nextOrder.ability_activations || []) : {};
			localDraft.dirtyAbilityActivations = false;
		} else if (!hadOrder && hasOrderNow) {
			uiState.isEditing = false;
			localDraft.attacks = normalizeAttacksMap(nextOrder.attacks || {});
			localDraft.dirtyAttacks = false;
			localDraft.abilityActivations = activationArrayToMap(nextOrder.ability_activations || []);
			localDraft.dirtyAbilityActivations = false;
		} else if (hadOrder && !hasOrderNow && !localDraft.dirtyAttacks && !localDraft.dirtyAbilityActivations) {
			uiState.isEditing = true;
			localDraft.attacks = {};
			localDraft.dirtyAttacks = false;
			localDraft.abilityActivations = {};
			localDraft.dirtyAbilityActivations = false;
		} else if (!localDraft.dirtyAttacks && !localDraft.dirtyAbilityActivations && uiState.isEditing && hasOrderNow) {
			localDraft.attacks = normalizeAttacksMap(nextOrder.attacks || {});
			localDraft.abilityActivations = activationArrayToMap(nextOrder.ability_activations || []);
		}

		reconcileUi();
	}

	async function refreshRumbleState(options) {
		if (!lastGameId || refreshBusy) {
			return;
		}

		const config = options || {};
		refreshBusy = true;
		refreshBtn.disabled = true;
		refreshBtn.textContent = 'Refreshing...';
		try {
			const detail = await deps.api.gameDetail(lastGameId);
			deps.state.patch({ activeGame: detail.game });
			screen.setGame(detail.game);
			if (!config.silent) {
				setStatusNode('Rumble updates refreshed.', 'ok');
			}
		} catch (err) {
			setStatusNode(err.message || 'Unable to refresh rumble updates.', 'error');
		} finally {
			refreshBusy = false;
			refreshBtn.disabled = false;
			refreshBtn.textContent = 'Refresh';
		}
	}

	function stopAutoRefresh() {
		if (autoRefreshId === null) {
			return;
		}

		clearInterval(autoRefreshId);
		autoRefreshId = null;
	}

	function startAutoRefresh() {
		if (autoRefreshId !== null) {
			return;
		}

		autoRefreshId = setInterval(function autoRefreshTick() {
			const current = deps.state.state;
			const isRumbleScreen = current.screen === 'game'
				&& current.activeGame
				&& String(current.activeGame.game_type || '').toLowerCase() === 'rumble';
			if (!isRumbleScreen) {
				stopAutoRefresh();
				return;
			}

			refreshRumbleState({ silent: true });
		}, 5000);
	}

	const screen = createBaseGameScreen(deps, {
		title: 'Rumble Game',
		titleSuffix: 'Rumble',
		showActionComposer: false,
		onSetGame: function onSetGame(context) {
			lastGameId = context.game.id;
			lastPerms = context.game.permissions || {};
			lastMemberRole = String(context.game.member_role || 'none').toLowerCase();
			setStatusNode = context.setStatusNode;

			context.nodes.composerRow.style.display = '';
			context.nodes.actionRow.style.display = 'none';
			screen.setTypePanel(panel);
			applyServerSnapshot(context.game);
			startAutoRefresh();
		},
	});

	deps.state.subscribe(function onStateChanged(current) {
		const isRumbleScreen = current.screen === 'game'
			&& current.activeGame
			&& String(current.activeGame.game_type || '').toLowerCase() === 'rumble';
		if (!isRumbleScreen) {
			stopAutoRefresh();
		}
	});

	bindRefreshHandler({
		refreshBtn,
		refreshRumbleState,
	});

	return screen;
}
