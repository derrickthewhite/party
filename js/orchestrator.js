import { api } from './api.js';
import { createChatTransport } from './chatTransport.js';
import { state } from './state.js';
import { createChatGameScreen } from './screens/chatGameScreen.js';
import { createDiplomacyGameScreen } from './screens/diplomacyGameScreen.js';
import { createLandingScreen } from './screens/landingScreen.js';
import { createMafiaGameScreen } from './screens/mafiaGameScreen.js';
import { createRumbleGameScreen } from './screens/rumbleGameScreen.js';
import { createSigninScreen } from './screens/signinScreen.js';
import { createSignupScreen } from './screens/signupScreen.js';
import { createStubGameScreen } from './screens/stubGameScreen.js';
import { createWelcomeScreen } from './screens/welcomeScreen.js';

export function initializePartyApp() {
	const app = document.getElementById('app');
	const chat = createChatTransport(api);

	let landingScreen;
	let gameScreens;

	function normalizedGameType(game) {
		const raw = String((game && game.game_type) || 'chat').toLowerCase();
		if (raw === 'stub' || raw === 'chat' || raw === 'diplomacy' || raw === 'mafia' || raw === 'rumble') {
			return raw;
		}

		return 'chat';
	}

	function activeGameScreenByGame(game) {
		return gameScreens[normalizedGameType(game)] || gameScreens.chat;
	}

	function activeGameScreen() {
		return activeGameScreenByGame(state.state.activeGame || null);
	}

	async function refreshGames() {
		const result = await api.listGames();
		state.patch({ games: result.games || [] });
	}

	function startChatPolling(gameId) {
		chat.stopPolling();

		chat.startPolling({
			gameId,
			intervalMs: 2500,
			getSinceId: function getSinceId() {
				return state.getMessageCursor(gameId);
			},
			onCursor: function onCursor(lastId) {
				state.setMessageCursor(gameId, lastId);
			},
			onMessages: function onMessages(messages) {
				activeGameScreen().appendMessages(messages);
			},
			onError: function onError(err) {
				activeGameScreen().setStatus(err.message, 'error');
			},
		});
	}

	async function openGame(gameId) {
		try {
			let detail = await api.gameDetail(gameId);
			const role = String((detail.game && detail.game.member_role) || '').toLowerCase();
			const isObserver = role === 'observer';
			if (!detail.game.is_member && !isObserver) {
				await api.joinGame(gameId);
				detail = await api.gameDetail(gameId);
			}

			const screen = activeGameScreenByGame(detail.game);

			state.patch({ activeGame: detail.game });
			state.setScreen('game');
			screen.setGame(detail.game);
			screen.clearMessages();
			screen.setStatus('', '');

			startChatPolling(detail.game.id);
		} catch (err) {
			landingScreen.setStatus(err.message, 'error');
		}
	}

	const welcomeScreen = createWelcomeScreen({ state });
	const signupScreen = createSignupScreen({ state, api });
	const signinScreen = createSigninScreen({ state, api, refreshGames });
	landingScreen = createLandingScreen({
		api,
		state,
		chat,
		refreshGames,
		openGame,
	});
	gameScreens = {
		chat: createChatGameScreen({ api, state, chat, refreshGames }),
		stub: createStubGameScreen({ api, state, chat, refreshGames }),
		diplomacy: createDiplomacyGameScreen({ api, state, chat, refreshGames }),
		mafia: createMafiaGameScreen({ api, state, chat, refreshGames }),
		rumble: createRumbleGameScreen({ api, state, chat, refreshGames }),
	};

	app.appendChild(welcomeScreen.root);
	app.appendChild(signupScreen.root);
	app.appendChild(signinScreen.root);
	app.appendChild(landingScreen.root);
	Object.values(gameScreens).forEach(function eachScreen(screen) {
		app.appendChild(screen.root);
	});

	state.subscribe(function onStateChanged(current) {
		toggleScreen(welcomeScreen.root, current.screen === 'welcome');
		toggleScreen(signupScreen.root, current.screen === 'signup');
		toggleScreen(signinScreen.root, current.screen === 'signin');
		toggleScreen(landingScreen.root, current.screen === 'landing');

		Object.entries(gameScreens).forEach(function eachEntry(entry) {
			const type = entry[0];
			const screen = entry[1];
			const show = current.screen === 'game' && normalizedGameType(current.activeGame) === type;
			toggleScreen(screen.root, show);
		});

		if (current.screen === 'landing') {
			landingScreen.renderGames(current.games);
		}
	});

	async function restoreSession() {
		try {
			const result = await api.me();
			state.patch({ user: result.user });
			await refreshGames();
			state.setScreen('landing');
		} catch (err) {
			state.setScreen('welcome');
		}
	}

	restoreSession();
}

function toggleScreen(node, show) {
	if (show) {
		node.classList.remove('hidden');
	} else {
		node.classList.add('hidden');
	}
}
