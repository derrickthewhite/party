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
import { getInitialRoute, isSafeNext, isValidGameId } from './url-utils.js';
import { createStubGameScreen } from './screens/stubGameScreen.js';
import { createWelcomeScreen } from './screens/welcomeScreen.js';
import { CHAT_REFRESH_MS } from './config.js';

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
			intervalMs: CHAT_REFRESH_MS,
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
			currentGameId = String(detail.game.id);

			state.patch({ activeGame: detail.game });
			state.setScreen('game');
			screen.setGame(detail.game);
			screen.clearMessages();
			screen.setStatus('', '');

			startChatPolling(detail.game.id);
		} catch (err) {
			if ((err && err.message) !== 'Game not found.') {
				landingScreen.setStatus(err && err.message ? err.message : 'Unable to open game.', 'error');
				return;
			}

			chat.stopPolling();
			currentGameId = null;
			state.patch({ activeGame: null });
			state.setScreen('landing');
		}
	}

	const initialRoute = getInitialRoute();
	let currentNext = isSafeNext(initialRoute.next) ? initialRoute.next : null;
	let currentGameId = isValidGameId(initialRoute.game) ? initialRoute.game : null;
	state.patch({ adminUiEnabled: !!initialRoute.admin_ui_enabled });

	function navigateToScreen(screen) {
		state.clearStatus();
		state.setScreen(screen);
	}

	const welcomeScreen = createWelcomeScreen({ state, navigateToScreen });
	const signupScreen = createSignupScreen({
		state,
		api,
		next: function getNext() {
			return currentNext;
		},
		nextGame: function getNextGame() {
			return currentGameId;
		},
		navigateToScreen,
	});
	const signinScreen = createSigninScreen({
		state,
		api,
		refreshGames,
		next: function getNext() {
			return currentNext;
		},
		nextGame: function getNextGame() {
			return currentGameId;
		},
		openGame,
		navigateToScreen,
	});
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

		// keep URL query in sync with current screen, next and selected game (non-invasive)
		try {
			const params = new URLSearchParams();
			if (current.screen) params.set('screen', current.screen);
			if (currentNext) params.set('next', currentNext);
			if (currentGameId) {
				params.set('game', String(currentGameId));
			}
			if (current.adminUiEnabled) {
				params.set('admin_ui', '1');
			}
			const qs = params.toString();
			history.replaceState(null, '', qs ? '?' + qs : location.pathname + location.hash);
		} catch (e) {
			// ignore URL update failures
		}
	});

	async function restoreSession() {
		try {
			const result = await api.me();
			state.patch({ user: result.user });
			await refreshGames();
			// honor initial screen when authenticated,
			// and if it's a game route, open that game
			if (initialRoute.screen === 'game' && currentGameId) {
				await openGame(currentGameId);
			} else if (initialRoute.screen) {
				state.setScreen(initialRoute.screen);
			} else {
				state.setScreen('landing');
			}
		} catch (err) {
			// when not authenticated, honor initial screen (e.g. signup) else welcome
			if (initialRoute.screen) state.setScreen(initialRoute.screen);
			else state.setScreen('welcome');
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
