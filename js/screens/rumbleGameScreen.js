import { showConfirmModal } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';

export function createRumbleGameScreen(deps) {
	const panel = document.createElement('div');
	panel.className = 'card';
	panel.style.marginTop = '8px';

	const header = document.createElement('div');
	header.className = 'row';

	const heading = document.createElement('h3');
	heading.textContent = 'Rumble Orders';

	const headerSpacer = document.createElement('div');
	headerSpacer.style.flex = '1';

	const refreshBtn = document.createElement('button');
	refreshBtn.textContent = 'Refresh';

	header.appendChild(heading);
	header.appendChild(headerSpacer);
	header.appendChild(refreshBtn);

	const progressText = document.createElement('p');
	progressText.className = 'top-user-label';
	progressText.textContent = 'Round 1 players submitted: 0/0';

	const defenseText = document.createElement('p');
	defenseText.style.margin = '8px 0 6px 0';
	defenseText.style.fontWeight = '600';
	defenseText.textContent = 'Defense: 0';

	const attackHelpText = document.createElement('p');
	attackHelpText.textContent = 'Attack allocations (enter power to send at each target):';
	attackHelpText.style.margin = '4px 0 8px 0';

	const validationText = document.createElement('p');
	validationText.style.margin = '0 0 8px 0';
	validationText.style.fontWeight = '600';

	const playersList = document.createElement('div');
	playersList.className = 'list';

	const buttonRow = document.createElement('div');
	buttonRow.className = 'row mobile-stack';
	buttonRow.style.marginTop = '8px';

	const submitBtn = document.createElement('button');
	submitBtn.className = 'primary';
	submitBtn.textContent = 'Submit Orders';

	const editBtn = document.createElement('button');
	editBtn.textContent = 'Edit Orders';

	const cancelBtn = document.createElement('button');
	cancelBtn.textContent = 'Cancel Orders';

	const endTurnBtn = document.createElement('button');
	endTurnBtn.textContent = 'End Turn';

	buttonRow.appendChild(submitBtn);
	buttonRow.appendChild(editBtn);
	buttonRow.appendChild(cancelBtn);
	buttonRow.appendChild(endTurnBtn);

	const lastTurnTitle = document.createElement('h4');
	lastTurnTitle.textContent = 'Last Turn Orders';
	lastTurnTitle.style.marginTop = '10px';

	const lastTurnList = document.createElement('div');
	lastTurnList.className = 'list';

	panel.appendChild(header);
	panel.appendChild(progressText);
	panel.appendChild(defenseText);
	panel.appendChild(attackHelpText);
	panel.appendChild(validationText);
	panel.appendChild(playersList);
	panel.appendChild(buttonRow);
	panel.appendChild(lastTurnTitle);
	panel.appendChild(lastTurnList);

	let lastGameId = null;
	let lastRound = 1;
	let lastPerms = {};
	let setStatusNode = function noop() {};
	let refreshBusy = false;
	let orderBusy = false;
	let autoRefreshId = null;

	const serverSnapshot = {
		roundNumber: 1,
		submittedCount: 0,
		participantCount: 0,
		players: [],
		currentOrder: null,
		previousRoundOrders: [],
	};

	const localDraft = {
		attacks: {},
		dirty: false,
	};

	const uiState = {
		isEditing: true,
	};

	const playerRowsById = new Map();
	const previousOrderRowsById = new Map();
	const emptyPreviousOrdersNode = document.createElement('p');
	emptyPreviousOrdersNode.textContent = 'No previous turn orders yet.';
	lastTurnList.appendChild(emptyPreviousOrdersNode);

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

	function playerNameById(userId) {
		const targetId = Number(userId);
		const row = serverSnapshot.players.find(function eachPlayer(player) {
			return Number(player.user_id) === targetId;
		});
		return row ? String(row.username || ('User ' + targetId)) : ('User ' + targetId);
	}

	function describeOrder(order) {
		if (!order || typeof order !== 'object') {
			return 'No order';
		}

		const attacks = normalizeAttacksMap(order.attacks || {});
		const attackParts = Object.keys(attacks).sort(function sortNumeric(a, b) {
			return Number(a) - Number(b);
		}).map(function eachTarget(targetId) {
			return playerNameById(targetId) + ': ' + attacks[targetId];
		});

		if (attackParts.length === 0) {
			return 'Defense ' + Number(order.defense || 0) + ' | No attacks';
		}

		return 'Defense ' + Number(order.defense || 0) + ' | Attacks ' + attackParts.join(', ');
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

	function getEffectiveAttacks() {
		if (hasSubmittedOrder() && !uiState.isEditing) {
			return normalizeAttacksMap(serverSnapshot.currentOrder.attacks || {});
		}

		return normalizeAttacksMap(localDraft.attacks || {});
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
				invalidDefense: false,
				invalidTargets: [],
			};
		}

		if (hasSubmittedOrder() && !uiState.isEditing) {
			return {
				defense: Number(serverSnapshot.currentOrder ? serverSnapshot.currentOrder.defense || 0 : 0),
				invalidDefense: false,
				invalidTargets: [],
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
		const health = selfPlayer ? Number(selfPlayer.health || 0) : 0;
		const defense = health - getAttackTotal();

		return {
			defense,
			invalidDefense: defense < 0,
			invalidTargets,
		};
	}

	function ensurePlayerRow(player) {
		const key = String(Number(player.user_id));
		if (playerRowsById.has(key)) {
			return playerRowsById.get(key);
		}

		const row = document.createElement('div');
		row.className = 'row mobile-stack';
		row.style.alignItems = 'center';
		row.style.marginBottom = '6px';

		const name = document.createElement('div');
		name.style.flex = '1';

		const right = document.createElement('div');
		right.style.minWidth = '220px';

		const label = document.createElement('div');
		const input = document.createElement('input');
		input.type = 'number';
		input.min = '0';
		input.step = '1';
		input.placeholder = 'Attack amount';
		input.addEventListener('input', function onInput() {
			const raw = Number(input.value || 0);
			localDraft.attacks[key] = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
			localDraft.dirty = true;
			reconcileUi();
		});

		right.appendChild(label);
		right.appendChild(input);

		row.appendChild(name);
		row.appendChild(right);
		playersList.appendChild(row);

		const refs = { row, name, right, label, input };
		playerRowsById.set(key, refs);
		return refs;
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

			refs.name.textContent = String(player.username || 'Unknown') + ' | Health: ' + Math.max(0, Number(player.health || 0));
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
				const line = document.createElement('div');
				line.className = 'message-item';
				const meta = document.createElement('small');
				const text = document.createElement('div');
				line.appendChild(meta);
				line.appendChild(text);
				refs = { line, meta, text };
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
		const selfPlayer = getSelfPlayer();
		const validation = getOrderValidation();
		const canEditOrders = !!lastPerms.can_act;

		if (!selfPlayer) {
			defenseText.textContent = 'Defense: n/a';
			validationText.textContent = '';
			validationText.style.color = '';
		} else if (validation.invalidDefense) {
			defenseText.textContent = 'Defense: ' + validation.defense + ' (invalid: defense cannot be negative)';
			validationText.textContent = 'Orders are invalid: total attacks exceed your available power.';
			validationText.style.color = '#b42318';
		} else {
			defenseText.textContent = 'Defense: ' + validation.defense;
			if (validation.invalidTargets.length > 0) {
				validationText.textContent = 'Orders are invalid: remove attacks assigned to defeated or unavailable players.';
				validationText.style.color = '#b42318';
			} else {
				validationText.textContent = '';
				validationText.style.color = '';
			}
		}

		const hasSubmitted = hasSubmittedOrder();

		submitBtn.style.display = canEditOrders && !(hasSubmitted && !uiState.isEditing) ? '' : 'none';
		submitBtn.textContent = hasSubmitted ? 'Save Orders' : 'Submit Orders';
		submitBtn.disabled = orderBusy || !canEditOrders;

		editBtn.style.display = canEditOrders && hasSubmitted && !uiState.isEditing ? '' : 'none';
		editBtn.disabled = orderBusy || !canEditOrders;

		cancelBtn.style.display = canEditOrders && hasSubmitted ? '' : 'none';
		cancelBtn.disabled = orderBusy || !canEditOrders;

		endTurnBtn.style.display = lastPerms.can_delete ? '' : 'none';
		endTurnBtn.disabled = orderBusy || !lastPerms.can_end_turn;

		reconcilePlayersList();
		reconcilePreviousOrdersList();
	}

	function applyServerSnapshot(game) {
		const progress = game && game.rumble_turn_progress ? game.rumble_turn_progress : null;
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
		const nextOrder = progress && progress.current_order ? progress.current_order : null;
		const nextPreviousOrders = progress && Array.isArray(progress.previous_round_orders) ? progress.previous_round_orders : [];

		progressText.textContent = 'Round ' + roundNumber + ' players submitted: ' + submittedCount + '/' + participantCount;

		const roundChanged = roundNumber !== serverSnapshot.roundNumber;
		const hadOrder = !!serverSnapshot.currentOrder;
		const hasOrderNow = !!nextOrder;

		serverSnapshot.roundNumber = roundNumber;
		serverSnapshot.submittedCount = submittedCount;
		serverSnapshot.participantCount = participantCount;
		serverSnapshot.players = nextPlayers;
		serverSnapshot.currentOrder = hasOrderNow ? {
			attacks: normalizeAttacksMap(nextOrder.attacks || {}),
			defense: Math.max(0, Number(nextOrder.defense || 0)),
		} : null;
		serverSnapshot.previousRoundOrders = nextPreviousOrders;

		if (roundChanged) {
			uiState.isEditing = !hasOrderNow;
			localDraft.attacks = hasOrderNow ? normalizeAttacksMap(nextOrder.attacks || {}) : {};
			localDraft.dirty = false;
		} else if (!hadOrder && hasOrderNow) {
			uiState.isEditing = false;
			localDraft.attacks = normalizeAttacksMap(nextOrder.attacks || {});
			localDraft.dirty = false;
		} else if (hadOrder && !hasOrderNow && !localDraft.dirty) {
			uiState.isEditing = true;
			localDraft.attacks = {};
			localDraft.dirty = false;
		} else if (!localDraft.dirty && uiState.isEditing && hasOrderNow) {
			localDraft.attacks = normalizeAttacksMap(nextOrder.attacks || {});
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

	submitBtn.addEventListener('click', async function onSubmitOrder() {
		if (!lastGameId || !lastPerms.can_act || orderBusy) {
			return;
		}

		const attacks = normalizeAttacksMap(localDraft.attacks);
		const validation = getOrderValidation();
		if (validation.invalidTargets.length > 0) {
			setStatusNode('Invalid order: remove attacks assigned to defeated or unavailable players.', 'error');
			return;
		}

		if (validation.invalidDefense) {
			setStatusNode('Invalid order: defense cannot be negative.', 'error');
			return;
		}

		orderBusy = true;
		reconcileUi();
		try {
			await deps.api.submitRumbleOrder(lastGameId, attacks);
			uiState.isEditing = false;
			localDraft.dirty = false;
			await refreshRumbleState({ silent: true });
			setStatusNode('Orders submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit orders.', 'error');
		} finally {
			orderBusy = false;
			reconcileUi();
		}
	});

	editBtn.addEventListener('click', function onEditOrders() {
		if (!serverSnapshot.currentOrder || !lastPerms.can_act || orderBusy) {
			return;
		}

		localDraft.attacks = normalizeAttacksMap(serverSnapshot.currentOrder.attacks || {});
		localDraft.dirty = false;
		uiState.isEditing = true;
		reconcileUi();
	});

	cancelBtn.addEventListener('click', async function onCancelOrder() {
		if (!lastGameId || !serverSnapshot.currentOrder || !lastPerms.can_act || orderBusy) {
			return;
		}

		orderBusy = true;
		reconcileUi();
		try {
			await deps.api.cancelRumbleOrder(lastGameId);
			localDraft.attacks = {};
			localDraft.dirty = false;
			uiState.isEditing = true;
			await refreshRumbleState({ silent: true });
			setStatusNode('Orders canceled.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to cancel orders.', 'error');
		} finally {
			orderBusy = false;
			reconcileUi();
		}
	});

	endTurnBtn.addEventListener('click', async function onEndTurn() {
		if (!lastGameId || !lastPerms.can_delete || !lastPerms.can_end_turn || orderBusy) {
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
			localDraft.dirty = false;
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
