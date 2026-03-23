import { createStatusNode, setStatus, showConfirmModal } from './dom.js';

export function createLandingScreen(deps) {
	const api = deps.api;
	const state = deps.state;
	const chat = deps.chat;
	const refreshGames = deps.refreshGames;
	const openGame = deps.openGame;

	const root = document.createElement('section');
	root.className = 'screen card';

	const headingRow = document.createElement('div');
	headingRow.className = 'row';

	const title = document.createElement('h2');
	title.textContent = 'Game Lobby';

	const spacer = document.createElement('div');
	spacer.style.flex = '1';

	const refresh = document.createElement('button');
	refresh.textContent = 'Refresh';
	let headingRefreshBusy = false;
	refresh.addEventListener('click', async function onRefreshHeading() {
		if (headingRefreshBusy) {
			return;
		}

		headingRefreshBusy = true;
		refresh.disabled = true;
		refresh.textContent = 'Refreshing...';
		try {
			await refreshGames();
		} catch (err) {
			setStatus(status, err.message, 'error');
		} finally {
			headingRefreshBusy = false;
			refresh.disabled = false;
			refresh.textContent = 'Refresh';
		}
	});

	const signout = document.createElement('button');
	signout.className = 'link';
	signout.textContent = 'Sign out';
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

	headingRow.appendChild(title);
	headingRow.appendChild(spacer);
	headingRow.appendChild(refresh);
	headingRow.appendChild(signout);

	const userLabel = document.createElement('p');
	userLabel.className = 'top-user-label';

	const createBlock = document.createElement('div');
	createBlock.className = 'card';
	createBlock.style.marginTop = '12px';

	const createTitle = document.createElement('h3');
	createTitle.textContent = 'Create a game';

	const gameTitleWrapper = document.createElement('div');
	gameTitleWrapper.className = 'column';

	const gameTitleInput = document.createElement('input');
	gameTitleInput.type = 'text';
	gameTitleInput.placeholder = 'Game Title';

	gameTitleWrapper.appendChild(gameTitleInput);

	const gameTypeWrapper = document.createElement('div');
	gameTypeWrapper.className = 'column';

	const gameTypeLabel = document.createElement('label');
	gameTypeLabel.textContent = 'Game type';

	const gameTypeSelect = document.createElement('select');
	const gameTypeOptions = {
		chat: null,
		mafia: null,
		diplomacy: null,
		rumble: null,
		stub: null,
	};

	function createGameTypeOption(value, text) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = text;
		gameTypeSelect.appendChild(option);
		return option;
	}

	gameTypeOptions.chat = createGameTypeOption('chat', 'Chat');
	gameTypeOptions.mafia = createGameTypeOption('mafia', 'Mafia');
	gameTypeOptions.diplomacy = createGameTypeOption('diplomacy', 'Diplomacy');
	gameTypeOptions.rumble = createGameTypeOption('rumble', 'Rumble');
	gameTypeOptions.stub = createGameTypeOption('stub', 'Stub');

	function syncGameTypeOptions() {
		const isAdmin = !!(state.state.user && state.state.user.is_admin);
		gameTypeOptions.stub.hidden = !isAdmin;
		if (!isAdmin && gameTypeSelect.value === 'stub') {
			gameTypeSelect.value = 'chat';
		}
	}

	syncGameTypeOptions();

	gameTypeWrapper.appendChild(gameTypeLabel);
	gameTypeWrapper.appendChild(gameTypeSelect);

	const createBtn = document.createElement('button');
	createBtn.className = 'primary lobby-create-button';
	createBtn.textContent = 'Create';
	createBtn.addEventListener('click', async function onCreate() {
		try {
			setStatus(status, 'Creating game...', '');
			await api.createGame(gameTitleInput.value.trim(), gameTypeSelect.value);
			await refreshGames();
			setStatus(status, 'Game created.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	createBlock.appendChild(createTitle);
	createBlock.appendChild(gameTitleWrapper);
	createBlock.appendChild(gameTypeWrapper);
	createBlock.appendChild(createBtn);

	const status = createStatusNode();
	status.style.marginTop = '10px';

	const listHeader = document.createElement('div');
	listHeader.className = 'row';
	listHeader.style.marginTop = '14px';

	const listTitle = document.createElement('h3');
	listTitle.textContent = 'Available games';

	const listHeaderSpacer = document.createElement('div');
	listHeaderSpacer.style.flex = '1';

	const listRefresh = document.createElement('button');
	listRefresh.textContent = 'Refresh';
	let listRefreshBusy = false;
	listRefresh.addEventListener('click', async function onListRefresh() {
		if (listRefreshBusy) {
			return;
		}

		listRefreshBusy = true;
		listRefresh.disabled = true;
		listRefresh.textContent = 'Refreshing...';
		try {
			await refreshGames();
		} catch (err) {
			setStatus(status, err.message, 'error');
		} finally {
			listRefreshBusy = false;
			listRefresh.disabled = false;
			listRefresh.textContent = 'Refresh';
		}
	});

	listHeader.appendChild(listTitle);
	listHeader.appendChild(listHeaderSpacer);
	listHeader.appendChild(listRefresh);

	const list = document.createElement('div');
	list.className = 'list';
	const gameRowsById = new Map();
	const emptyListNode = document.createElement('p');
	emptyListNode.textContent = 'No games yet. Create one to get started.';
	list.appendChild(emptyListNode);

	root.appendChild(headingRow);
	root.appendChild(userLabel);
	root.appendChild(createBlock);
	root.appendChild(status);
	root.appendChild(listHeader);
	root.appendChild(list);

	function renderGames(games) {
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

			const item = document.createElement('div');
			item.className = 'game-item';

			const name = document.createElement('strong');
			const info = document.createElement('p');

			const ownerInfo = document.createElement('span');
			const ownerSeparator = document.createTextNode(' | ');
			const memberInfo = document.createElement('span');
			memberInfo.className = 'game-members-summary';
			const statusSeparator = document.createTextNode(' | ');
			const statusInfo = document.createElement('span');
			const progressSeparator = document.createTextNode('');
			const progressInfo = document.createElement('span');

			info.appendChild(ownerInfo);
			info.appendChild(ownerSeparator);
			info.appendChild(memberInfo);
			info.appendChild(statusSeparator);
			info.appendChild(statusInfo);
			info.appendChild(progressSeparator);
			info.appendChild(progressInfo);

			const controls = document.createElement('div');
			controls.className = 'row game-item-bar';

			const primaryControls = document.createElement('div');
			primaryControls.className = 'row game-item-controls-left';

			const adminControls = document.createElement('div');
			adminControls.className = 'row game-item-controls-right';

			const rowState = { game: null };

			const join = document.createElement('button');
			join.textContent = 'Join';
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

			const observe = document.createElement('button');
			observe.textContent = 'Observe';
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

			const open = document.createElement('button');
			open.className = 'secondary';
			open.textContent = 'Open';
			open.addEventListener('click', async function onOpen() {
				const active = rowState.game;
				if (!active) {
					return;
				}
				await openGame(active.id);
			});

			const start = document.createElement('button');
			start.textContent = 'Start';
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

			const end = document.createElement('button');
			end.textContent = 'End';
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

			const remove = document.createElement('button');
			remove.textContent = 'Delete';
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

			primaryControls.appendChild(join);
			primaryControls.appendChild(observe);
			primaryControls.appendChild(open);
			adminControls.appendChild(start);
			adminControls.appendChild(end);
			adminControls.appendChild(remove);
			controls.appendChild(primaryControls);
			controls.appendChild(adminControls);

			item.appendChild(name);
			item.appendChild(info);
			item.appendChild(controls);

			const refs = {
				item,
				name,
				ownerInfo,
				memberInfo,
				statusInfo,
				progressSeparator,
				progressInfo,
				join,
				observe,
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
			refs.memberInfo.textContent = 'Members: ' + game.member_count;
			refs.statusInfo.textContent = 'Status: ' + game.status;

			const memberText = (game.members || [])
				.map(function eachMember(member) {
					return member.username + ' [' + member.role + ']';
				})
				.join('\n');
			refs.memberInfo.title = memberText ? 'Members:\n' + memberText : 'Members: none';
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
			const canJoinPlayer = !!permissions.can_join_player;
			const canJoinObserver = !!permissions.can_join_observer;

			refs.join.style.display = canJoinPlayer ? '' : 'none';
			refs.observe.style.display = canJoinObserver ? '' : 'none';
			refs.open.style.display = canOpen ? '' : 'none';

			refs.start.style.display = isOwnerOrAdmin ? '' : 'none';
			refs.end.style.display = isOwnerOrAdmin ? '' : 'none';
			refs.remove.style.display = isOwnerOrAdmin ? '' : 'none';

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
