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
	const gameType = labelAndInput('Game type', 'text', 'generic');

	const createBtn = document.createElement('button');
	createBtn.className = 'primary';
	createBtn.textContent = 'Create';
	createBtn.addEventListener('click', async function onCreate() {
		try {
			setStatus(status, 'Creating game...', '');
			await api.createGame(gameTitle.input.value.trim(), gameType.input.value.trim() || 'generic');
			await refreshGames();
			setStatus(status, 'Game created.', 'ok');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	createBlock.appendChild(createTitle);
	createBlock.appendChild(gameTitle.wrapper);
	createBlock.appendChild(gameType.wrapper);
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

			const controls = document.createElement('div');
			controls.className = 'row';

			const join = document.createElement('button');
			join.textContent = 'Join';
			join.addEventListener('click', async function onJoin() {
				try {
					setStatus(status, 'Joining game...', '');
					await api.joinGame(game.id);
					setStatus(status, 'Joined game.', 'ok');
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

			controls.appendChild(join);
			controls.appendChild(open);

			item.appendChild(name);
			item.appendChild(info);
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
