import { clearNode, createStatusNode, labelAndInput, setStatus } from './dom.js';

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
	refresh.addEventListener('click', refreshGames);

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

	const createBlock = document.createElement('div');
	createBlock.className = 'card';
	createBlock.style.marginTop = '12px';

	const createTitle = document.createElement('h3');
	createTitle.textContent = 'Create a game';

	const gameTitle = labelAndInput('Game title', 'text', 'Friday party game');
	const gameTypeWrapper = document.createElement('div');
	gameTypeWrapper.className = 'column';

	const gameTypeLabel = document.createElement('label');
	gameTypeLabel.textContent = 'Game type';

	const gameTypeSelect = document.createElement('select');
	[
		{ value: 'chat', text: 'Chat' },
		{ value: 'mafia', text: 'Mafia' },
		{ value: 'diplomacy', text: 'Diplomacy' },
		{ value: 'rumble', text: 'Rumble' },
	].forEach(function eachType(type) {
		const option = document.createElement('option');
		option.value = type.value;
		option.textContent = type.text;
		gameTypeSelect.appendChild(option);
	});

	gameTypeWrapper.appendChild(gameTypeLabel);
	gameTypeWrapper.appendChild(gameTypeSelect);

	const createBtn = document.createElement('button');
	createBtn.className = 'primary';
	createBtn.textContent = 'Create';
	createBtn.addEventListener('click', async function onCreate() {
		try {
			setStatus(status, 'Creating game...', '');
			await api.createGame(gameTitle.input.value.trim(), gameTypeSelect.value);
			await refreshGames();
			setStatus(status, 'Game created.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	createBlock.appendChild(createTitle);
	createBlock.appendChild(gameTitle.wrapper);
	createBlock.appendChild(gameTypeWrapper);
	createBlock.appendChild(createBtn);

	const status = createStatusNode();
	status.style.marginTop = '10px';

	const listTitle = document.createElement('h3');
	listTitle.style.marginTop = '14px';
	listTitle.textContent = 'Available games';

	const list = document.createElement('div');
	list.className = 'list';

	root.appendChild(headingRow);
	root.appendChild(createBlock);
	root.appendChild(status);
	root.appendChild(listTitle);
	root.appendChild(list);

	function renderGames(games) {
		clearNode(list);

		if (!games || games.length === 0) {
			const empty = document.createElement('p');
			empty.textContent = 'No games yet. Create one to get started.';
			list.appendChild(empty);
			return;
		}

		games.forEach(function eachGame(game) {
			const item = document.createElement('div');
			item.className = 'game-item';

			const name = document.createElement('strong');
			name.textContent = game.title + ' (' + game.game_type + ')';

			const info = document.createElement('p');
			info.textContent = 'Owner: ' + game.owner_username + ' | Members: ' + game.member_count + ' | Status: ' + game.status;

			const memberList = document.createElement('p');
			const memberText = (game.members || [])
				.map(function eachMember(member) {
					return member.username + ' [' + member.role + ']';
				})
				.join(', ');
			memberList.textContent = memberText ? 'Members: ' + memberText : 'Members: none';

			const controls = document.createElement('div');
			controls.className = 'row';

			const permissions = game.permissions || {};
			const alreadyMember = !!game.is_member;
			const isOwnerOrAdmin = !!permissions.can_delete;

			const join = document.createElement('button');
			join.textContent = 'Join';
			join.disabled = alreadyMember;
			join.addEventListener('click', async function onJoin() {
				if (join.disabled) {
					return;
				}
				try {
					setStatus(status, 'Joining game...', '');
					await api.joinGame(game.id);
					await refreshGames();
					setStatus(status, 'Joined game.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const observe = document.createElement('button');
			observe.textContent = 'Observe';
			observe.disabled = alreadyMember;
			observe.addEventListener('click', async function onObserve() {
				if (observe.disabled) {
					return;
				}
				try {
					setStatus(status, 'Joining as observer...', '');
					await api.observeGame(game.id);
					await openGame(game.id);
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
				await openGame(game.id);
			});

			const start = document.createElement('button');
			start.textContent = 'Start';
			start.style.display = isOwnerOrAdmin ? '' : 'none';
			start.disabled = !permissions.can_start;
			start.addEventListener('click', async function onStart() {
				if (start.disabled) {
					return;
				}
				try {
					setStatus(status, 'Starting game...', '');
					await api.startGame(game.id);
					await refreshGames();
					setStatus(status, 'Game started.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const end = document.createElement('button');
			end.textContent = 'End';
			end.style.display = isOwnerOrAdmin ? '' : 'none';
			end.disabled = !permissions.can_end;
			end.addEventListener('click', async function onEnd() {
				if (end.disabled) {
					return;
				}
				try {
					setStatus(status, 'Ending game...', '');
					await api.endGame(game.id);
					await refreshGames();
					setStatus(status, 'Game ended.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			const remove = document.createElement('button');
			remove.textContent = 'Delete';
			remove.style.display = isOwnerOrAdmin ? '' : 'none';
			remove.disabled = !permissions.can_delete;
			remove.addEventListener('click', async function onDelete() {
				if (remove.disabled) {
					return;
				}
				try {
					setStatus(status, 'Deleting game...', '');
					await api.deleteGame(game.id);
					await refreshGames();
					setStatus(status, 'Game deleted.', 'ok');
				} catch (err) {
					setStatus(status, err.message, 'error');
				}
			});

			controls.appendChild(join);
			controls.appendChild(observe);
			controls.appendChild(open);
			controls.appendChild(start);
			controls.appendChild(end);
			controls.appendChild(remove);

			item.appendChild(name);
			item.appendChild(info);
			item.appendChild(memberList);
			item.appendChild(controls);
			list.appendChild(item);
		});
	}

	return {
		root,
		renderGames,
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
