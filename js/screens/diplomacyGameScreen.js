import { createBaseGameScreen } from './gameScreen.js';

export function createDiplomacyGameScreen(deps) {
	const orderPanel = document.createElement('div');
	orderPanel.className = 'card';
	orderPanel.style.marginTop = '8px';

	const orderHeader = document.createElement('div');
	orderHeader.className = 'row';

	const orderTitle = document.createElement('h3');
	orderTitle.textContent = 'Diplomacy Orders';

	const orderHeaderSpacer = document.createElement('div');
	orderHeaderSpacer.style.flex = '1';

	const refreshOrdersBtn = document.createElement('button');
	refreshOrdersBtn.textContent = 'Refresh';
	let refreshOrdersBusy = false;

	orderHeader.appendChild(orderTitle);
	orderHeader.appendChild(orderHeaderSpacer);
	orderHeader.appendChild(refreshOrdersBtn);

	const orderRow = document.createElement('div');
	orderRow.className = 'row mobile-stack';

	const orderInput = document.createElement('input');
	orderInput.type = 'text';
	orderInput.placeholder = 'Enter your order text';

	const sendOrderBtn = document.createElement('button');
	sendOrderBtn.className = 'primary';
	sendOrderBtn.textContent = 'Send Order';

	const endTurnBtn = document.createElement('button');
	endTurnBtn.textContent = 'End Turn';

	orderRow.appendChild(orderInput);
	orderRow.appendChild(sendOrderBtn);
	orderRow.appendChild(endTurnBtn);

	const revealedTitle = document.createElement('h4');
	revealedTitle.textContent = 'Revealed Orders (Previous Round)';
	revealedTitle.style.marginTop = '10px';

	const progressText = document.createElement('p');
	progressText.className = 'top-user-label';
	progressText.textContent = 'Orders submitted this turn: 0/0';

	const ordersList = document.createElement('div');
	ordersList.className = 'list';

	orderPanel.appendChild(orderHeader);
	orderPanel.appendChild(orderRow);
	orderPanel.appendChild(progressText);
	orderPanel.appendChild(revealedTitle);
	orderPanel.appendChild(ordersList);

	let lastGameId = null;
	let lastRound = 1;
	let lastPerms = {};
	let setStatusNode = function noop() {};
	let refreshGameBusy = false;
	let autoRefreshId = null;
	let loadedOrdersRound = -1;

	const serverSnapshot = {
		roundNumber: 1,
		submittedCount: 0,
		participantCount: 0,
		permissions: {},
		revealedOrders: [],
	};

	const localDraft = {
		orderText: '',
		dirty: false,
	};

	const previousOrderRowsById = new Map();
	const emptyOrdersNode = document.createElement('p');
	emptyOrdersNode.textContent = 'No completed rounds yet.';
	ordersList.appendChild(emptyOrdersNode);

	function reconcileOrdersList() {
		const rows = Array.isArray(serverSnapshot.revealedOrders) ? serverSnapshot.revealedOrders : [];
		const targetRound = Math.max(0, Number(serverSnapshot.roundNumber || 1) - 1);
		const active = new Set();

		rows.forEach(function eachOrder(order) {
			const key = String(Number(order.id || 0));
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

			refs.meta.textContent = 'Round ' + order.round_number + ' - ' + order.user.username;
			refs.text.textContent = String((order.payload && order.payload.text) || '');
			ordersList.appendChild(refs.line);
		});

		Array.from(previousOrderRowsById.keys()).forEach(function eachKey(key) {
			if (active.has(key)) {
				return;
			}

			const refs = previousOrderRowsById.get(key);
			if (refs && refs.line.parentNode === ordersList) {
				ordersList.removeChild(refs.line);
			}
			previousOrderRowsById.delete(key);
		});

		emptyOrdersNode.textContent = targetRound > 0 ? 'No revealed orders from last round.' : 'No completed rounds yet.';
		emptyOrdersNode.style.display = rows.length === 0 ? '' : 'none';
		if (emptyOrdersNode.parentNode !== ordersList) {
			ordersList.appendChild(emptyOrdersNode);
		}
	}

	function reconcileUi() {
		const submitted = Number(serverSnapshot.submittedCount || 0);
		const participants = Number(serverSnapshot.participantCount || 0);
		const roundNumber = Number(serverSnapshot.roundNumber || lastRound || 1);
		progressText.textContent = 'Round ' + roundNumber + ' orders submitted: ' + submitted + '/' + participants;

		const perms = serverSnapshot.permissions || {};
		const hadFocus = document.activeElement === orderInput;
		const selectionStart = hadFocus ? orderInput.selectionStart : null;
		const selectionEnd = hadFocus ? orderInput.selectionEnd : null;

		sendOrderBtn.disabled = !perms.can_act;
		orderInput.disabled = !perms.can_act;
		endTurnBtn.style.display = perms.can_delete ? '' : 'none';
		endTurnBtn.disabled = !perms.can_end;

		if (localDraft.dirty) {
			if (orderInput.value !== localDraft.orderText) {
				orderInput.value = localDraft.orderText;
			}
		} else {
			localDraft.orderText = orderInput.value || '';
		}

		reconcileOrdersList();

		if (hadFocus && !orderInput.disabled) {
			orderInput.focus();
			if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
				orderInput.setSelectionRange(selectionStart, selectionEnd);
			}
		}
	}

	function applyServerSnapshot(game) {
		const progress = game && game.diplomacy_order_progress ? game.diplomacy_order_progress : null;
		const roundNumber = Number(progress && progress.round_number ? progress.round_number : (game && game.current_round ? game.current_round : 1));
		serverSnapshot.roundNumber = roundNumber;
		serverSnapshot.submittedCount = Number(progress && progress.submitted_count ? progress.submitted_count : 0);
		serverSnapshot.participantCount = Number(progress && progress.participant_count ? progress.participant_count : 0);
		serverSnapshot.permissions = game && game.permissions ? game.permissions : {};
		lastPerms = serverSnapshot.permissions;
		lastRound = roundNumber;
		reconcileUi();
	}

	async function refreshDiplomacyState(options) {
		if (!lastGameId || refreshGameBusy) {
			return;
		}

		const config = options || {};
		refreshGameBusy = true;
		refreshOrdersBtn.disabled = true;
		refreshOrdersBtn.textContent = 'Refreshing...';
		try {
			const detail = await deps.api.gameDetail(lastGameId);
			deps.state.patch({ activeGame: detail.game });
			screen.setGame(detail.game);
			await ensurePreviousRoundOrdersLoaded(deps.api, Number(detail.game && detail.game.current_round ? detail.game.current_round : lastRound));
			if (!config.silent) {
				setStatusNode('Diplomacy updates refreshed.', 'ok');
			}
		} catch (err) {
			setStatusNode(err.message || 'Unable to refresh diplomacy updates.', 'error');
		} finally {
			refreshGameBusy = false;
			refreshOrdersBtn.disabled = false;
			refreshOrdersBtn.textContent = 'Refresh';
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
			const isDiplomacyScreen = current.screen === 'game'
				&& current.activeGame
				&& String(current.activeGame.game_type || '').toLowerCase() === 'diplomacy';
			if (!isDiplomacyScreen) {
				stopAutoRefresh();
				return;
			}

			refreshDiplomacyState({ silent: true });
		}, 60000);
	}

	async function refreshPreviousRoundOrders(api, roundNumber) {
		if (!lastGameId) {
			return;
		}

		const result = await api.listActions(lastGameId, 0);
		const all = result.actions || [];
		const targetRound = Math.max(0, Number(roundNumber || lastRound || 1) - 1);
		const rows = all.filter(function eachAction(action) {
			return action.action_type === 'order'
				&& action.revealed_at
				&& Number(action.round_number) === targetRound;
		});

		serverSnapshot.revealedOrders = rows;
		reconcileOrdersList();
	}

	async function ensurePreviousRoundOrdersLoaded(api, roundNumber) {
		const targetRound = Math.max(0, Number(roundNumber || lastRound || 1) - 1);
		if (loadedOrdersRound === targetRound) {
			return;
		}

		await refreshPreviousRoundOrders(api, roundNumber);
		loadedOrdersRound = targetRound;
	}

	const screen = createBaseGameScreen(deps, {
		title: 'Diplomacy Game',
		titleSuffix: 'Diplomacy',
		showActionComposer: false,
		onSetGame: function onSetGame(context) {
			lastGameId = context.game.id;
			setStatusNode = context.setStatusNode;
			applyServerSnapshot(context.game);

			context.nodes.composerRow.style.display = '';
			context.nodes.actionRow.style.display = 'none';
			screen.setTypePanel(orderPanel);
			startAutoRefresh();

			ensurePreviousRoundOrdersLoaded(context.api, Number(context.game && context.game.current_round ? context.game.current_round : lastRound)).catch(function onErr(err) {
				setStatusNode(err.message || 'Unable to load previous round orders.', 'error');
			});
		},
	});

	deps.state.subscribe(function onStateChanged(current) {
		const isDiplomacyScreen = current.screen === 'game'
			&& current.activeGame
			&& String(current.activeGame.game_type || '').toLowerCase() === 'diplomacy';
		if (!isDiplomacyScreen) {
			stopAutoRefresh();
		}
	});

	sendOrderBtn.addEventListener('click', async function onSendOrder() {
		if (!lastGameId || !lastPerms.can_act) {
			return;
		}

		const text = (orderInput.value || '').trim();
		if (text === '') {
			setStatusNode('Order text is required.', 'error');
			return;
		}

		try {
			await deps.api.sendAction(lastGameId, 'order', { text });
			orderInput.value = '';
			localDraft.orderText = '';
			localDraft.dirty = false;
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Order submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit order.', 'error');
		}
	});

	orderInput.addEventListener('input', function onOrderInput() {
		localDraft.orderText = orderInput.value || '';
		localDraft.dirty = true;
	});

	endTurnBtn.addEventListener('click', async function onEndTurn() {
		if (!lastGameId || !lastPerms.can_delete || !lastPerms.can_end) {
			return;
		}

		try {
			await deps.api.revealActions(lastGameId);
			loadedOrdersRound = -1;
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Turn ended and orders revealed.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to end turn.', 'error');
		}
	});

	refreshOrdersBtn.addEventListener('click', async function onRefreshOrders() {
		if (refreshOrdersBusy || !lastGameId) {
			return;
		}

		refreshOrdersBusy = true;
		try {
			await refreshDiplomacyState({ silent: false });
		} catch (err) {
			setStatusNode(err.message || 'Unable to refresh diplomacy updates.', 'error');
		} finally {
			refreshOrdersBusy = false;
		}
	});

	return screen;
}
