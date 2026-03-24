import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate, showConfirmModal } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';

export function createRumbleGameScreen(deps) {
	const panel = createNodeFromHtml(`
		<div class="card">
			<div class="row">
				<h3 data-ref="phaseTitle">Rumble Bidding</h3>
				<div data-ref="headerSpacer"></div>
				<button data-ref="refreshBtn">Refresh</button>
			</div>
			<p class="top-user-label" data-ref="progressText">Bidding submissions: 0/0</p>
			<div class="row mobile-stack" data-ref="shipNameRow" style="align-items: center; margin: 6px 0 8px 0;">
				<label style="min-width: 90px;" for="rumble-ship-name-input">Ship name</label>
				<input id="rumble-ship-name-input" type="text" maxlength="60" placeholder="Enter ship name" data-ref="shipNameInput">
				<button data-ref="saveShipNameBtn">Save Name</button>
			</div>
			<p data-ref="shipNameHint" style="margin: 0 0 8px 0; opacity: 0.85;">Leave blank to use your username.</p>

			<div data-ref="biddingPanel">
				<p data-ref="bidHelpText">Place secret bids for offered abilities. You can overbid your health, but if bidding leaves you at 0 or less you are eliminated before combat.</p>
				<p data-ref="bidValidationText"></p>
				<div class="row" style="font-weight: 600; margin-bottom: 6px; align-items: center;">
					<div style="flex: 0 0 180px;">Ability</div>
					<div style="flex: 1;">Description</div>
					<div style="width: 220px;">Bid</div>
				</div>
				<div class="list" data-ref="abilitiesList"></div>
			</div>

			<div data-ref="battlePanel">
				<p data-ref="defenseText">Defense: 0</p>
				<p data-ref="energyText">Energy: 0 | Attacks: 0 | Abilities: 0 | Remaining: 0</p>
				<p data-ref="attackHelpText">Attack allocations (enter power to send at each target):</p>
				<p data-ref="orderValidationText"></p>
				<div class="list" data-ref="playersList"></div>
				<div data-ref="abilityActivationPanel" style="margin-top: 8px;">
					<p data-ref="abilityActivationHelpText">Ability activations (activated abilities consume energy; passive/triggered abilities resolve automatically):</p>
					<p data-ref="abilityValidationText"></p>
					<div class="list" data-ref="abilityActivationList"></div>
				</div>
			</div>

			<div class="row mobile-stack" data-ref="buttonRow">
				<button class="primary" data-ref="submitBtn">Submit Bids</button>
				<button data-ref="editBtn">Edit Bids</button>
				<button data-ref="cancelBtn">Cancel Bids</button>
				<button data-ref="phaseActionBtn">End Bidding</button>
			</div>

			<h4 data-ref="lastTurnTitle">Last Turn Orders</h4>
			<div class="list" data-ref="lastTurnList">
				<p data-ref="emptyPreviousOrdersNode">No previous turn orders yet.</p>
			</div>

			<h4 data-ref="currentEventLogTitle">Current Round Events</h4>
			<div class="list" data-ref="currentEventLogList">
				<p data-ref="emptyCurrentEventLogNode">No current round events yet.</p>
			</div>

			<h4 data-ref="previousEventLogTitle">Previous Round Events</h4>
			<div class="list" data-ref="previousEventLogList">
				<p data-ref="emptyPreviousEventLogNode">No previous round events yet.</p>
			</div>
		</div>
	`);
	const refs = collectRefs(panel);
	const abilityRowTemplate = createTemplate(`
		<div class="row mobile-stack" style="align-items: center; margin-bottom: 6px;">
			<div style="flex: 0 0 180px;" data-ref="name"></div>
			<div style="flex: 1;" data-ref="description"></div>
			<div style="width: 220px;" data-ref="right">
				<div data-ref="label"></div>
				<input type="number" min="0" step="1" placeholder="Bid amount" data-ref="input">
			</div>
		</div>
	`);
	const playerRowTemplate = createTemplate(`
		<div class="row mobile-stack" style="align-items: center; margin-bottom: 6px;">
			<div style="flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
				<div data-ref="name"></div>
				<small data-ref="abilities" style="opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;"></small>
			</div>
			<div style="min-width: 220px;" data-ref="right">
				<div data-ref="label"></div>
				<input type="number" min="0" step="1" placeholder="Attack amount" data-ref="input">
			</div>
		</div>
	`);
	const abilityActivationRowTemplate = createTemplate(`
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
	`);
	const previousOrderTemplate = createTemplate(`
		<div class="message-item">
			<small data-ref="meta"></small>
			<div data-ref="text"></div>
		</div>
	`);
	const eventLogTemplate = createTemplate(`
		<div class="message-item">
			<small data-ref="meta"></small>
			<div data-ref="text"></div>
		</div>
	`);
	const refreshBtn = refs.refreshBtn;
	const phaseTitle = refs.phaseTitle;
	const progressText = refs.progressText;
	const shipNameRow = refs.shipNameRow;
	const shipNameInput = refs.shipNameInput;
	const saveShipNameBtn = refs.saveShipNameBtn;
	const shipNameHint = refs.shipNameHint;
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
	let autoRefreshId = null;

	const serverSnapshot = {
		phaseMode: 'bidding',
		roundNumber: 1,
		submittedCount: 0,
		participantCount: 0,
		players: [],
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
	};

	const uiState = {
		isEditing: true,
	};

	const abilityRowsById = new Map();
	const playerRowsById = new Map();
	const abilityActivationRowsById = new Map();
	const previousOrderRowsById = new Map();
	const currentEventRowsById = new Map();
	const previousEventRowsById = new Map();

	function isBiddingPhase() {
		return serverSnapshot.phaseMode === 'bidding';
	}

	function isDraftDirty() {
		return isBiddingPhase()
			? localDraft.dirtyBids
			: (localDraft.dirtyAttacks || localDraft.dirtyAbilityActivations);
	}

	function clearDraftDirty() {
		localDraft.dirtyAttacks = false;
		localDraft.dirtyAbilityActivations = false;
		localDraft.dirtyBids = false;
	}

	function normalizeAttacksMap(input) {
		const normalized = {};
		const source = input && typeof input === 'object' ? input : {};
		Object.keys(source).forEach(function eachKey(key) {
			if (!/^\d+$/.test(String(key))) {
				return;
			}

			const amount = Number(source[key]);
			if (!Number.isFinite(amount)) {
				return;
			}

			const integer = Math.max(0, Math.floor(amount));
			if (integer <= 0) {
				return;
			}

			normalized[String(Number(key))] = integer;
		});

		return normalized;
	}

	function normalizeBidsMap(input) {
		const normalized = {};
		const source = input && typeof input === 'object' ? input : {};
		Object.keys(source).forEach(function eachKey(key) {
			if (!/^[a-z0-9_]+$/i.test(String(key))) {
				return;
			}

			const amount = Number(source[key]);
			if (!Number.isFinite(amount)) {
				return;
			}

			const integer = Math.max(0, Math.floor(amount));
			if (integer <= 0) {
				return;
			}

			normalized[String(key)] = integer;
		});

		return normalized;
	}

	function normalizeAbilityActivationMap(input) {
		const normalized = {};
		const source = input && typeof input === 'object' ? input : {};
		Object.keys(source).forEach(function eachKey(key) {
			if (!/^[a-z0-9_]+$/i.test(String(key))) {
				return;
			}

			const item = source[key];
			if (!item || typeof item !== 'object') {
				return;
			}

			const next = {};
			if (Object.prototype.hasOwnProperty.call(item, 'target_user_id')) {
				const target = Number(item.target_user_id);
				if (Number.isFinite(target) && target > 0) {
					next.target_user_id = Math.floor(target);
				}
			}

			if (Object.prototype.hasOwnProperty.call(item, 'x_cost')) {
				const xCost = Number(item.x_cost);
				if (Number.isFinite(xCost) && xCost >= 0) {
					next.x_cost = Math.floor(xCost);
				}
			}

			if (Object.prototype.hasOwnProperty.call(item, 'mode')) {
				const mode = String(item.mode || '').trim();
				if (mode) {
					next.mode = mode.slice(0, 40);
				}
			}

			next.is_enabled = item.is_enabled !== false;
			normalized[String(key)] = next;
		});

		return normalized;
	}

	function normalizeAbilityActivationArray(input) {
		if (!Array.isArray(input)) {
			return [];
		}

		const normalized = [];
		input.forEach(function eachActivation(item, index) {
			if (!item || typeof item !== 'object') {
				return;
			}

			const abilityId = String(item.ability_id || '').trim();
			if (!abilityId) {
				return;
			}

			const normalizedEntry = {
				ability_id: abilityId,
				client_order_index: Math.max(0, Number.isFinite(Number(item.client_order_index))
					? Math.floor(Number(item.client_order_index))
					: index),
			};

			if (Object.prototype.hasOwnProperty.call(item, 'target_user_id')) {
				const target = Number(item.target_user_id);
				if (Number.isFinite(target) && target > 0) {
					normalizedEntry.target_user_id = Math.floor(target);
				}
			}

			if (Object.prototype.hasOwnProperty.call(item, 'x_cost')) {
				const xCost = Number(item.x_cost);
				if (Number.isFinite(xCost) && xCost >= 0) {
					normalizedEntry.x_cost = Math.floor(xCost);
				}
			}

			if (Object.prototype.hasOwnProperty.call(item, 'mode')) {
				const mode = String(item.mode || '').trim();
				if (mode) {
					normalizedEntry.mode = mode.slice(0, 40);
				}
			}

			if (Object.prototype.hasOwnProperty.call(item, 'is_enabled')) {
				normalizedEntry.is_enabled = !!item.is_enabled;
			}

			normalized.push(normalizedEntry);
		});

		normalized.sort(function sortActivations(a, b) {
			if (a.client_order_index !== b.client_order_index) {
				return a.client_order_index - b.client_order_index;
			}
			return String(a.ability_id).localeCompare(String(b.ability_id));
		});

		return normalized;
	}

	function activationArrayToMap(activations) {
		const mapped = {};
		normalizeAbilityActivationArray(activations).forEach(function eachActivation(entry) {
			mapped[String(entry.ability_id)] = {
				target_user_id: Object.prototype.hasOwnProperty.call(entry, 'target_user_id') ? entry.target_user_id : undefined,
				x_cost: Object.prototype.hasOwnProperty.call(entry, 'x_cost') ? entry.x_cost : undefined,
				mode: Object.prototype.hasOwnProperty.call(entry, 'mode') ? entry.mode : undefined,
				is_enabled: Object.prototype.hasOwnProperty.call(entry, 'is_enabled') ? !!entry.is_enabled : true,
			};
		});
		return normalizeAbilityActivationMap(mapped);
	}

	function getSelfOwnedAbilities() {
		const selfPlayer = getSelfPlayer();
		if (!selfPlayer || !Array.isArray(selfPlayer.owned_abilities)) {
			return [];
		}
		return selfPlayer.owned_abilities;
	}

	function isActivatedAbility(ability) {
		return String(ability && ability.template_kind ? ability.template_kind : '') === 'activated';
	}

	function getEffectiveAbilityActivationMap() {
		if (hasSubmittedOrder() && !uiState.isEditing) {
			const activations = serverSnapshot.currentOrder && Array.isArray(serverSnapshot.currentOrder.ability_activations)
				? serverSnapshot.currentOrder.ability_activations
				: [];
			return activationArrayToMap(activations);
		}

		return normalizeAbilityActivationMap(localDraft.abilityActivations || {});
	}

	function evaluateAbilityCostFormula(formula, xCost) {
		const source = formula && typeof formula === 'object' ? formula : {};
		const kind = String(source.kind || '');
		if (kind === 'constant') {
			return Math.max(0, Math.floor(Number(source.value || 0)));
		}

		if (kind === 'variable_x') {
			return Math.max(0, Math.floor(Number(xCost || 0)));
		}

		if (kind === 'scaled_x') {
			const multiplier = Math.max(0, Math.floor(Number(source.multiplier || 0)));
			return Math.max(0, Math.floor(Number(xCost || 0)) * multiplier);
		}

		return null;
	}

	function abilityCostFromDraft(ability, draftActivation) {
		const activation = draftActivation && typeof draftActivation === 'object' ? draftActivation : {};
		const templateKey = String(ability && ability.template_key ? ability.template_key : '');
		const params = ability && typeof ability.template_params === 'object' && ability.template_params
			? ability.template_params
			: {};
		const xCost = Math.max(0, Math.floor(Number(activation.x_cost || 0)));
		const formulaCost = evaluateAbilityCostFormula(params.cost_formula, xCost);
		if (formulaCost !== null) {
			return formulaCost;
		}

		if (templateKey === 'activated_spend_with_target_policy') {
			if (String(params.cost_mode || '') === 'variable') {
				return xCost;
			}
			return 0;
		}

		if (templateKey === 'activated_defense_mode') {
			if (Object.prototype.hasOwnProperty.call(activation, 'x_cost')) {
				return xCost;
			}
			return 0;
		}

		if (templateKey === 'activated_self_or_toggle') {
			return xCost;
		}

		return 0;
	}

	function getAbilityControlSpec(ability) {
		const templateKey = String(ability && ability.template_key ? ability.template_key : '');
		const abilityId = String(ability && ability.id ? ability.id : '');
		const params = ability && typeof ability.template_params === 'object' && ability.template_params
			? ability.template_params
			: {};
		const templateInputs = ability && typeof ability.template_inputs === 'object' && ability.template_inputs
			? ability.template_inputs
			: {};

		if (!isActivatedAbility(ability)) {
			return {
				showTarget: false,
				targetRequired: false,
				showXCost: false,
			};
		}

		if (templateKey === 'activated_spend_with_target_policy') {
			const targetPolicy = String(params.target_policy || 'optional_target');
			const showTarget = targetPolicy === 'single_opponent' || targetPolicy === 'optional_target';
			return {
				showTarget,
				targetRequired: targetPolicy === 'single_opponent',
				showXCost: String(params.cost_mode || '') === 'variable' || abilityId === 'mining_rig',
			};
		}

		if (templateKey === 'activated_defense_mode') {
			return {
				showTarget: abilityId === 'focused_defense',
				targetRequired: abilityId === 'focused_defense',
				showXCost: Object.prototype.hasOwnProperty.call(templateInputs, 'x_cost') && abilityId === 'mine_layer',
			};
		}

		if (templateKey === 'activated_self_or_toggle') {
			return {
				showTarget: false,
				targetRequired: false,
				showXCost: abilityId !== 'hyperdrive' && Object.prototype.hasOwnProperty.call(templateInputs, 'x_cost'),
			};
		}

		return {
			showTarget: Object.prototype.hasOwnProperty.call(templateInputs, 'target_user_id'),
			targetRequired: Object.prototype.hasOwnProperty.call(templateInputs, 'target_user_id'),
			showXCost: Object.prototype.hasOwnProperty.call(templateInputs, 'x_cost'),
		};
	}

	function getDraftActivationSummary() {
		if (hasSubmittedOrder() && !uiState.isEditing && serverSnapshot.currentOrder) {
			return {
				ability_energy_spent: Math.max(0, Number(serverSnapshot.currentOrder.ability_energy_spent || 0)),
			};
		}

		let abilityEnergySpent = 0;
		const activationMap = getEffectiveAbilityActivationMap();
		getSelfOwnedAbilities().forEach(function eachAbility(ability) {
			if (!isActivatedAbility(ability)) {
				return;
			}

			const abilityId = String(ability.id || '');
			const draft = activationMap[abilityId] || { is_enabled: false };
			if (draft.is_enabled === false) {
				return;
			}

			abilityEnergySpent += abilityCostFromDraft(ability, draft);
		});

		return { ability_energy_spent: abilityEnergySpent };
	}

	function getEffectiveAbilityActivationArray() {
		const activationMap = getEffectiveAbilityActivationMap();
		const activations = [];
		let orderIndex = 0;
		getSelfOwnedAbilities().forEach(function eachAbility(ability) {
			if (!isActivatedAbility(ability)) {
				return;
			}

			const abilityId = String(ability.id || '');
			const draft = activationMap[abilityId] || { is_enabled: false };
			if (draft.is_enabled === false) {
				return;
			}

			const activation = {
				ability_id: abilityId,
				client_order_index: orderIndex,
			};
			if (Object.prototype.hasOwnProperty.call(draft, 'target_user_id')) {
				activation.target_user_id = Math.max(1, Math.floor(Number(draft.target_user_id || 0)));
			}
			if (Object.prototype.hasOwnProperty.call(draft, 'x_cost')) {
				activation.x_cost = Math.max(0, Math.floor(Number(draft.x_cost || 0)));
			}
			if (Object.prototype.hasOwnProperty.call(draft, 'mode')) {
				activation.mode = String(draft.mode || '').trim();
			}
			if (Object.prototype.hasOwnProperty.call(draft, 'is_enabled')) {
				activation.is_enabled = draft.is_enabled !== false;
			}

			activations.push(activation);
			orderIndex += 1;
		});

		return normalizeAbilityActivationArray(activations);
	}

	function playerNameById(userId) {
		const targetId = Number(userId);
		const row = serverSnapshot.players.find(function eachPlayer(player) {
			return Number(player.user_id) === targetId;
		});
		return row
			? String(row.ship_name || row.username || ('User ' + targetId))
			: ('User ' + targetId);
	}

	function describeOrder(order) {
		if (!order || typeof order !== 'object') {
			return 'No order';
		}

		const attacks = normalizeAttacksMap(order.attacks || {});
		const abilityActivations = normalizeAbilityActivationArray(order.ability_activations || []);
		const attackParts = Object.keys(attacks).sort(function sortNumeric(a, b) {
			return Number(a) - Number(b);
		}).map(function eachTarget(targetId) {
			return playerNameById(targetId) + ': ' + attacks[targetId];
		});
		const abilityParts = abilityActivations.map(function eachActivation(activation) {
			const parts = [String(activation.ability_id || 'ability')];
			if (Object.prototype.hasOwnProperty.call(activation, 'target_user_id')) {
				parts.push('target ' + playerNameById(activation.target_user_id));
			}
			if (Object.prototype.hasOwnProperty.call(activation, 'x_cost')) {
				parts.push('x ' + Math.max(0, Number(activation.x_cost || 0)));
			}
			return parts.join(' ');
		});

		const energyBudget = Math.max(0, Number(order.energy_budget || 0));
		const totalSpent = Math.max(0, Number(order.total_energy_spent || 0));
		const energyPart = energyBudget > 0
			? ' | Energy ' + totalSpent + '/' + energyBudget
			: '';

		if (attackParts.length === 0) {
			const abilityText = abilityParts.length > 0 ? ' | Abilities ' + abilityParts.join(', ') : ' | No abilities';
			return 'Defense ' + Number(order.defense || 0) + ' | No attacks' + abilityText + energyPart;
		}

		const abilityText = abilityParts.length > 0 ? ' | Abilities ' + abilityParts.join(', ') : ' | No abilities';
		return 'Defense ' + Number(order.defense || 0) + ' | Attacks ' + attackParts.join(', ') + abilityText + energyPart;
	}

	function getSelfPlayer() {
		const row = serverSnapshot.players.find(function eachPlayer(player) {
			return !!player.is_self;
		});
		return row || null;
	}

	function hasSubmittedOrder() {
		return !!serverSnapshot.currentOrder;
	}

	function hasSubmittedBids() {
		return serverSnapshot.currentBids !== null;
	}

	function getEffectiveAttacks() {
		if (hasSubmittedOrder() && !uiState.isEditing) {
			return normalizeAttacksMap(serverSnapshot.currentOrder.attacks || {});
		}

		return normalizeAttacksMap(localDraft.attacks || {});
	}

	function getEffectiveBids() {
		if (hasSubmittedBids() && !uiState.isEditing) {
			return normalizeBidsMap(serverSnapshot.currentBids || {});
		}

		return normalizeBidsMap(localDraft.bids || {});
	}

	function getAttackTotal() {
		let total = 0;
		const effectiveAttacks = getEffectiveAttacks();
		Object.keys(effectiveAttacks).forEach(function eachAttack(targetId) {
			const amount = Number(effectiveAttacks[targetId] || 0);
			if (!Number.isFinite(amount)) {
				return;
			}

			const integer = Math.max(0, Math.floor(amount));
			total += integer;
		});

		return Math.max(0, total);
	}

	function getOrderValidation() {
		const selfPlayer = getSelfPlayer();
		if (!lastPerms.can_act) {
			return {
				defense: selfPlayer ? Number(selfPlayer.health || 0) : 0,
				energyBudget: 0,
				attackEnergySpent: 0,
				abilityEnergySpent: 0,
				totalEnergySpent: 0,
				remainingEnergy: 0,
				invalidDefense: false,
				invalidEnergy: false,
				invalidTargets: [],
				invalidAbilityTargets: [],
				missingAbilityTargets: [],
			};
		}

		if (hasSubmittedOrder() && !uiState.isEditing) {
			const energyBudget = Math.max(0, Number(serverSnapshot.currentOrder ? serverSnapshot.currentOrder.energy_budget || 0 : 0));
			const attackEnergySpent = Math.max(0, Number(serverSnapshot.currentOrder ? serverSnapshot.currentOrder.attack_energy_spent || 0 : 0));
			const abilityEnergySpent = Math.max(0, Number(serverSnapshot.currentOrder ? serverSnapshot.currentOrder.ability_energy_spent || 0 : 0));
			const totalEnergySpent = Math.max(0, Number(serverSnapshot.currentOrder ? serverSnapshot.currentOrder.total_energy_spent || 0 : (attackEnergySpent + abilityEnergySpent)));
			return {
				defense: Number(serverSnapshot.currentOrder ? serverSnapshot.currentOrder.defense || 0 : 0),
				energyBudget,
				attackEnergySpent,
				abilityEnergySpent,
				totalEnergySpent,
				remainingEnergy: energyBudget - totalEnergySpent,
				invalidDefense: false,
				invalidEnergy: false,
				invalidTargets: [],
				invalidAbilityTargets: [],
				missingAbilityTargets: [],
			};
		}

		const attackableTargets = {};
		serverSnapshot.players.forEach(function eachPlayer(player) {
			const key = String(Number(player.user_id));
			const isDefeated = !!player.is_defeated || Number(player.health || 0) <= 0;
			if (!player.is_self && !isDefeated) {
				attackableTargets[key] = true;
			}
		});

		const effectiveAttacks = getEffectiveAttacks();
		const invalidTargets = Object.keys(effectiveAttacks).filter(function eachTarget(targetId) {
			return !attackableTargets[targetId];
		});

		const effectiveActivations = getEffectiveAbilityActivationMap();
		const invalidAbilityTargets = [];
		const missingAbilityTargets = [];
		getSelfOwnedAbilities().forEach(function eachAbility(ability) {
			if (!isActivatedAbility(ability)) {
				return;
			}

			const abilityId = String(ability.id || '');
			const activation = effectiveActivations[abilityId] || { is_enabled: false };
			if (activation.is_enabled === false) {
				return;
			}

			const controlSpec = getAbilityControlSpec(ability);
			if (!controlSpec.showTarget) {
				return;
			}

			if (!Object.prototype.hasOwnProperty.call(activation, 'target_user_id')) {
				if (controlSpec.targetRequired) {
					missingAbilityTargets.push(abilityId);
				}
				return;
			}

			const targetKey = String(Math.max(0, Number(activation.target_user_id || 0)));
			if (!attackableTargets[targetKey]) {
				invalidAbilityTargets.push(abilityId);
			}
		});

		const activationSummary = getDraftActivationSummary();
		const attackEnergySpent = Math.max(0, getAttackTotal());
		const abilityEnergySpent = Math.max(0, Number(activationSummary.ability_energy_spent || 0));
		const totalEnergySpent = attackEnergySpent + abilityEnergySpent;
		const ownedAbilityIds = getSelfOwnedAbilities().map(function eachAbility(ability) {
			return String(ability.id || '');
		});
		const energyBudget = Math.max(0, Number(selfPlayer ? selfPlayer.health || 0 : 0))
			+ (ownedAbilityIds.indexOf('turbo_generator') >= 0 ? 10 : 0);
		const health = selfPlayer ? Number(selfPlayer.health || 0) : 0;
		const defense = health - getAttackTotal();

		return {
			defense,
			energyBudget,
			attackEnergySpent,
			abilityEnergySpent,
			totalEnergySpent,
			remainingEnergy: energyBudget - totalEnergySpent,
			invalidDefense: defense < 0,
			invalidEnergy: totalEnergySpent > energyBudget,
			invalidTargets,
			invalidAbilityTargets,
			missingAbilityTargets,
		};
	}

	function getBidTotal() {
		let total = 0;
		const effectiveBids = getEffectiveBids();
		Object.keys(effectiveBids).forEach(function eachAbility(abilityId) {
			const amount = Number(effectiveBids[abilityId] || 0);
			if (!Number.isFinite(amount)) {
				return;
			}

			total += Math.max(0, Math.floor(amount));
		});

		return total;
	}

	function getBidValidation() {
		const offeredSet = {};
		serverSnapshot.offeredAbilities.forEach(function eachAbility(ability) {
			offeredSet[String(ability.id)] = true;
		});

		const effectiveBids = getEffectiveBids();
		const invalidAbilityIds = Object.keys(effectiveBids).filter(function eachId(abilityId) {
			return !offeredSet[abilityId];
		});

		const totalBid = getBidTotal();
		return {
			totalBid,
			invalidAbilityIds,
		};
	}

	function canEditShipName() {
		return lastMemberRole !== 'none' && lastMemberRole !== 'observer';
	}

	function reconcileShipNameEditor() {
		const editable = canEditShipName();
		shipNameRow.style.display = editable ? '' : 'none';
		shipNameHint.style.display = editable ? '' : 'none';
		if (!editable) {
			return;
		}

		const activeEl = document.activeElement;
		const focused = activeEl === shipNameInput;
		const valueFromDraft = String(localDraft.shipName || '');
		if (!focused && shipNameInput.value !== valueFromDraft) {
			shipNameInput.value = valueFromDraft;
		}

		shipNameInput.disabled = shipNameBusy;
		saveShipNameBtn.disabled = shipNameBusy;
		saveShipNameBtn.textContent = shipNameBusy ? 'Saving...' : 'Save Name';

		const normalizedDraft = String(localDraft.shipName || '').trim();
		const normalizedServer = String(serverSnapshot.selfShipName || '').trim();
		if (normalizedDraft === '' || normalizedDraft === normalizedServer) {
			shipNameHint.textContent = 'Leave blank to use your username.';
		} else {
			shipNameHint.textContent = 'Unsaved ship name: ' + normalizedDraft;
		}
	}

	function ensureAbilityRow(ability) {
		const key = String(ability.id || '');
		if (abilityRowsById.has(key)) {
			return abilityRowsById.get(key);
		}

		const row = cloneTemplateNode(abilityRowTemplate);
		const rowRefs = collectRefs(row);
		const name = rowRefs.name;
		const description = rowRefs.description;
		const label = rowRefs.label;
		const input = rowRefs.input;
		input.addEventListener('input', function onInput() {
			const raw = Number(input.value || 0);
			localDraft.bids[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			localDraft.dirtyBids = true;
			reconcileUi();
		});

		abilitiesList.appendChild(row);

		const refs = { row, name, description, label, input };
		abilityRowsById.set(key, refs);
		return refs;
	}

	function reconcileAbilitiesList() {
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
		const submittedBids = normalizeBidsMap(serverSnapshot.currentBids || {});
		const editableBids = normalizeBidsMap(localDraft.bids || {});
		const canEditBids = !!lastPerms.can_act;

		serverSnapshot.offeredAbilities.forEach(function eachAbility(ability) {
			const key = String(ability.id || '');
			active.add(key);
			const rowRefs = ensureAbilityRow(ability);
			rowRefs.name.textContent = String(ability.title || ability.name || key);
			rowRefs.description.textContent = String(ability.description || '');
			abilitiesList.appendChild(rowRefs.row);

			if (!canEditBids) {
				rowRefs.label.textContent = 'No bidding access';
				rowRefs.label.style.display = '';
				rowRefs.input.style.display = 'none';
				return;
			}

			if (hasSubmittedBids() && !uiState.isEditing) {
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
			rowRefs.input.disabled = !canEditBids || orderBusy;
		});

		Array.from(abilityRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = abilityRowsById.get(key);
			if (rowRefs && rowRefs.row.parentNode === abilitiesList) {
				abilitiesList.removeChild(rowRefs.row);
			}
			abilityRowsById.delete(key);
		});

		if (focusedAbilityId && abilityRowsById.has(focusedAbilityId)) {
			const rowRefs = abilityRowsById.get(focusedAbilityId);
			if (rowRefs && rowRefs.input && rowRefs.input.style.display !== 'none' && !rowRefs.input.disabled) {
				rowRefs.input.focus();
				if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
					rowRefs.input.setSelectionRange(selectionStart, selectionEnd);
				}
			}
		}
	}

	function ensurePlayerRow(player) {
		const key = String(Number(player.user_id));
		if (playerRowsById.has(key)) {
			return playerRowsById.get(key);
		}

		const row = cloneTemplateNode(playerRowTemplate);
		const rowRefs = collectRefs(row);
		const name = rowRefs.name;
		const abilities = rowRefs.abilities;
		const right = rowRefs.right;
		const label = rowRefs.label;
		const input = rowRefs.input;
		input.addEventListener('input', function onInput() {
			const raw = Number(input.value || 0);
			localDraft.attacks[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			localDraft.dirtyAttacks = true;
			reconcileUi();
		});

		playersList.appendChild(row);

		const refs = { row, name, abilities, right, label, input, abilityBadgeById: new Map() };
		playerRowsById.set(key, refs);
		return refs;
	}

	function reconcileOwnedAbilities(refs, ownedAbilities) {
		const list = Array.isArray(ownedAbilities) ? ownedAbilities : [];
		if (list.length === 0) {
			refs.abilities.style.display = 'none';
			refs.abilities.textContent = '';
			refs.abilities.title = '';
			refs.abilityBadgeById.clear();
			return;
		}

		refs.abilities.style.display = '';
		refs.abilities.title = '';

		const activeIds = new Set();
		list.forEach(function eachAbility(ability, index) {
			const abilityId = String(ability && ability.id ? ability.id : ('ability_' + String(index)));
			activeIds.add(abilityId);

			let badge = refs.abilityBadgeById.get(abilityId);
			if (!badge) {
				badge = document.createElement('span');
				badge.style.display = 'inline-block';
				badge.style.padding = '1px 6px';
				badge.style.border = '1px solid rgba(0, 0, 0, 0.2)';
				badge.style.borderRadius = '999px';
				refs.abilityBadgeById.set(abilityId, badge);
			}

			const abilityName = String(ability && (ability.title || ability.name) ? (ability.title || ability.name) : 'Unknown');
			const description = String(ability && ability.description ? ability.description : 'No description available.');
			badge.textContent = abilityName;
			badge.title = abilityName + ': ' + description;
			refs.abilities.appendChild(badge);
		});

		Array.from(refs.abilityBadgeById.keys()).forEach(function eachExisting(abilityId) {
			if (activeIds.has(abilityId)) {
				return;
			}

			const badge = refs.abilityBadgeById.get(abilityId);
			if (badge && badge.parentNode === refs.abilities) {
				refs.abilities.removeChild(badge);
			}
			refs.abilityBadgeById.delete(abilityId);
		});
	}

	function ensureAbilityActivationRow(ability) {
		const key = String(ability.id || '');
		if (abilityActivationRowsById.has(key)) {
			return abilityActivationRowsById.get(key);
		}

		const row = cloneTemplateNode(abilityActivationRowTemplate);
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
			const current = normalizeAbilityActivationMap(localDraft.abilityActivations || {});
			const nextEntry = current[key] || {};
			nextEntry.is_enabled = !!rowRefs.toggleInput.checked;
			current[key] = nextEntry;
			localDraft.abilityActivations = current;
			localDraft.dirtyAbilityActivations = true;
			reconcileUi();
		});

		rowRefs.targetSelect.addEventListener('change', function onTargetChange() {
			const current = normalizeAbilityActivationMap(localDraft.abilityActivations || {});
			const nextEntry = current[key] || {};
			const selected = String(rowRefs.targetSelect.value || '');
			if (/^\d+$/.test(selected) && Number(selected) > 0) {
				nextEntry.target_user_id = Number(selected);
			} else {
				delete nextEntry.target_user_id;
			}
			nextEntry.is_enabled = nextEntry.is_enabled !== false;
			current[key] = nextEntry;
			localDraft.abilityActivations = current;
			localDraft.dirtyAbilityActivations = true;
			reconcileUi();
		});

		rowRefs.xCostInput.addEventListener('input', function onXCostInput() {
			const current = normalizeAbilityActivationMap(localDraft.abilityActivations || {});
			const nextEntry = current[key] || {};
			const raw = Number(rowRefs.xCostInput.value || 0);
			nextEntry.x_cost = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			nextEntry.is_enabled = nextEntry.is_enabled !== false;
			current[key] = nextEntry;
			localDraft.abilityActivations = current;
			localDraft.dirtyAbilityActivations = true;
			reconcileUi();
		});

		abilityActivationList.appendChild(row);
		abilityActivationRowsById.set(key, refs);
		return refs;
	}

	function reconcileSelectOptions(selectNode, optionMap, options) {
		const active = new Set();
		options.forEach(function eachOption(option) {
			const value = String(option.value);
			active.add(value);
			let optionNode = optionMap.get(value);
			if (!optionNode) {
				optionNode = document.createElement('option');
				optionMap.set(value, optionNode);
			}
			optionNode.value = value;
			optionNode.textContent = String(option.label);
			selectNode.appendChild(optionNode);
		});

		Array.from(optionMap.keys()).forEach(function eachExisting(value) {
			if (active.has(value)) {
				return;
			}

			const node = optionMap.get(value);
			if (node && node.parentNode === selectNode) {
				selectNode.removeChild(node);
			}
			optionMap.delete(value);
		});
	}

	function describeActivationReadonly(ability, activationMap) {
		if (!isActivatedAbility(ability)) {
			const templateKind = String(ability.template_kind || 'passive');
			if (templateKind === 'triggered') {
				return 'Triggered ability. Resolves automatically when conditions are met.';
			}
			if (templateKind === 'condition') {
				return 'Condition tracker. Evaluated automatically by the round resolver.';
			}
			return 'Passive ability. Always applied automatically by the resolver.';
		}

		const abilityId = String(ability.id || '');
		const activation = activationMap[abilityId] || null;
		if (!activation || activation.is_enabled === false) {
			return 'Not activated this round.';
		}

		const parts = ['Activated'];
		if (Object.prototype.hasOwnProperty.call(activation, 'target_user_id')) {
			parts.push('target: ' + playerNameById(activation.target_user_id));
		}
		if (Object.prototype.hasOwnProperty.call(activation, 'x_cost')) {
			parts.push('x: ' + Math.max(0, Number(activation.x_cost || 0)));
		}
		parts.push('cost: ' + abilityCostFromDraft(ability, activation));
		return parts.join(' | ');
	}

	function reconcileAbilityActivationList() {
		const selfOwnedAbilities = getSelfOwnedAbilities();
		const activationMap = getEffectiveAbilityActivationMap();
		const canEdit = !!lastPerms.can_act && uiState.isEditing && !orderBusy && !isBiddingPhase();

		let focusedKey = null;
		let focusedControl = null;
		let selectionStart = null;
		let selectionEnd = null;
		const activeEl = document.activeElement;
		if (activeEl) {
			Array.from(abilityActivationRowsById.entries()).forEach(function eachEntry(entry) {
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

		const aliveTargets = serverSnapshot.players.filter(function eachPlayer(player) {
			return !player.is_self && !player.is_defeated && Number(player.health || 0) > 0;
		});

		const active = new Set();
		selfOwnedAbilities.forEach(function eachAbility(ability) {
			const key = String(ability.id || '');
			active.add(key);
			const refs = ensureAbilityActivationRow(ability);
			refs.name.textContent = String(ability.title || ability.name || key);
			refs.meta.textContent = String(ability.template_kind || 'unknown');
			refs.description.textContent = String(ability.description || '');
			abilityActivationList.appendChild(refs.row);

			const isActivated = isActivatedAbility(ability);
			const controlSpec = getAbilityControlSpec(ability);
			const hasTarget = controlSpec.showTarget;
			const hasXCost = controlSpec.showXCost;

			const currentActivation = activationMap[key] || { is_enabled: false };
			const enabled = currentActivation.is_enabled !== false;
			refs.readonlyText.textContent = describeActivationReadonly(ability, activationMap);

			const showInteractiveControls = isActivated && canEdit;
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

		Array.from(abilityActivationRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const refs = abilityActivationRowsById.get(key);
			if (refs && refs.row.parentNode === abilityActivationList) {
				abilityActivationList.removeChild(refs.row);
			}
			abilityActivationRowsById.delete(key);
		});

		if (focusedKey && abilityActivationRowsById.has(focusedKey)) {
			const refs = abilityActivationRowsById.get(focusedKey);
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

	function ensureEventRow(eventListMap, key, listNode) {
		if (eventListMap.has(key)) {
			return eventListMap.get(key);
		}

		const line = cloneTemplateNode(eventLogTemplate);
		const rowRefs = collectRefs(line);
		const refs = {
			line,
			meta: rowRefs.meta,
			text: rowRefs.text,
		};
		listNode.appendChild(line);
		eventListMap.set(key, refs);
		return refs;
	}

	function reconcileEventLogList(events, listNode, emptyNode, rowMap, labelPrefix) {
		const list = Array.isArray(events) ? events : [];
		const active = new Set();

		list.forEach(function eachEvent(event, index) {
			const idPart = Number(event && event.id ? event.id : 0);
			const key = idPart > 0 ? String(idPart) : String(index);
			active.add(key);
			const refs = ensureEventRow(rowMap, key, listNode);
			const effectKey = String(event && event.effect_key ? event.effect_key : 'event');
			refs.meta.textContent = labelPrefix + ' • ' + effectKey;
			refs.text.textContent = String(event && event.text ? event.text : 'No event details.');
			listNode.appendChild(refs.line);
		});

		Array.from(rowMap.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const refs = rowMap.get(key);
			if (refs && refs.line.parentNode === listNode) {
				listNode.removeChild(refs.line);
			}
			rowMap.delete(key);
		});

		emptyNode.style.display = list.length === 0 ? '' : 'none';
		if (emptyNode.style.display === '' && emptyNode.parentNode !== listNode) {
			listNode.appendChild(emptyNode);
		}
	}

	function reconcilePlayersList() {
		let focusedAttackKey = null;
		let selectionStart = null;
		let selectionEnd = null;
		const activeEl = document.activeElement;
		if (activeEl && activeEl.tagName === 'INPUT') {
			Array.from(playerRowsById.entries()).forEach(function eachEntry(entry) {
				const key = entry[0];
				const refs = entry[1];
				if (refs.input === activeEl) {
					focusedAttackKey = key;
					selectionStart = refs.input.selectionStart;
					selectionEnd = refs.input.selectionEnd;
				}
			});
		}

		const active = new Set();
		const submittedAttacks = normalizeAttacksMap(serverSnapshot.currentOrder && serverSnapshot.currentOrder.attacks ? serverSnapshot.currentOrder.attacks : {});
		const editableAttacks = normalizeAttacksMap(localDraft.attacks || {});

		serverSnapshot.players.forEach(function eachPlayer(player) {
			const key = String(Number(player.user_id));
			active.add(key);
			const refs = ensurePlayerRow(player);
			const isDefeated = !!player.is_defeated || Number(player.health || 0) <= 0;

			const displayShipName = String(player.ship_name || player.username || 'Unknown');
			refs.name.textContent = displayShipName + ' | Health: ' + Math.max(0, Number(player.health || 0));
			const ownedAbilities = Array.isArray(player.owned_abilities) ? player.owned_abilities : [];
			reconcileOwnedAbilities(refs, ownedAbilities);
			if (refs.row.parentNode !== playersList) {
				playersList.appendChild(refs.row);
			} else {
				playersList.appendChild(refs.row);
			}

			if (player.is_self) {
				refs.label.textContent = isDefeated ? 'Defeated' : 'You';
				refs.label.style.display = '';
				refs.input.style.display = 'none';
				return;
			}

			if (isDefeated) {
				refs.label.textContent = 'Defeated';
				refs.label.style.display = '';
				refs.input.style.display = 'none';
				return;
			}

			if (!lastPerms.can_act) {
				refs.label.textContent = 'Active';
				refs.label.style.display = '';
				refs.input.style.display = 'none';
				return;
			}

			if (hasSubmittedOrder() && !uiState.isEditing) {
				const submittedAmount = Number(submittedAttacks[key] || 0);
				refs.label.textContent = 'Attack: ' + Math.max(0, Math.floor(submittedAmount));
				refs.label.style.display = '';
				refs.input.style.display = 'none';
				return;
			}

			refs.label.style.display = 'none';
			refs.input.style.display = '';
			const nextValue = String(Math.max(0, Number(editableAttacks[key] || 0)));
			const isFocused = focusedAttackKey === key && document.activeElement === refs.input;
			if (!isFocused && refs.input.value !== nextValue) {
				refs.input.value = nextValue;
			}
			refs.input.disabled = !lastPerms.can_act || orderBusy;
		});

		Array.from(playerRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const refs = playerRowsById.get(key);
			if (refs && refs.row.parentNode === playersList) {
				playersList.removeChild(refs.row);
			}
			playerRowsById.delete(key);
		});

		if (focusedAttackKey && playerRowsById.has(focusedAttackKey)) {
			const refs = playerRowsById.get(focusedAttackKey);
			if (refs && refs.input && refs.input.style.display !== 'none' && !refs.input.disabled) {
				refs.input.focus();
				if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
					refs.input.setSelectionRange(selectionStart, selectionEnd);
				}
			}
		}
	}

	function reconcilePreviousOrdersList() {
		const previousOrders = Array.isArray(serverSnapshot.previousRoundOrders) ? serverSnapshot.previousRoundOrders : [];
		const active = new Set();

		previousOrders.forEach(function eachOrder(order, index) {
			const key = String(Number(order.user_id || 0)) + ':' + String(index);
			active.add(key);

			let refs = previousOrderRowsById.get(key);
			if (!refs) {
				const line = cloneTemplateNode(previousOrderTemplate);
				const rowRefs = collectRefs(line);
				refs = { line, meta: rowRefs.meta, text: rowRefs.text };
				previousOrderRowsById.set(key, refs);
			}

			refs.meta.textContent = String(order.username || 'Unknown');
			refs.text.textContent = describeOrder(order);
			lastTurnList.appendChild(refs.line);
		});

		Array.from(previousOrderRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const refs = previousOrderRowsById.get(key);
			if (refs && refs.line.parentNode === lastTurnList) {
				lastTurnList.removeChild(refs.line);
			}
			previousOrderRowsById.delete(key);
		});

		emptyPreviousOrdersNode.style.display = previousOrders.length === 0 ? '' : 'none';
		if (emptyPreviousOrdersNode.style.display === '' && emptyPreviousOrdersNode.parentNode !== lastTurnList) {
			lastTurnList.appendChild(emptyPreviousOrdersNode);
		}
	}

	function reconcileUi() {
		const canAct = !!lastPerms.can_act;
		const bidding = isBiddingPhase();
		reconcileShipNameEditor();

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

	refreshBtn.addEventListener('click', function onRefreshClick() {
		refreshRumbleState({ silent: false });
	});

	shipNameInput.addEventListener('input', function onShipNameInput() {
		localDraft.shipName = String(shipNameInput.value || '');
		localDraft.dirtyShipName = true;
		reconcileUi();
	});

	shipNameInput.addEventListener('keydown', async function onShipNameKeyDown(event) {
		if (event.key !== 'Enter') {
			return;
		}

		event.preventDefault();
		saveShipNameBtn.click();
	});

	saveShipNameBtn.addEventListener('click', async function onSaveShipName() {
		if (!lastGameId || shipNameBusy || !canEditShipName()) {
			return;
		}

		const nextShipName = String(localDraft.shipName || '');
		shipNameBusy = true;
		reconcileUi();
		try {
			await deps.api.setRumbleShipName(lastGameId, nextShipName);
			localDraft.dirtyShipName = false;
			await refreshRumbleState({ silent: true });
			setStatusNode('Ship name updated.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to update ship name.', 'error');
		} finally {
			shipNameBusy = false;
			reconcileUi();
		}
	});

	submitBtn.addEventListener('click', async function onSubmitOrder() {
		if (!lastGameId || !lastPerms.can_act || orderBusy) {
			return;
		}

		orderBusy = true;
		reconcileUi();
		try {
			if (isBiddingPhase()) {
				const bids = normalizeBidsMap(localDraft.bids);
				const bidValidation = getBidValidation();
				if (bidValidation.invalidAbilityIds.length > 0) {
					setStatusNode('Invalid bids: one or more offered abilities are unavailable.', 'error');
					return;
				}

				await deps.api.submitRumbleBids(lastGameId, bids);
				uiState.isEditing = false;
				localDraft.dirtyBids = false;
				await refreshRumbleState({ silent: true });
				setStatusNode('Bids submitted.', 'ok');
				return;
			}

			const attacks = normalizeAttacksMap(localDraft.attacks);
			const abilityActivations = getEffectiveAbilityActivationArray();
			const validation = getOrderValidation();
			if (validation.invalidTargets.length > 0) {
				setStatusNode('Invalid order: remove attacks assigned to defeated or unavailable players.', 'error');
				return;
			}

			if (validation.invalidAbilityTargets.length > 0 || validation.missingAbilityTargets.length > 0) {
				setStatusNode('Invalid ability activations: choose valid living targets for enabled targeted abilities.', 'error');
				return;
			}

			if (validation.invalidDefense) {
				setStatusNode('Invalid order: defense cannot be negative.', 'error');
				return;
			}

			if (validation.invalidEnergy) {
				setStatusNode('Invalid order: total energy spend exceeds your budget.', 'error');
				return;
			}

			await deps.api.submitRumbleOrder(lastGameId, attacks, abilityActivations);
			uiState.isEditing = false;
			localDraft.dirtyAttacks = false;
			localDraft.dirtyAbilityActivations = false;
			await refreshRumbleState({ silent: true });
			setStatusNode('Orders submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit update.', 'error');
		} finally {
			orderBusy = false;
			reconcileUi();
		}
	});

	editBtn.addEventListener('click', function onEditOrders() {
		if (!lastPerms.can_act || orderBusy) {
			return;
		}

		if (isBiddingPhase()) {
			if (!hasSubmittedBids()) {
				return;
			}

			localDraft.bids = normalizeBidsMap(serverSnapshot.currentBids || {});
			localDraft.dirtyBids = false;
			uiState.isEditing = true;
			reconcileUi();
			return;
		}

		if (!serverSnapshot.currentOrder) {
			return;
		}

		localDraft.attacks = normalizeAttacksMap(serverSnapshot.currentOrder.attacks || {});
		localDraft.dirtyAttacks = false;
		localDraft.abilityActivations = activationArrayToMap(serverSnapshot.currentOrder.ability_activations || []);
		localDraft.dirtyAbilityActivations = false;
		uiState.isEditing = true;
		reconcileUi();
	});

	cancelBtn.addEventListener('click', async function onCancelOrder() {
		if (!lastGameId || !lastPerms.can_act || orderBusy) {
			return;
		}

		orderBusy = true;
		reconcileUi();
		try {
			if (isBiddingPhase()) {
				if (!hasSubmittedBids()) {
					return;
				}

				await deps.api.cancelRumbleBids(lastGameId);
				localDraft.bids = {};
				localDraft.dirtyBids = false;
				uiState.isEditing = true;
				await refreshRumbleState({ silent: true });
				setStatusNode('Bids canceled.', 'ok');
				return;
			}

			if (!serverSnapshot.currentOrder) {
				return;
			}

			await deps.api.cancelRumbleOrder(lastGameId);
			localDraft.attacks = {};
			localDraft.dirtyAttacks = false;
			localDraft.abilityActivations = {};
			localDraft.dirtyAbilityActivations = false;
			uiState.isEditing = true;
			await refreshRumbleState({ silent: true });
			setStatusNode('Orders canceled.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to cancel update.', 'error');
		} finally {
			orderBusy = false;
			reconcileUi();
		}
	});

	phaseActionBtn.addEventListener('click', async function onPhaseAction() {
		if (!lastGameId || !lastPerms.can_delete || !lastPerms.can_end_turn || orderBusy) {
			return;
		}

		if (isBiddingPhase()) {
			const confirmedEndBidding = await showConfirmModal({
				title: 'Confirm End Bidding',
				message: 'Resolve bidding now and move the game to combat?',
				cancelLabel: 'Cancel',
				confirmLabel: 'End Bidding',
			});
			if (!confirmedEndBidding) {
				return;
			}

			orderBusy = true;
			reconcileUi();
			try {
				await deps.api.endRumbleBidding(lastGameId);
				clearDraftDirty();
				await refreshRumbleState({ silent: true });
				setStatusNode('Bidding ended. Combat phase started.', 'ok');
			} catch (err) {
				setStatusNode(err.message || 'Unable to end bidding.', 'error');
			} finally {
				orderBusy = false;
				reconcileUi();
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

		orderBusy = true;
		reconcileUi();
		try {
			await deps.api.endRumbleTurn(lastGameId);
			localDraft.dirtyAttacks = false;
			localDraft.dirtyAbilityActivations = false;
			await refreshRumbleState({ silent: true });
			setStatusNode('Turn resolved.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to end turn.', 'error');
		} finally {
			orderBusy = false;
			reconcileUi();
		}
	});

	return screen;
}
