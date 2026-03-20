import { api } from './api.js';
import { createChatTransport } from './chatTransport.js';
import { state } from './state.js';
import { createGameScreen } from './screens/gameScreen.js';
import { createLandingScreen } from './screens/landingScreen.js';
import { createSigninScreen } from './screens/signinScreen.js';
import { createSignupScreen } from './screens/signupScreen.js';
import { createWelcomeScreen } from './screens/welcomeScreen.js';

export function initializePartyApp() {
  const app = document.getElementById('app');
  const chat = createChatTransport(api);

  let landingScreen;
  let gameScreen;

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
        gameScreen.appendMessages(messages);
      },
      onError: function onError(err) {
        gameScreen.setStatus(err.message, 'error');
      },
    });
  }

  async function openGame(gameId) {
    try {
      const detail = await api.gameDetail(gameId);
      if (!detail.game.is_member) {
        await api.joinGame(gameId);
      }

      state.patch({ activeGame: detail.game });
      state.setScreen('game');
      gameScreen.setGame(detail.game);
      gameScreen.clearMessages();
      gameScreen.setStatus('', '');

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
  gameScreen = createGameScreen({ api, state, chat });

  app.appendChild(welcomeScreen.root);
  app.appendChild(signupScreen.root);
  app.appendChild(signinScreen.root);
  app.appendChild(landingScreen.root);
  app.appendChild(gameScreen.root);

  state.subscribe(function onStateChanged(current) {
    toggleScreen(welcomeScreen.root, current.screen === 'welcome');
    toggleScreen(signupScreen.root, current.screen === 'signup');
    toggleScreen(signinScreen.root, current.screen === 'signin');
    toggleScreen(landingScreen.root, current.screen === 'landing');
    toggleScreen(gameScreen.root, current.screen === 'game');

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
