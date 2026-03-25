import { collectRefs, createNodeFromHtml, createTemplate } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';
import {
	activationArrayToMap,
	normalizeAbilityActivationArray,
	normalizeAttacksMap,
	normalizeBidsMap,
} from './rumbleGameScreen/normalization.js';
import {
	ABILITY_ACTIVATION_ROW_TEMPLATE_HTML,
	ABILITY_ROW_TEMPLATE_HTML,
	ADMIN_CHEAT_ABILITY_ROW_TEMPLATE_HTML,
	EVENT_LOG_TEMPLATE_HTML,
	PLAYER_ROW_TEMPLATE_HTML,
	PREVIOUS_ORDER_TEMPLATE_HTML,
	RUMBLE_PANEL_HTML,
} from './rumbleGameScreen/templates.js';
import {
	bindShipNameHandlers,
	canEditShipName as canEditShipNameModule,
	reconcileShipNameEditor as reconcileShipNameEditorModule,
} from './rumbleGameScreen/shipName.js';
import {
	bindAdminCheatHandlers,
	clearAdminCheatSelections as clearAdminCheatSelectionsModule,
	ensureAdminCheatAbilityRow as ensureAdminCheatAbilityRowModule,
	reconcileAdminCheatPanel as reconcileAdminCheatPanelModule,
} from './rumbleGameScreen/adminCheatPanel.js';
import { bindPhaseControlHandlers, bindRefreshHandler } from './rumbleGameScreen/phaseControls.js';
import { ensureAbilityRow as ensureAbilityRowModule, reconcileAbilitiesList as reconcileAbilitiesListModule } from './rumbleGameScreen/biddingPanel.js';
import {
	ensurePlayerRow as ensurePlayerRowModule,
	reconcileOwnedAbilities as reconcileOwnedAbilitiesModule,
	reconcilePlayersList as reconcilePlayersListModule,
} from './rumbleGameScreen/playersList.js';
import {
	ensureAbilityActivationRow as ensureAbilityActivationRowModule,
	reconcileAbilityActivationList as reconcileAbilityActivationListModule,
} from './rumbleGameScreen/abilityActivations.js';
import {
	ensureEventRow as ensureEventRowModule,
	reconcileEventLogList as reconcileEventLogListModule,
	reconcilePreviousOrdersList as reconcilePreviousOrdersListModule,
} from './rumbleGameScreen/eventLogs.js';
import {
	clearDraftDirty as clearRumbleDraftDirty,
	getCheatEligiblePlayers as getCheatEligiblePlayersState,
	getCheatTargetPlayer as getCheatTargetPlayerState,
	getEffectiveAbilityActivationArray as getEffectiveAbilityActivationArrayState,
	getEffectiveAbilityActivationMap as getEffectiveAbilityActivationMapState,
	getEffectiveAttacks as getEffectiveAttacksState,
	getEffectiveBids as getEffectiveBidsState,
	getSelectedCheatAbilityIds as getSelectedCheatAbilityIdsState,
	getSelfOwnedAbilities as getSelfOwnedAbilitiesState,
	getSelfPlayer as getSelfPlayerState,
	hasSubmittedBids as hasSubmittedBidsState,
	hasSubmittedOrder as hasSubmittedOrderState,
	isBiddingPhase as getIsBiddingPhase,
	isDraftDirty as getIsDraftDirty,
} from './rumbleGameScreen/state.js';
import {
	describeActivationReadonly as describeActivationReadonlyValidation,
	describeOrder as describeOrderValidation,
	getAttackTotal as getAttackTotalValidation,
	getBidTotal as getBidTotalValidation,
	getBidValidation as getBidValidationFromState,
	getDraftActivationSummary as getDraftActivationSummaryValidation,
	getOrderValidation as getOrderValidationFromState,
	playerNameById as playerNameByIdValidation,
} from './rumbleGameScreen/validation.js';

