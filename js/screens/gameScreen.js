import { collectRefs, createNodeFromHtml, setStatus, showConfirmModal } from './dom.js';
import { createGameActionButtonMarkup, setGameActionButtonLabel } from './gameActionButtons.js';
import { createGameParticipantsSidebarController } from './gameParticipantsSidebar.js';
import { setPlayerIconImage } from '../playerIcons.js';
import { collectGameInfoIcons, setGameInfoIconNode } from '../gameStateIcons.js';

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
				<button data-ref="leave">Leave game</button>
				<button class="link" data-ref="back">Back to lobby</button>
			</div>
			<p class="top-user-label" data-ref="userLabel"></p>
			<p data-ref="subtitle"></p>
			<div class="row game-screen-info-icons" data-ref="gameInfoIcons">
				<img class="game-state-icon" data-ref="typeIcon" alt="" aria-hidden="true">
				<img class="game-state-icon" data-ref="statusIcon" alt="" aria-hidden="true">
				<img class="game-state-icon" data-ref="phaseIcon" alt="" aria-hidden="true">
			</div>
			<p data-ref="modeInfo"></p>
			<div class="chat-layout-shell${config.showParticipantsPanel ? ' chat-layout-shell-with-sidebar' : ''}" data-ref="shell">
				<div class="chat-layout-main" data-ref="chatPanel">
					<div class="message-feed" data-ref="feed"></div>
					<div class="row chat-composer-row" data-ref="composerRow">
						<input type="text" placeholder="Type a message" class="chat-composer-input" data-ref="messageInput">
						${createGameActionButtonMarkup('send-message', 'sendButton', 'primary chat-composer-send')}
					</div>
				</div>
				<aside class="game-screen-sidebar" data-ref="sidebarPanel"></aside>
			</div>
			<div class="row mobile-stack" data-ref="actionRow">
				<input type="text" placeholder="Action type (example: vote/order/attack)" data-ref="actionType">
				<input type="text" placeholder="Payload JSON (example: {&quot;target_user_id&quot;: 3})" data-ref="actionPayload">
				<button data-ref="actionButton">Submit Action</button>
			</div>
			<div class="column" data-ref="typePanel"></div>
			<div class="status" data-ref="status"></div>
			<div class="row mobile-stack" data-ref="adminControls">
				${createGameActionButtonMarkup('start', 'adminStart', '')}
				${createGameActionButtonMarkup('end', 'adminEnd', '')}
				${createGameActionButtonMarkup('remove', 'adminDelete', '')}
			</div>
		</section>
	`);
	const refs = collectRefs(root);
	const title = refs.title;
	const userLabel = refs.userLabel;
	const subtitle = refs.subtitle;
	const typeIcon = refs.typeIcon;
	const statusIcon = refs.statusIcon;
	const phaseIcon = refs.phaseIcon;
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
	const sidebarPanel = refs.sidebarPanel;
	const status = refs.status;
	const adminControls = refs.adminControls;
	const leave = refs.leave;
	const adminStart = refs.adminStart;
	const adminEnd = refs.adminEnd;
	const adminDelete = refs.adminDelete;
	let mountedTypePanel = null;
	let mountedSidebarPanel = null;
	let sendBusy = false;
	const participantsSidebarController = config.showParticipantsPanel ? createGameParticipantsSidebarController() : null;

	refs.headingSpacer.style.flex = '1';
	leave.style.display = 'none';
	modeInfo.style.marginTop = '-6px';
	modeInfo.style.opacity = '0.8';
	refs.gameInfoIcons.style.marginTop = '-3px';
	refs.gameInfoIcons.style.marginBottom = '2px';
	composerRow.style.marginTop = '10px';
	actionRow.style.marginTop = '8px';
	typePanel.style.marginTop = '8px';
	sidebarPanel.style.display = config.showParticipantsPanel ? '' : 'none';
	adminControls.style.marginTop = '12px';
	adminControls.style.paddingTop = '10px';
	adminControls.style.borderTop = '1px solid rgba(0, 0, 0, 0.15)';

	if (participantsSidebarController) {
		mountedSidebarPanel = participantsSidebarController.root;
		sidebarPanel.appendChild(mountedSidebarPanel);
	}

	refs.back.addEventListener('click', function onBack() {
		chat.stopPolling();
		state.patch({ activeGame: null });
		state.setScreen('landing');
	});

	leave.addEventListener('click', async function onLeave() {
		const activeGame = state.state.activeGame;
		if (!activeGame || leave.style.display === 'none' || leave.disabled) {
			return;
		}

		const confirmed = await showConfirmModal({
			title: 'Confirm Leave',
			message: 'Are you sure you want to leave this game?',
			cancelLabel: 'Cancel',
			confirmLabel: 'Leave Game',
		});
		if (!confirmed) {
			return;
		}

		try {
			await api.leaveGame(activeGame.id);
			chat.stopPolling();
			state.patch({ activeGame: null });
			await refreshGames();
			state.setScreen('landing');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	sendButton.addEventListener('click', async function onSendClick() {
		const activeGame = state.state.activeGame;
		if (!activeGame || sendBusy || sendButton.disabled) {
			return;
		}

		const body = (messageInput.value || '').trim();
		if (body === '') {
			return;
		}

		sendBusy = true;
		sendButton.disabled = true;
		setGameActionButtonLabel(sendButton, 'Sending message...');
		try {
			await api.sendMessage(activeGame.id, body);
			messageInput.value = '';
			messageInput.focus();
		} catch (err) {
			setStatus(status, err.message, 'error');
		} finally {
			sendBusy = false;
			const currentGame = state.state.activeGame;
			const canChat = !!(currentGame && currentGame.permissions && currentGame.permissions.can_chat);
			sendButton.disabled = !canChat;
			setGameActionButtonLabel(sendButton, 'Send message');
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
		const infoIcons = collectGameInfoIcons(game, { hideInProgressWhenPhase: true });
		// Show the phase icon only when the game status is "in-progress"
		const _statusKey = String(game.status || '').toLowerCase();
		const _isInProgress = _statusKey === 'in-progress' || _statusKey === 'in_progress' || _statusKey === 'inprogress';
		if (!_isInProgress) {
			infoIcons.phaseIcon = null;
		}
		setGameInfoIconNode(typeIcon, infoIcons.typeIcon);
		setGameInfoIconNode(statusIcon, infoIcons.statusIcon);
		setGameInfoIconNode(phaseIcon, infoIcons.phaseIcon);

		const perms = game && game.permissions ? game.permissions : {};
		const memberRole = game && game.member_role ? game.member_role : 'none';
		const chatLocked = !perms.can_chat;
		const actionsLocked = !perms.can_act;
		const canLeave = !!perms.can_leave;

		messageInput.disabled = chatLocked;
		sendButton.disabled = chatLocked || sendBusy;
		setGameActionButtonLabel(sendButton, sendBusy ? 'Sending message...' : 'Send message');
		actionType.disabled = actionsLocked;
		actionPayload.disabled = actionsLocked;
		actionButton.disabled = actionsLocked;
		const isOwnerOrAdmin = !!perms.can_delete;
		const isOwner = String(memberRole).toLowerCase() === 'owner';
		const hasAdminRights = !!(state.state.user && state.state.user.is_admin);
		const showAdminUi = !hasAdminRights || !!state.state.adminUiEnabled;
		const canSeeManageControls = isOwnerOrAdmin && (isOwner || showAdminUi);
		adminControls.style.display = canSeeManageControls ? 'flex' : 'none';
		adminStart.style.display = canSeeManageControls ? '' : 'none';
		adminEnd.style.display = canSeeManageControls ? '' : 'none';
		adminDelete.style.display = canSeeManageControls ? '' : 'none';
		adminStart.disabled = !perms.can_start;
		adminEnd.disabled = !perms.can_end;
		adminDelete.disabled = !perms.can_delete;
		leave.style.display = canLeave ? '' : 'none';
		leave.disabled = !canLeave;

		if (!game) {
			modeInfo.textContent = '';
			if (participantsSidebarController) {
				participantsSidebarController.setGame(null);
			}
			return;
		}

		if (participantsSidebarController) {
			participantsSidebarController.setGame(game);
		}

		refreshVisibleMessageIcons(game);

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
					sidebarPanel,
					composerRow,
					actionRow,
					feed,
				},
			});
		}
	}

	function memberByUserId(game) {
		const map = new Map();
		const members = Array.isArray(game && game.members) ? game.members : [];
		members.forEach(function eachMember(member) {
			const userId = Number(member && (member.user_id ?? member.id) ? (member.user_id ?? member.id) : 0);
			map.set(userId, member || null);
		});
		return map;
	}

	function refreshVisibleMessageIcons(game) {
		const membersByUserId = memberByUserId(game);
		feed.querySelectorAll('.message-item[data-user-id]').forEach(function eachRow(node) {
			const userId = Number(node.getAttribute('data-user-id') || 0);
			const member = membersByUserId.get(userId) || null;
			const iconNode = node.querySelector('.message-item-icon');
			if (!iconNode) {
				return;
			}

			setPlayerIconImage(iconNode, member && member.icon_key ? member.icon_key : null, member && member.username ? member.username : 'Player');
		});
	}

	function appendMessages(messages) {
		messages.forEach(function eachMessage(message) {
			const line = document.createElement('div');
			line.className = 'message-item';
			line.setAttribute('data-user-id', String(message && message.user && message.user.id ? message.user.id : 0));

			const header = document.createElement('div');
			header.className = 'message-item-header';

			const icon = document.createElement('img');
			icon.className = 'player-icon message-item-icon';
			icon.setAttribute('aria-hidden', 'true');
			setPlayerIconImage(icon, message && message.user ? message.user.icon_key : null, message && message.user ? message.user.username : 'Player');

			const meta = document.createElement('small');
			meta.textContent = message.user.username + ' - ' + message.created_at;

			const text = document.createElement('div');
			text.className = 'message-item-body';
			text.textContent = message.body;

			header.appendChild(icon);
			header.appendChild(meta);
			line.appendChild(header);
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
		setSidebarPanel: function setSidebarPanel(node) {
			if (!config.showParticipantsPanel) {
				return;
			}

			if (mountedSidebarPanel === node) {
				return;
			}

			if (mountedSidebarPanel && mountedSidebarPanel.parentNode === sidebarPanel) {
				sidebarPanel.removeChild(mountedSidebarPanel);
			}

			mountedSidebarPanel = node || null;
			sidebarPanel.style.display = mountedSidebarPanel ? '' : 'none';
			if (mountedSidebarPanel) {
				sidebarPanel.appendChild(mountedSidebarPanel);
			}
		},
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
