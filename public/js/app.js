(function bootstrapPartyApp() {
  const state = window.PartyState;
  const api = window.PartyApi;
  const views = window.PartyViews;
  const chat = window.ChatTransport;

  const app = document.getElementById('app');

  const welcomeView = views.createWelcomeView({
    onGoSignup: function () {
      state.clearStatus();
      state.setScreen('signup');
    },
    onGoSignin: function () {
      state.clearStatus();
      state.setScreen('signin');
    },
  });

  const signupView = views.createSignupView({
    onSubmit: async function (payload) {
      try {
        signupView.setStatus('Creating account...', '');
        await api.signup(payload.username, payload.password, payload.inviteKey);
        signupView.setStatus('Account created. You can sign in now.', 'ok');
      } catch (err) {
        signupView.setStatus(err.message, 'error');
      }
    },
    onBack: function () {
      state.setScreen('welcome');
    },
  });

  const signinView = views.createSigninView({
    onSubmit: async function (payload) {
      try {
        signinView.setStatus('Signing in...', '');
        const result = await api.signin(payload.username, payload.password);
        state.patch({ user: result.user });
        signinView.setStatus('', '');
        await refreshGames();
        state.setScreen('landing');
      } catch (err) {
        signinView.setStatus(err.message, 'error');
      }
    },
    onBack: function () {
      state.setScreen('welcome');
    },
  });

  const landingView = views.createLandingView({
    onRefresh: refreshGames,
    onSignout: async function () {
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
    },
    onCreate: async function (payload) {
      try {
        landingView.setStatus('Creating game...', '');
        await api.createGame(payload.title, payload.gameType);
        await refreshGames();
        landingView.setStatus('Game created.', 'ok');
      } catch (err) {
        landingView.setStatus(err.message, 'error');
      }
    },
    onJoin: async function (gameId) {
      try {
        landingView.setStatus('Joining game...', '');
        await api.joinGame(gameId);
        landingView.setStatus('Joined game.', 'ok');
      } catch (err) {
        landingView.setStatus(err.message, 'error');
      }
    },
    onOpen: async function (gameId) {
      await openGame(gameId);
    },
  });

  const gameView = views.createGameView({
    onBack: function () {
      chat.stopPolling();
      state.patch({ activeGame: null });
      state.setScreen('landing');
    },
    onSend: async function (text) {
      const activeGame = state.state.activeGame;
      if (!activeGame) {
        return;
      }

      const body = (text || '').trim();
      if (body === '') {
        return;
      }

      try {
        await api.sendMessage(activeGame.id, body);
      } catch (err) {
        gameView.setStatus(err.message, 'error');
      }
    },
  });

  app.appendChild(welcomeView.root);
  app.appendChild(signupView.root);
  app.appendChild(signinView.root);
  app.appendChild(landingView.root);
  app.appendChild(gameView.root);

  state.subscribe(function onStateChanged(current) {
    toggleScreen(welcomeView.root, current.screen === 'welcome');
    toggleScreen(signupView.root, current.screen === 'signup');
    toggleScreen(signinView.root, current.screen === 'signin');
    toggleScreen(landingView.root, current.screen === 'landing');
    toggleScreen(gameView.root, current.screen === 'game');

    if (current.screen === 'landing') {
      landingView.renderGames(current.games);
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

  async function refreshGames() {
    const result = await api.listGames();
    state.patch({ games: result.games || [] });
  }

  async function openGame(gameId) {
    try {
      const detail = await api.gameDetail(gameId);
      if (!detail.game.is_member) {
        await api.joinGame(gameId);
      }

      state.patch({ activeGame: detail.game });
      state.setScreen('game');
      gameView.setGame(detail.game);
      gameView.clearMessages();
      gameView.setStatus('', '');

      startChatPolling(detail.game.id);
    } catch (err) {
      landingView.setStatus(err.message, 'error');
    }
  }

  function startChatPolling(gameId) {
    chat.stopPolling();

    chat.startPolling({
      gameId: gameId,
      intervalMs: 2500,
      getSinceId: function () {
        return state.getMessageCursor(gameId);
      },
      onCursor: function (lastId) {
        state.setMessageCursor(gameId, lastId);
      },
      onMessages: function (messages) {
        gameView.appendMessages(messages);
      },
      onError: function (err) {
        gameView.setStatus(err.message, 'error');
      },
    });
  }

  function toggleScreen(node, show) {
    if (show) {
      node.classList.remove('hidden');
    } else {
      node.classList.add('hidden');
    }
  }

  restoreSession();
})();