export function createRumbleGameScreen(deps) {
	const panel = createNodeFromHtml(RUMBLE_PANEL_HTML);
	const refs = collectRefs(panel);
	const abilityRowTemplate = createTemplate(ABILITY_ROW_TEMPLATE_HTML);
	const playerRowTemplate = createTemplate(PLAYER_ROW_TEMPLATE_HTML);
	const abilityActivationRowTemplate = createTemplate(ABILITY_ACTIVATION_ROW_TEMPLATE_HTML);
	const adminCheatAbilityRowTemplate = createTemplate(ADMIN_CHEAT_ABILITY_ROW_TEMPLATE_HTML);
	const previousOrderTemplate = createTemplate(PREVIOUS_ORDER_TEMPLATE_HTML);
	const eventLogTemplate = createTemplate(EVENT_LOG_TEMPLATE_HTML);
	const refreshBtn = refs.refreshBtn;
	const phaseTitle = refs.phaseTitle;
	const progressText = refs.progressText;
	const shipNameRow = refs.shipNameRow;
	const shipNameInput = refs.shipNameInput;
	const saveShipNameBtn = refs.saveShipNameBtn;
	const shipNameHint = refs.shipNameHint;
	const adminCheatToggleRow = refs.adminCheatToggleRow;
	const adminCheatToggleBtn = refs.adminCheatToggleBtn;
	const adminCheatToggleHint = refs.adminCheatToggleHint;
	const adminCheatPanel = refs.adminCheatPanel;
	const adminCheatSummary = refs.adminCheatSummary;
	const adminCheatHint = refs.adminCheatHint;
	const adminCheatTargetSelect = refs.adminCheatTargetSelect;
	const adminCheatSubmitBtn = refs.adminCheatSubmitBtn;
	const adminCheatClearBtn = refs.adminCheatClearBtn;
	const adminCheatAbilityList = refs.adminCheatAbilityList;
	const adminCheatEmptyText = refs.adminCheatEmptyText;
	const biddingPanel = refs.biddingPanel;
	const bidHelpText = refs.bidHelpText;
	const bidValidationText = refs.bidValidationText;
	const abilitiesList = refs.abilitiesList;
	const battlePanel = refs.battlePanel;
	const defenseText = refs.defenseText;
	const energyText = refs.energyText;
	const attackHelpText = refs.attackHelpText;
	const orderValidationText = refs.orderValidationText;
	const playersList = refs.playersList;
	const abilityActivationPanel = refs.abilityActivationPanel;
	const abilityActivationHelpText = refs.abilityActivationHelpText;
	const abilityValidationText = refs.abilityValidationText;
	const abilityActivationList = refs.abilityActivationList;
	const submitBtn = refs.submitBtn;
	const editBtn = refs.editBtn;
	const cancelBtn = refs.cancelBtn;
	const phaseActionBtn = refs.phaseActionBtn;
	const lastTurnList = refs.lastTurnList;
	const emptyPreviousOrdersNode = refs.emptyPreviousOrdersNode;
	const currentEventLogTitle = refs.currentEventLogTitle;
	const currentEventLogList = refs.currentEventLogList;
	const emptyCurrentEventLogNode = refs.emptyCurrentEventLogNode;
	const previousEventLogTitle = refs.previousEventLogTitle;
	const previousEventLogList = refs.previousEventLogList;
	const emptyPreviousEventLogNode = refs.emptyPreviousEventLogNode;

	panel.style.marginTop = '8px';
	refs.headerSpacer.style.flex = '1';
	bidHelpText.style.margin = '4px 0 8px 0';
	bidValidationText.style.margin = '0 0 8px 0';
	bidValidationText.style.fontWeight = '600';
	defenseText.style.margin = '8px 0 6px 0';
	defenseText.style.fontWeight = '600';
	energyText.style.margin = '0 0 6px 0';
	energyText.style.fontWeight = '600';
	shipNameInput.style.flex = '1';
	attackHelpText.style.margin = '4px 0 8px 0';
	orderValidationText.style.margin = '0 0 8px 0';
	orderValidationText.style.fontWeight = '600';
	abilityActivationHelpText.style.margin = '4px 0 8px 0';
	abilityValidationText.style.margin = '0 0 8px 0';
	abilityValidationText.style.fontWeight = '600';
	refs.buttonRow.style.marginTop = '8px';
	refs.lastTurnTitle.style.marginTop = '10px';
	currentEventLogTitle.style.marginTop = '10px';
	previousEventLogTitle.style.marginTop = '10px';

	let lastGameId = null;
	let lastRound = 1;
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
	};

	const uiState = {
		isEditing: true,
		adminCheatExpanded: false,
	};

	const abilityRowsById = new Map();
	const playerRowsById = new Map();
	const abilityActivationRowsById = new Map();
	const adminCheatAbilityRowsById = new Map();
	const previousOrderRowsById = new Map();
	const currentEventRowsById = new Map();
	const previousEventRowsById = new Map();
	const adminCheatTargetOptionByValue = new Map();

	function isBiddingPhase() {
		return getIsBiddingPhase(serverSnapshot);
	}

	function isDraftDirty() {
		return getIsDraftDirty(serverSnapshot, localDraft);
	}

	function clearDraftDirty() {
		clearRumbleDraftDirty(localDraft);
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

	function clearAdminCheatSelections() {
		clearAdminCheatSelectionsModule({ localDraft });
	}

	function getSelfOwnedAbilities() {
		return getSelfOwnedAbilitiesState(serverSnapshot);
	}

	function getEffectiveAbilityActivationMap() {
		return getEffectiveAbilityActivationMapState(serverSnapshot, localDraft, uiState);
	}

	function getDraftActivationSummary() {
		return getDraftActivationSummaryValidation({
			hasSubmittedOrder: hasSubmittedOrder(),
			isEditing: uiState.isEditing,
			currentOrder: serverSnapshot.currentOrder,
			activationMap: getEffectiveAbilityActivationMap(),
			selfOwnedAbilities: getSelfOwnedAbilities(),
		});
	}

	function getEffectiveAbilityActivationArray() {
		return getEffectiveAbilityActivationArrayState(serverSnapshot, localDraft, uiState);
	}

	function playerNameById(userId) {
		return playerNameByIdValidation(serverSnapshot.players, userId);
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

	function getAttackTotal() {
		return getAttackTotalValidation(getEffectiveAttacks());
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

	function getBidTotal() {
		return getBidTotalValidation(getEffectiveBids());
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

	function reconcileShipNameEditor() {
		reconcileShipNameEditorModule({
			canEditShipName,
			localDraft,
			serverSnapshot,
			shipNameRow,
			shipNameHint,
			shipNameInput,
			saveShipNameBtn,
			shipNameBusy,
		});
	}

	function ensureAbilityRow(ability) {
		return ensureAbilityRowModule({
			abilityRowsById,
			abilityRowTemplate,
			abilitiesList,
			localDraft,
			reconcileUi,
		}, ability);
	}

	function reconcileAbilitiesList() {
		reconcileAbilitiesListModule({
			abilityRowsById,
			abilityRowTemplate,
			abilitiesList,
			serverSnapshot,
			localDraft,
			lastPerms,
			uiState,
			orderBusy,
			reconcileUi,
			hasSubmittedBids,
		});
	}

	function ensurePlayerRow(player) {
		return ensurePlayerRowModule({
			playerRowsById,
			playerRowTemplate,
			playersList,
			localDraft,
			reconcileUi,
		}, player);
	}

	function reconcileOwnedAbilities(refs, ownedAbilities) {
		reconcileOwnedAbilitiesModule(refs, ownedAbilities);
	}

	function ensureAbilityActivationRow(ability) {
		return ensureAbilityActivationRowModule({
			abilityActivationRowsById,
			abilityActivationRowTemplate,
			abilityActivationList,
			localDraft,
			reconcileUi,
		}, ability);
	}

	function ensureAdminCheatAbilityRow(ability) {
		return ensureAdminCheatAbilityRowModule({
			adminCheatAbilityRowsById,
			adminCheatAbilityRowTemplate,
			adminCheatAbilityList,
			localDraft,
			reconcileUi,
		}, ability);
	}

	function reconcileAdminCheatPanel() {
		reconcileAdminCheatPanelModule({
			uiState,
			localDraft,
			serverSnapshot,
			adminCheatBusy,
			adminCheatToggleRow,
			adminCheatToggleBtn,
			adminCheatToggleHint,
			adminCheatPanel,
			adminCheatTargetSelect,
			adminCheatTargetOptionByValue,
			adminCheatAbilityRowsById,
			adminCheatAbilityRowTemplate,
			adminCheatAbilityList,
			adminCheatHint,
			adminCheatSummary,
			adminCheatSubmitBtn,
			adminCheatClearBtn,
			adminCheatEmptyText,
			isAdminCheatVisible,
			getCheatEligiblePlayers,
			getCheatTargetPlayer,
			getSelectedCheatAbilityIds,
			reconcileUi,
		});
	}

	function describeActivationReadonly(ability, activationMap) {
		return describeActivationReadonlyValidation(ability, activationMap, serverSnapshot.players);
	}

	function reconcileAbilityActivationList() {
		reconcileAbilityActivationListModule({
			abilityActivationRowsById,
			abilityActivationRowTemplate,
			abilityActivationList,
			serverSnapshot,
			localDraft,
			uiState,
			lastPerms,
			orderBusy,
			reconcileUi,
			getSelfOwnedAbilities,
			getEffectiveAbilityActivationMap,
			isBiddingPhase,
			describeActivationReadonly,
		});
	}

	function ensureEventRow(eventListMap, key, listNode) {
		return ensureEventRowModule({ eventLogTemplate }, eventListMap, key, listNode);
	}

	function reconcileEventLogList(events, listNode, emptyNode, rowMap, labelPrefix) {
		reconcileEventLogListModule({ eventLogTemplate }, {
			events,
			listNode,
			emptyNode,
			rowMap,
			labelPrefix,
		});
	}

	function reconcilePlayersList() {
		reconcilePlayersListModule({
			playerRowsById,
			playerRowTemplate,
			playersList,
			serverSnapshot,
			localDraft,
			lastPerms,
			uiState,
			orderBusy,
			reconcileUi,
			hasSubmittedOrder,
		});
	}

	function reconcilePreviousOrdersList() {
		reconcilePreviousOrdersListModule({
			serverSnapshot,
			previousOrderRowsById,
			previousOrderTemplate,
			lastTurnList,
			emptyPreviousOrdersNode,
			describeOrder,
		});
	}

	function reconcileUi() {
		const canAct = !!lastPerms.can_act;
		const bidding = isBiddingPhase();
		reconcileShipNameEditor();
		reconcileAdminCheatPanel();

		biddingPanel.style.display = bidding ? '' : 'none';
		battlePanel.style.display = bidding ? 'none' : '';
		lastTurnList.style.display = bidding ? 'none' : '';
		refs.lastTurnTitle.style.display = bidding ? 'none' : '';
		currentEventLogTitle.style.display = bidding ? 'none' : '';
		currentEventLogList.style.display = bidding ? 'none' : '';
		previousEventLogTitle.style.display = bidding ? 'none' : '';
		previousEventLogList.style.display = bidding ? 'none' : '';

		if (bidding) {
			phaseTitle.textContent = 'Rumble Bidding';
			progressText.textContent = 'Bidding submissions: ' + serverSnapshot.submittedCount + '/' + serverSnapshot.participantCount;

			const bidValidation = getBidValidation();
			if (bidValidation.invalidAbilityIds.length > 0) {
				bidValidationText.textContent = 'Bids are invalid: one or more offered abilities are unavailable.';
				bidValidationText.style.color = '#b42318';
			} else {
				bidValidationText.textContent = 'Total bid: ' + bidValidation.totalBid;
				bidValidationText.style.color = '';
			}

			const hasSubmitted = hasSubmittedBids();
			submitBtn.style.display = canAct && !(hasSubmitted && !uiState.isEditing) ? '' : 'none';
			submitBtn.textContent = hasSubmitted ? 'Save Bids' : 'Submit Bids';
			submitBtn.disabled = orderBusy || !canAct;

			editBtn.style.display = canAct && hasSubmitted && !uiState.isEditing ? '' : 'none';
			editBtn.textContent = 'Edit Bids';
			editBtn.disabled = orderBusy || !canAct;

			cancelBtn.style.display = canAct && hasSubmitted ? '' : 'none';
			cancelBtn.textContent = 'Cancel Bids';
			cancelBtn.disabled = orderBusy || !canAct;

			phaseActionBtn.style.display = lastPerms.can_delete ? '' : 'none';
			phaseActionBtn.textContent = 'End Bidding';
			phaseActionBtn.disabled = orderBusy || !lastPerms.can_end_turn;

			reconcileAbilitiesList();
			return;
		}

		phaseTitle.textContent = 'Rumble Combat';
		progressText.textContent = 'Round ' + serverSnapshot.roundNumber + ' players submitted: ' + serverSnapshot.submittedCount + '/' + serverSnapshot.participantCount;

		const selfPlayer = getSelfPlayer();
		const validation = getOrderValidation();
		if (!selfPlayer) {
			defenseText.textContent = 'Defense: n/a';
			orderValidationText.textContent = '';
			orderValidationText.style.color = '';
		} else if (validation.invalidDefense) {
			defenseText.textContent = 'Defense: ' + validation.defense + ' (invalid: defense cannot be negative)';
			orderValidationText.textContent = 'Orders are invalid: total attacks exceed your available power.';
			orderValidationText.style.color = '#b42318';
		} else {
			defenseText.textContent = 'Defense: ' + validation.defense;
			if (validation.invalidTargets.length > 0) {
				orderValidationText.textContent = 'Orders are invalid: remove attacks assigned to defeated or unavailable players.';
				orderValidationText.style.color = '#b42318';
			} else {
				orderValidationText.textContent = '';
				orderValidationText.style.color = '';
			}
		}

		const hasSubmitted = hasSubmittedOrder();
		submitBtn.style.display = canAct && !(hasSubmitted && !uiState.isEditing) ? '' : 'none';
		submitBtn.textContent = hasSubmitted ? 'Save Orders' : 'Submit Orders';
		submitBtn.disabled = orderBusy || !canAct;

		editBtn.style.display = canAct && hasSubmitted && !uiState.isEditing ? '' : 'none';
		editBtn.textContent = 'Edit Orders';
		editBtn.disabled = orderBusy || !canAct;

		cancelBtn.style.display = canAct && hasSubmitted ? '' : 'none';
		cancelBtn.textContent = 'Cancel Orders';
		cancelBtn.disabled = orderBusy || !canAct;

		phaseActionBtn.style.display = lastPerms.can_delete ? '' : 'none';
		phaseActionBtn.textContent = 'End Turn';
		phaseActionBtn.disabled = orderBusy || !lastPerms.can_end_turn;

		reconcilePlayersList();
		reconcilePreviousOrdersList();
		reconcileAbilityActivationList();
		reconcileEventLogList(serverSnapshot.currentRoundEventLog, currentEventLogList, emptyCurrentEventLogNode, currentEventRowsById, 'Current Round');
		reconcileEventLogList(serverSnapshot.previousRoundEventLog, previousEventLogList, emptyPreviousEventLogNode, previousEventRowsById, 'Previous Round');

		energyText.textContent = 'Energy: ' + validation.energyBudget
			+ ' | Attacks: ' + validation.attackEnergySpent
			+ ' | Abilities: ' + validation.abilityEnergySpent
			+ ' | Remaining: ' + validation.remainingEnergy;

		if (validation.invalidAbilityTargets.length > 0) {
			abilityValidationText.textContent = 'Ability activation invalid: one or more targets are defeated or unavailable.';
			abilityValidationText.style.color = '#b42318';
		} else if (validation.missingAbilityTargets.length > 0) {
			abilityValidationText.textContent = 'Ability activation invalid: choose targets for enabled targeted abilities.';
			abilityValidationText.style.color = '#b42318';
		} else if (validation.invalidEnergy) {
			abilityValidationText.textContent = 'Energy invalid: total attack + ability spend exceeds your round energy budget.';
			abilityValidationText.style.color = '#b42318';
		} else {
			abilityValidationText.textContent = '';
			abilityValidationText.style.color = '';
		}

		abilityActivationPanel.style.display = '';
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

		lastRound = roundNumber;
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

	bindShipNameHandlers({
		api: deps.api,
		localDraft,
		shipNameInput,
		saveShipNameBtn,
		canEditShipName,
		getLastGameId: function getLastGameId() {
			return lastGameId;
		},
		isShipNameBusy: function isShipNameBusy() {
			return shipNameBusy;
		},
		setShipNameBusy: function setShipNameBusy(value) {
			shipNameBusy = value;
		},
		reconcileUi,
		refreshRumbleState,
		setStatusNode,
	});

	bindAdminCheatHandlers({
		api: deps.api,
		uiState,
		localDraft,
		adminCheatTargetSelect,
		adminCheatToggleBtn,
		adminCheatClearBtn,
		adminCheatSubmitBtn,
		isAdminCheatVisible,
		getCheatTargetPlayer,
		getSelectedCheatAbilityIds,
		clearAdminCheatSelections,
		getLastGameId: function getLastGameId() {
			return lastGameId;
		},
		isAdminCheatBusy: function isAdminCheatBusy() {
			return adminCheatBusy;
		},
		setAdminCheatBusy: function setAdminCheatBusy(value) {
			adminCheatBusy = value;
		},
		reconcileUi,
		refreshRumbleState,
		setStatusNode,
	});

	bindPhaseControlHandlers({
		api: deps.api,
		localDraft,
		uiState,
		serverSnapshot,
		submitBtn,
		editBtn,
		cancelBtn,
		phaseActionBtn,
		getBidValidation,
		getOrderValidation,
		getEffectiveAbilityActivationArray,
		isBiddingPhase,
		hasSubmittedBids,
		clearDraftDirty,
		refreshRumbleState,
		reconcileUi,
		setStatusNode,
		getLastGameId: function getLastGameId() {
			return lastGameId;
		},
		getLastPerms: function getLastPerms() {
			return lastPerms;
		},
		isOrderBusy: function isOrderBusy() {
			return orderBusy;
		},
		setOrderBusy: function setOrderBusy(value) {
			orderBusy = value;
		},
	});

	return screen;
}
