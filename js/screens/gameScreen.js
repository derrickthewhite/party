import { clearNode, createStatusNode, setStatus } from './dom.js';

export function createGameScreen(deps) {
	const api = deps.api;
	const state = deps.state;
	const chat = deps.chat;
	const refreshGames = deps.refreshGames;

	const root = document.createElement('section');
	root.className = 'screen card';

	const headingRow = document.createElement('div');
	headingRow.className = 'row';

	const title = document.createElement('h2');
	title.textContent = 'Game';

	const spacer = document.createElement('div');
	spacer.style.flex = '1';

	const back = document.createElement('button');
	back.className = 'link';
	back.textContent = 'Back to lobby';
	back.addEventListener('click', function onBack() {
		chat.stopPolling();
		state.patch({ activeGame: null });
		state.setScreen('landing');
	});

	headingRow.appendChild(title);
	headingRow.appendChild(spacer);
	headingRow.appendChild(back);

	const subtitle = document.createElement('p');
	const modeInfo = document.createElement('p');
	modeInfo.style.marginTop = '-6px';
	modeInfo.style.opacity = '0.8';

	const feed = document.createElement('div');
	feed.className = 'message-feed';

	const composerRow = document.createElement('div');
	composerRow.className = 'row mobile-stack';
	composerRow.style.marginTop = '10px';

	const messageInput = document.createElement('input');
	messageInput.type = 'text';
	messageInput.placeholder = 'Type a message';

	const sendButton = document.createElement('button');
	sendButton.className = 'primary';
	sendButton.textContent = 'Send';
	sendButton.addEventListener('click', async function onSendClick() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		const body = (messageInput.value || '').trim();
		if (body === '') {
			return;
		}

		try {
			await api.sendMessage(activeGame.id, body);
			messageInput.value = '';
			messageInput.focus();
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	messageInput.addEventListener('keydown', function onMessageKeyDown(event) {
		if (event.key === 'Enter') {
			sendButton.click();
		}
	});

	composerRow.appendChild(messageInput);
	composerRow.appendChild(sendButton);

	const actionRow = document.createElement('div');
	actionRow.className = 'row mobile-stack';
	actionRow.style.marginTop = '8px';

	const actionType = document.createElement('input');
	actionType.type = 'text';
	actionType.placeholder = 'Action type (example: vote/order/attack)';

	const actionPayload = document.createElement('input');
	actionPayload.type = 'text';
	actionPayload.placeholder = 'Payload JSON (example: {"target_user_id": 3})';

	const actionButton = document.createElement('button');
	actionButton.textContent = 'Submit Action';
	actionButton.addEventListener('click', async function onActionClick() {
		const activeGame = state.state.activeGame;
		if (!activeGame || !activeGame.permissions || !activeGame.permissions.can_act) {
			return;
		}

		const type = (actionType.value || '').trim();
		if (type === '') {
			setStatus(status, 'Action type is required.', 'error');
			return;
		}

		let payload = {};
		const payloadText = (actionPayload.value || '').trim();
		if (payloadText !== '') {
			try {
				payload = JSON.parse(payloadText);
			} catch (err) {
				setStatus(status, 'Payload must be valid JSON.', 'error');
				return;
			}
		}

		try {
			await api.sendAction(activeGame.id, type, payload);
			actionType.value = '';
			actionPayload.value = '';
			setStatus(status, 'Action submitted.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	actionRow.appendChild(actionType);
	actionRow.appendChild(actionPayload);
	actionRow.appendChild(actionButton);

	const status = createStatusNode();

	const adminControls = document.createElement('div');
	adminControls.className = 'row mobile-stack';
	adminControls.style.marginTop = '12px';
	adminControls.style.paddingTop = '10px';
	adminControls.style.borderTop = '1px solid rgba(0, 0, 0, 0.15)';

	const adminStart = document.createElement('button');
	adminStart.textContent = 'Start';
	adminStart.addEventListener('click', async function onAdminStart() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		try {
			await api.startGame(activeGame.id);
			const detail = await api.gameDetail(activeGame.id);
			state.patch({ activeGame: detail.game });
			setGame(detail.game);
			await refreshGames();
			setStatus(status, 'Game started.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	const adminEnd = document.createElement('button');
	adminEnd.textContent = 'End';
	adminEnd.addEventListener('click', async function onAdminEnd() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		try {
			await api.endGame(activeGame.id);
			const detail = await api.gameDetail(activeGame.id);
			state.patch({ activeGame: detail.game });
			setGame(detail.game);
			await refreshGames();
			setStatus(status, 'Game ended.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	const adminDelete = document.createElement('button');
	adminDelete.textContent = 'Delete';
	adminDelete.addEventListener('click', async function onAdminDelete() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		try {
			await api.deleteGame(activeGame.id);
			chat.stopPolling();
			state.patch({ activeGame: null });
			await refreshGames();
			state.setScreen('landing');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	adminControls.appendChild(adminStart);
	adminControls.appendChild(adminEnd);
	adminControls.appendChild(adminDelete);

	root.appendChild(headingRow);
	root.appendChild(subtitle);
	root.appendChild(modeInfo);
	root.appendChild(feed);
	root.appendChild(composerRow);
	root.appendChild(actionRow);
	root.appendChild(status);
	root.appendChild(adminControls);

	function setGame(game) {
		title.textContent = game ? game.title : 'Game';
		subtitle.textContent = game
			? 'Type: ' + game.game_type + ' | Owner: ' + game.owner_username + ' | Status: ' + game.status + ' | Phase: ' + game.phase + ' | Round: ' + game.current_round
			: '';

		const perms = game && game.permissions ? game.permissions : {};
		const memberRole = game && game.member_role ? game.member_role : 'none';
		const chatLocked = !perms.can_chat;
		const actionsLocked = !perms.can_act;

		messageInput.disabled = chatLocked;
		sendButton.disabled = chatLocked;
		actionType.disabled = actionsLocked;
		actionPayload.disabled = actionsLocked;
		actionButton.disabled = actionsLocked;
		const isOwnerOrAdmin = !!perms.can_delete;
		adminControls.style.display = isOwnerOrAdmin ? 'flex' : 'none';
		adminStart.style.display = isOwnerOrAdmin ? '' : 'none';
		adminEnd.style.display = isOwnerOrAdmin ? '' : 'none';
		adminDelete.style.display = isOwnerOrAdmin ? '' : 'none';
		adminStart.disabled = !perms.can_start;
		adminEnd.disabled = !perms.can_end;
		adminDelete.disabled = !perms.can_delete;

		if (!game) {
			modeInfo.textContent = '';
			return;
		}

		if (game.status === 'closed') {
			modeInfo.textContent = 'Game has ended. Everything is read-only.';
			return;
		}

		if (memberRole === 'observer') {
			modeInfo.textContent = 'Observer mode: you can read chat and state, but cannot chat or submit actions.';
			return;
		}

		if (game.status === 'open') {
			modeInfo.textContent = 'Game has not started yet: chat is enabled, game actions are disabled.';
			return;
		}

		modeInfo.textContent = 'Game in progress: chat and actions are enabled for active players.';
	}

	function appendMessages(messages) {
		messages.forEach(function eachMessage(message) {
			const line = document.createElement('div');
			line.className = 'message-item';

			const meta = document.createElement('small');
			meta.textContent = message.user.username + ' - ' + message.created_at;

			const text = document.createElement('div');
			text.textContent = message.body;

			line.appendChild(meta);
			line.appendChild(text);
			feed.appendChild(line);
		});

		if (messages.length > 0) {
			feed.scrollTop = feed.scrollHeight;
		}
	}

	function clearMessages() {
		clearNode(feed);
	}

	return {
		root,
		setGame,
		appendMessages,
		clearMessages,
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
