import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate, setStatus, showConfirmModal } from './dom.js';
import { createGameActionButtonMarkup, setGameActionButtonLabel } from './gameActionButtons.js';
import { collectGameInfoIcons, setGameInfoIconNode, getMemberBadgeIcon } from '../gameStateIcons.js';
import { LANDING_REFRESH_MS } from '../config.js';

export function createLandingScreen(deps) {
	const api = deps.api;
	const state = deps.state;
	const chat = deps.chat;
	const refreshGames = deps.refreshGames;
	const openGame = deps.openGame;

	const root = createNodeFromHtml(`
		<section class="screen card">
			<div class="row">
				<h2>Game Lobby</h2>
				<div data-ref="headingSpacer"></div>
				<button data-ref="adminUiToggle">Admin UI: On</button>
				${createGameActionButtonMarkup('refresh', 'refresh', '')}
				<button class="link" data-ref="signout">Sign out</button>
			</div>
			<p class="top-user-label" data-ref="userLabel"></p>
			<div class="card" data-ref="createBlock">
				<h3>Create a game</h3>
				<div class="column">
					<input type="text" placeholder="Game Title" data-ref="gameTitleInput">
				</div>
				<div class="row mobile-stack" data-ref="createControlsRow">
					<div class="column" data-ref="gameTypeWrapper">
						<label>Game type</label>
						<select data-ref="gameTypeSelect">
							<option value="chat">Chat</option>
							<option value="mafia">Mafia</option>
							<option value="diplomacy">Diplomacy</option>
							<option value="rumble">Rumble</option>
							<option value="stub" data-ref="stubOption">Stub</option>
						</select>
					</div>
					${createGameActionButtonMarkup('create-game', 'createBtn', 'primary lobby-create-button')}
				</div>
			</div>
			<div class="status" data-ref="status"></div>
			<div class="row" data-ref="listHeader">
				<h3>Available games</h3>
				<div data-ref="listHeaderSpacer"></div>
				${createGameActionButtonMarkup('refresh', 'listRefresh', '')}
			</div>
			<div class="list" data-ref="list">
				<p data-ref="emptyListNode">No games yet. Create one to get started.</p>
			</div>
		</section>
	`);
	const refs = collectRefs(root);
	const adminUiToggle = refs.adminUiToggle;
	const refresh = refs.refresh;
	const signout = refs.signout;
	const userLabel = refs.userLabel;
	const gameTitleInput = refs.gameTitleInput;
	const gameTypeSelect = refs.gameTypeSelect;
	const createBtn = refs.createBtn;
	const status = refs.status;
	const listRefresh = refs.listRefresh;
	const list = refs.list;
	const emptyListNode = refs.emptyListNode;
	const rowTemplate = createTemplate(`
		<div class="game-item">
			<img class="game-member-star" data-ref="memberStar" alt="Member" style="display:none;" aria-hidden="true">
			<strong data-ref="name"></strong>
			<p>
				<span data-ref="ownerInfo"></span>
				<span> | </span>
				<span class="game-players-summary" data-ref="playersInfo"></span>
				<span> | </span>
				<span class="game-observers-summary" data-ref="observersInfo"></span>
				<span> | </span>
				<span data-ref="statusInfo"></span>
				<span data-ref="progressSeparator"></span>
				<span data-ref="progressInfo"></span>
			</p>
			<div class="row game-item-bar">
				<div class="row game-item-controls-left">
					${createGameActionButtonMarkup('open', 'open', 'secondary')}
					${createGameActionButtonMarkup('join', 'join', '')}
					${createGameActionButtonMarkup('leave', 'leave', '')}
					${createGameActionButtonMarkup('observe', 'observe', '')}
				</div>
				<div class="game-info-icons game-info-icons-inline" data-ref="gameInfoIcons">
					<img class="game-state-icon" data-ref="typeIcon" alt="" aria-hidden="true">
					<img class="game-state-icon" data-ref="statusIcon" alt="" aria-hidden="true">
					<img class="game-state-icon" data-ref="phaseIcon" alt="" aria-hidden="true">
				</div>
				<div class="row game-item-controls-right">
					${createGameActionButtonMarkup('start', 'start', '')}
					${createGameActionButtonMarkup('end', 'end', '')}
					${createGameActionButtonMarkup('remove', 'remove', '')}
				</div>
			</div>
		</div>
	`);

	refs.headingSpacer.style.flex = '1';
	refs.createBlock.style.marginTop = '12px';
	refs.createControlsRow.style.alignItems = 'flex-end';
	refs.createControlsRow.style.gap = '8px';
	refs.gameTypeWrapper.style.flex = '1';
	createBtn.style.alignSelf = 'flex-end';
	status.style.marginTop = '10px';
	refs.listHeader.style.marginTop = '14px';
	refs.listHeaderSpacer.style.flex = '1';
	let headingRefreshBusy = false;
	let createBusy = false;
	refresh.addEventListener('click', async function onRefreshHeading() {
		if (headingRefreshBusy) {
			return;
		}

		headingRefreshBusy = true;
		refresh.disabled = true;
		setGameActionButtonLabel(refresh, 'Refreshing...');
		try {
			await refreshGames();
		} catch (err) {
			setStatus(status, err.message, 'error');
		} finally {
			headingRefreshBusy = false;
			refresh.disabled = false;
			setGameActionButtonLabel(refresh, 'Refresh');
		}
	});
	signout.addEventListener('click', async function onSignout() {
		try {
			await api.signout();
		} catch (err) {
		}
		chat.stopPolling();
		state.patch({
			user: null,
			activeGame: null,
		});
		state.setScreen('welcome');
	});
	const gameTypeOptions = {
		stub: refs.stubOption,
	};

	function hasAdminRights() {
		return !!(state.state.user && state.state.user.is_admin);
	}

	function isAdminUiEnabled() {
		if (!hasAdminRights()) {
			return true;
		}

		return !!state.state.adminUiEnabled;
	}

	function syncAdminUiToggle() {
		const canToggle = hasAdminRights();
		adminUiToggle.style.display = canToggle ? '' : 'none';
		adminUiToggle.textContent = 'Admin UI: ' + (isAdminUiEnabled() ? 'On' : 'Off');
	}

	function syncGameTypeOptions() {
		const stubEnabled = hasAdminRights() && isAdminUiEnabled();
		gameTypeOptions.stub.hidden = !stubEnabled;
		if (!stubEnabled && gameTypeSelect.value === 'stub') {
			gameTypeSelect.value = 'chat';
		}
	}

	adminUiToggle.addEventListener('click', function onToggleAdminUi() {
		if (!hasAdminRights()) {
			return;
		}

		state.patch({ adminUiEnabled: !state.state.adminUiEnabled });
		syncAdminUiToggle();
		syncGameTypeOptions();
	});

	syncAdminUiToggle();
	syncGameTypeOptions();
	createBtn.addEventListener('click', async function onCreate() {
		if (createBusy) {
			return;
		}

		createBusy = true;
		createBtn.disabled = true;
		setGameActionButtonLabel(createBtn, 'Creating game...');
		try {
			setStatus(status, 'Creating game...', '');
			await api.createGame(gameTitleInput.value.trim(), gameTypeSelect.value);
			await refreshGames();
			setStatus(status, 'Game created.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		} finally {
			createBusy = false;
			createBtn.disabled = false;
			setGameActionButtonLabel(createBtn, 'Create game');
		}
	});
	let listRefreshBusy = false;
	listRefresh.addEventListener('click', async function onListRefresh() {
		if (listRefreshBusy) {
			return;
		}

		listRefreshBusy = true;
		listRefresh.disabled = true;
		setGameActionButtonLabel(listRefresh, 'Refreshing...');
		try {
			await refreshGames();
		} catch (err) {
			setStatus(status, err.message, 'error');
		} finally {
			listRefreshBusy = false;
			listRefresh.disabled = false;
			setGameActionButtonLabel(listRefresh, 'Refresh');
		}
	});
	const gameRowsById = new Map();
	let autoRefreshId = null;
	let autoRefreshBusy = false;

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

		autoRefreshId = setInterval(async function autoRefreshTick() {
			if (autoRefreshBusy) {
				return;
			}

			const current = state.state;
			if (current.screen !== 'landing' || !current.user) {
				stopAutoRefresh();
				return;
			}

			autoRefreshBusy = true;
			try {
				await refreshGames();
			} catch (err) {
			} finally {
				autoRefreshBusy = false;
			}
		}, LANDING_REFRESH_MS);
	}

	state.subscribe(function onLandingStateChanged(current) {
		if (current.screen === 'landing' && current.user) {
			startAutoRefresh();
			return;
		}

		stopAutoRefresh();
	});

	function renderGames(games) {
		syncAdminUiToggle();
		syncGameTypeOptions();
		const user = state.state.user || {};
		userLabel.textContent = user.username ? 'Signed in as: ' + user.username : '';

		const rows = Array.isArray(games) ? games : [];
		const activeIds = new Set();

		function ensureGameRow(gameId) {
			const key = String(Number(gameId));
			if (gameRowsById.has(key)) {
				return gameRowsById.get(key);
			}

			const item = cloneTemplateNode(rowTemplate);
			const itemRefs = collectRefs(item);

			const rowState = { game: null };

			const join = itemRefs.join;
			join.addEventListener('click', async function onJoin() {
				const active = rowState.game;
				if (!active || join.style.display === 'none') {
					return;
				}
				try {
					setStatus(status, 'Joining game...', '');
					await api.joinGame(active.id);
					await refreshGames();
					setStatus(status, 'Joined game.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const observe = itemRefs.observe;
			observe.addEventListener('click', async function onObserve() {
				const active = rowState.game;
				if (!active || observe.style.display === 'none') {
					return;
				}
				try {
					setStatus(status, 'Joining as observer...', '');
					await api.observeGame(active.id);
					await openGame(active.id);
					await refreshGames();
					setStatus(status, 'Joined as observer.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const leave = itemRefs.leave;
			leave.addEventListener('click', async function onLeave() {
				const active = rowState.game;
				if (!active || leave.style.display === 'none') {
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
					setStatus(status, 'Leaving game...', '');
					await api.leaveGame(active.id);
					await refreshGames();
					setStatus(status, 'Left game.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const open = itemRefs.open;
			open.addEventListener('click', async function onOpen() {
				const active = rowState.game;
				if (!active) {
					return;
				}
				await openGame(active.id);
			});

			const start = itemRefs.start;
			start.addEventListener('click', async function onStart() {
				const active = rowState.game;
				if (!active || start.disabled) {
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
					setStatus(status, 'Starting game...', '');
					await api.startGame(active.id);
					await refreshGames();
					setStatus(status, 'Game started.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const end = itemRefs.end;
			end.addEventListener('click', async function onEnd() {
				const active = rowState.game;
				if (!active || end.disabled) {
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
					setStatus(status, 'Ending game...', '');
					await api.endGame(active.id);
					await refreshGames();
					setStatus(status, 'Game ended.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const remove = itemRefs.remove;
			remove.addEventListener('click', async function onDelete() {
				const active = rowState.game;
				if (!active || remove.disabled) {
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
					setStatus(status, 'Deleting game...', '');
					await api.deleteGame(active.id);
					await refreshGames();
					setStatus(status, 'Game deleted.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const refs = {
				item,
				name: itemRefs.name,
				ownerInfo: itemRefs.ownerInfo,
				playersInfo: itemRefs.playersInfo,
				observersInfo: itemRefs.observersInfo,
				statusInfo: itemRefs.statusInfo,
				progressSeparator: itemRefs.progressSeparator,
				progressInfo: itemRefs.progressInfo,
				typeIcon: itemRefs.typeIcon,
				statusIcon: itemRefs.statusIcon,
				phaseIcon: itemRefs.phaseIcon,
				memberStar: itemRefs.memberStar,
				join,
				observe,
				leave,
				open,
				start,
				end,
				remove,
				rowState,
			};
			gameRowsById.set(key, refs);
			list.appendChild(item);
			return refs;
		}

		rows.forEach(function eachGame(game) {
			const key = String(Number(game.id));
			activeIds.add(key);
			const refs = ensureGameRow(game.id);
			refs.rowState.game = game;

			refs.name.textContent = game.title + ' (' + game.game_type + ')';
			refs.ownerInfo.textContent = 'Owner: ' + game.owner_username;
			refs.playersInfo.textContent = 'Players: ' + Number(game.player_count || 0);
			refs.observersInfo.textContent = 'Observers: ' + Number(game.observer_count || 0);
			refs.statusInfo.textContent = 'Status: ' + game.status;
			const infoIcons = collectGameInfoIcons(game, { hideInProgressWhenPhase: true });
			// Show the phase icon only when the game status is "in-progress"
			const _statusKey = String(game.status || '').toLowerCase();
			const _isInProgress = _statusKey === 'in-progress' || _statusKey === 'in_progress' || _statusKey === 'inprogress';
			if (!_isInProgress) {
				infoIcons.phaseIcon = null;
			}
			setGameInfoIconNode(refs.typeIcon, infoIcons.typeIcon);
			setGameInfoIconNode(refs.statusIcon, infoIcons.statusIcon);
			setGameInfoIconNode(refs.phaseIcon, infoIcons.phaseIcon);
			// Member star: show if current user is a member of the game
			if (refs.memberStar) {
				const alreadyMember = !!game.is_member;
				const badge = alreadyMember ? getMemberBadgeIcon() : null;
				setGameInfoIconNode(refs.memberStar, badge);
			}

			const players = (game.members || []).filter(function eachMember(member) {
				return String(member.role || '').toLowerCase() !== 'observer';
			});
			const observers = (game.members || []).filter(function eachMember(member) {
				return String(member.role || '').toLowerCase() === 'observer';
			});
			const playerText = players.length > 0
				? players.map(function eachPlayer(member) {
					return member.username;
				}).join('\n')
				: 'None';
			const observerText = observers.length > 0
				? observers.map(function eachObserver(member) {
					return member.username;
				}).join('\n')
				: 'None';
			refs.playersInfo.title = 'Players:\n' + playerText;
			refs.observersInfo.title = 'Observers:\n' + observerText;
			refs.item.title = '';

			const hasPhase = game.phase != null && String(game.phase).trim() !== '';
			const hasRound = game.current_round != null && !Number.isNaN(Number(game.current_round));
			if (hasPhase || hasRound) {
				const progressParts = [];
				if (hasPhase) {
					progressParts.push('Phase: ' + String(game.phase));
				}
				if (hasRound) {
					progressParts.push('Round: ' + String(Number(game.current_round)));
				}
				refs.progressSeparator.textContent = ' | ';
				refs.progressInfo.textContent = progressParts.join(' | ');
			} else {
				refs.progressSeparator.textContent = '';
				refs.progressInfo.textContent = '';
			}

			const permissions = game.permissions || {};
			const alreadyMember = !!game.is_member;
			const memberRole = String(game.member_role || '').toLowerCase();
			const observerRole = memberRole === 'observer';
			const currentUser = state.state.user || {};
			const inMemberList = (game.members || []).some(function isCurrentMember(member) {
				if (!member || !currentUser) {
					return false;
				}

				if (currentUser.id != null && member.user_id != null && Number(member.user_id) === Number(currentUser.id)) {
					return true;
				}

				return !!currentUser.username && member.username === currentUser.username;
			});

			const canOpen = alreadyMember || observerRole || inMemberList;
			const isOwnerOrAdmin = !!permissions.can_delete;
			const isOwner = memberRole === 'owner';
			const showAdminUi = isAdminUiEnabled();
			const canSeeManageControls = isOwnerOrAdmin && (isOwner || showAdminUi);
			const canJoinPlayer = !!permissions.can_join_player;
			const canJoinObserver = !!permissions.can_join_observer;
			const canLeave = !!permissions.can_leave;

			refs.join.style.display = canJoinPlayer ? '' : 'none';
			refs.observe.style.display = canJoinObserver ? '' : 'none';
			refs.leave.style.display = canLeave ? '' : 'none';
			refs.open.style.display = canOpen ? '' : 'none';

			refs.start.style.display = canSeeManageControls ? '' : 'none';
			refs.end.style.display = canSeeManageControls ? '' : 'none';
			refs.remove.style.display = canSeeManageControls ? '' : 'none';

			refs.start.disabled = !permissions.can_start;
			refs.end.disabled = !permissions.can_end;
			refs.remove.disabled = !permissions.can_delete;

			list.appendChild(refs.item);
		});

		Array.from(gameRowsById.keys()).forEach(function eachExisting(key) {
			if (activeIds.has(key)) {
				return;
			}

			const refs = gameRowsById.get(key);
			if (refs && refs.item.parentNode === list) {
				list.removeChild(refs.item);
			}
			gameRowsById.delete(key);
		});

		emptyListNode.style.display = rows.length === 0 ? '' : 'none';
		if (emptyListNode.parentNode !== list) {
			list.appendChild(emptyListNode);
		}
	}

	return {
		root,
		renderGames,
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
