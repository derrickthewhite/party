import { collectRefs, createNodeFromHtml, setStatus, showConfirmModal } from './dom.js';

export function createBaseGameScreen(deps, options) {
	const config = options || {};
	const api = deps.api;
	const state = deps.state;
	const chat = deps.chat;
	const refreshGames = deps.refreshGames;

	const root = createNodeFromHtml(`
		<section class="screen card">
			<div class="row">
				<h2 data-ref="title">${config.title || 'Game'}</h2>
				<div data-ref="headingSpacer"></div>
				<button class="link" data-ref="back">Back to lobby</button>
			</div>
			<p class="top-user-label" data-ref="userLabel"></p>
			<p data-ref="subtitle"></p>
			<p data-ref="modeInfo"></p>
			<div class="message-feed" data-ref="feed"></div>
			<div class="row chat-composer-row" data-ref="composerRow">
				<input type="text" placeholder="Type a message" class="chat-composer-input" data-ref="messageInput">
				<button class="primary chat-composer-send" data-ref="sendButton">Send</button>
			</div>
			<div class="row mobile-stack" data-ref="actionRow">
				<input type="text" placeholder="Action type (example: vote/order/attack)" data-ref="actionType">
				<input type="text" placeholder="Payload JSON (example: {&quot;target_user_id&quot;: 3})" data-ref="actionPayload">
				<button data-ref="actionButton">Submit Action</button>
			</div>
			<div class="column" data-ref="typePanel"></div>
			<div class="status" data-ref="status"></div>
			<div class="row mobile-stack" data-ref="adminControls">
				<button data-ref="adminStart">Start</button>
				<button data-ref="adminEnd">End</button>
				<button data-ref="adminDelete">Delete</button>
			</div>
		</section>
	`);
	const refs = collectRefs(root);
	const title = refs.title;
	const userLabel = refs.userLabel;
	const subtitle = refs.subtitle;
	const modeInfo = refs.modeInfo;
	const feed = refs.feed;
	const composerRow = refs.composerRow;
	const messageInput = refs.messageInput;
	const sendButton = refs.sendButton;
	const actionRow = refs.actionRow;
	const actionType = refs.actionType;
	const actionPayload = refs.actionPayload;
	const actionButton = refs.actionButton;
	const typePanel = refs.typePanel;
	const status = refs.status;
	const adminControls = refs.adminControls;
	const adminStart = refs.adminStart;
	const adminEnd = refs.adminEnd;
	const adminDelete = refs.adminDelete;
	let mountedTypePanel = null;

	refs.headingSpacer.style.flex = '1';
	modeInfo.style.marginTop = '-6px';
	modeInfo.style.opacity = '0.8';
	composerRow.style.marginTop = '10px';
	actionRow.style.marginTop = '8px';
	typePanel.style.marginTop = '8px';
	adminControls.style.marginTop = '12px';
	adminControls.style.paddingTop = '10px';
	adminControls.style.borderTop = '1px solid rgba(0, 0, 0, 0.15)';

	refs.back.addEventListener('click', function onBack() {
		chat.stopPolling();
		state.patch({ activeGame: null });
		state.setScreen('landing');
	});

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

	if (config.showActionComposer === false) {
		actionRow.style.display = 'none';
	}

	adminStart.addEventListener('click', async function onAdminStart() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		const confirmed = await showConfirmModal({
			title: 'Confirm Start',
			message: 'Are you sure you want to Start this game?',
			cancelLabel: 'Cancel',
			confirmLabel: 'Confirm',
		});
		if (!confirmed) {
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

	adminEnd.addEventListener('click', async function onAdminEnd() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		const confirmed = await showConfirmModal({
			title: 'Confirm End',
			message: 'Are you sure you want to End this game?',
			cancelLabel: 'Cancel',
			confirmLabel: 'Confirm',
		});
		if (!confirmed) {
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

	adminDelete.addEventListener('click', async function onAdminDelete() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		const confirmed = await showConfirmModal({
			title: 'Confirm Delete',
			message: 'Are you sure you want to Delete this game?',
			cancelLabel: 'Cancel',
			confirmLabel: 'Confirm',
		});
		if (!confirmed) {
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

	function setGame(game) {
		const user = state.state.user || {};
		userLabel.textContent = user.username ? 'Signed in as: ' + user.username : '';
		title.textContent = game ? game.title + (config.titleSuffix ? ' (' + config.titleSuffix + ')' : '') : (config.title || 'Game');
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
		} else if (memberRole === 'observer') {
			modeInfo.textContent = 'Observer mode: you can read chat and state, but cannot chat or submit actions.';
		} else if (game.status === 'open') {
			modeInfo.textContent = 'Game has not started yet: chat is enabled, game actions are disabled.';
		} else {
			modeInfo.textContent = 'Game in progress: chat and actions are enabled for active players.';
		}

		if (typeof config.onSetGame === 'function') {
			config.onSetGame({
				game,
				api,
				state,
				chat,
				refreshGames,
				setStatusNode: function setStatusNode(text, kind) {
					setStatus(status, text, kind);
				},
				nodes: {
					root,
					typePanel,
					composerRow,
					actionRow,
					feed,
				},
			});
		}
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
		while (feed.firstChild) {
			feed.removeChild(feed.firstChild);
		}
	}

	return {
		root,
		setGame,
		appendMessages,
		clearMessages,
		setTypePanel: function setTypePanel(node) {
			if (mountedTypePanel === node) {
				return;
			}

			if (mountedTypePanel && mountedTypePanel.parentNode === typePanel) {
				typePanel.removeChild(mountedTypePanel);
			}

			mountedTypePanel = node || null;
			if (mountedTypePanel) {
				typePanel.appendChild(mountedTypePanel);
			}
		},
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
