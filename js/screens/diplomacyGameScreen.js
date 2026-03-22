import { clearNode } from './dom.js';
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

	function updateProgressText(game) {
		const progress = game && game.diplomacy_order_progress ? game.diplomacy_order_progress : null;
		const submitted = Number(progress && progress.submitted_count ? progress.submitted_count : 0);
		const participants = Number(progress && progress.participant_count ? progress.participant_count : 0);
		const roundNumber = Number(progress && progress.round_number ? progress.round_number : (game && game.current_round ? game.current_round : lastRound));
		progressText.textContent = 'Round ' + roundNumber + ' orders submitted: ' + submitted + '/' + participants;
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

	async function refreshPreviousRoundOrders(api) {
		if (!lastGameId) {
			return;
		}

		const result = await api.listActions(lastGameId, 0);
		const all = result.actions || [];
		const targetRound = Math.max(0, Number(lastRound || 1) - 1);
		const rows = all.filter(function eachAction(action) {
			return action.action_type === 'order'
				&& action.revealed_at
				&& Number(action.round_number) === targetRound;
		});

		clearNode(ordersList);
		if (rows.length === 0) {
			const empty = document.createElement('p');
			empty.textContent = targetRound > 0 ? 'No revealed orders from last round.' : 'No completed rounds yet.';
			ordersList.appendChild(empty);
			return;
		}

		rows.forEach(function eachOrder(order) {
			const line = document.createElement('div');
			line.className = 'message-item';

			const meta = document.createElement('small');
			meta.textContent = 'Round ' + order.round_number + ' - ' + order.user.username;

			const text = document.createElement('div');
			text.textContent = String((order.payload && order.payload.text) || '');

			line.appendChild(meta);
			line.appendChild(text);
			ordersList.appendChild(line);
		});
	}

	const screen = createBaseGameScreen(deps, {
		title: 'Diplomacy Game',
		titleSuffix: 'Diplomacy',
		showActionComposer: false,
		onSetGame: function onSetGame(context) {
			lastGameId = context.game.id;
			lastRound = Number(context.game.current_round || 1);
			lastPerms = context.game.permissions || {};
			setStatusNode = context.setStatusNode;
			updateProgressText(context.game);

			sendOrderBtn.disabled = !lastPerms.can_act;
			orderInput.disabled = !lastPerms.can_act;
			endTurnBtn.style.display = lastPerms.can_delete ? '' : 'none';
			endTurnBtn.disabled = !lastPerms.can_end;

			context.nodes.composerRow.style.display = '';
			context.nodes.actionRow.style.display = 'none';
			screen.setTypePanel(orderPanel);
			startAutoRefresh();

			refreshPreviousRoundOrders(context.api).catch(function onErr(err) {
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
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Order submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit order.', 'error');
		}
	});

	endTurnBtn.addEventListener('click', async function onEndTurn() {
		if (!lastGameId || !lastPerms.can_delete || !lastPerms.can_end) {
			return;
		}

		try {
			await deps.api.revealActions(lastGameId);
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
