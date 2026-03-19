window.PartyViews = (function createViewsModule() {
  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function labelAndInput(labelText, inputType, placeholder) {
    const wrapper = document.createElement('div');
    wrapper.className = 'column';

    const label = document.createElement('label');
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type = inputType;
    input.placeholder = placeholder || '';

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return { wrapper, input };
  }

  function statusNode() {
    const node = document.createElement('div');
    node.className = 'status';
    return node;
  }

  function setStatus(node, text, kind) {
    node.textContent = text || '';
    node.className = 'status';
    if (kind === 'error') {
      node.classList.add('error');
    }
    if (kind === 'ok') {
      node.classList.add('ok');
    }
  }

  function createWelcomeView(actions) {
    const root = document.createElement('section');
    root.className = 'screen card';

    const title = document.createElement('h1');
    title.textContent = 'Party';

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Create private accounts, make games, join friends, and chat in each game.';

    const buttons = document.createElement('div');
    buttons.className = 'row';

    const signup = document.createElement('button');
    signup.className = 'primary';
    signup.textContent = 'Create account';
    signup.addEventListener('click', actions.onGoSignup);

    const signin = document.createElement('button');
    signin.className = 'secondary';
    signin.textContent = 'Sign in';
    signin.addEventListener('click', actions.onGoSignin);

    buttons.appendChild(signup);
    buttons.appendChild(signin);

    root.appendChild(title);
    root.appendChild(subtitle);
    root.appendChild(document.createElement('hr'));
    root.appendChild(buttons);

    return { root };
  }

  function createSignupView(actions) {
    const root = document.createElement('section');
    root.className = 'screen card';

    const title = document.createElement('h2');
    title.textContent = 'Signup';

    const username = labelAndInput('Username', 'text', 'Your handle');
    const password = labelAndInput('Password', 'password', 'Password');
    const invite = labelAndInput('Invite key', 'password', 'Shared key');

    const status = statusNode();

    const controls = document.createElement('div');
    controls.className = 'row mobile-stack';

    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.textContent = 'Create account';
    submit.addEventListener('click', function onSubmit() {
      actions.onSubmit({
        username: username.input.value.trim(),
        password: password.input.value,
        inviteKey: invite.input.value,
      });
    });

    const back = document.createElement('button');
    back.className = 'link';
    back.textContent = 'Back';
    back.addEventListener('click', actions.onBack);

    controls.appendChild(submit);
    controls.appendChild(back);

    root.appendChild(title);
    root.appendChild(username.wrapper);
    root.appendChild(password.wrapper);
    root.appendChild(invite.wrapper);
    root.appendChild(status);
    root.appendChild(controls);

    return {
      root,
      status,
      setStatus: (text, kind) => setStatus(status, text, kind),
    };
  }

  function createSigninView(actions) {
    const root = document.createElement('section');
    root.className = 'screen card';

    const title = document.createElement('h2');
    title.textContent = 'Signin';

    const username = labelAndInput('Username', 'text', 'Your handle');
    const password = labelAndInput('Password', 'password', 'Password');

    const status = statusNode();

    const controls = document.createElement('div');
    controls.className = 'row mobile-stack';

    const submit = document.createElement('button');
    submit.className = 'primary';
    submit.textContent = 'Sign in';
    submit.addEventListener('click', function onSubmit() {
      actions.onSubmit({
        username: username.input.value.trim(),
        password: password.input.value,
      });
    });

    const back = document.createElement('button');
    back.className = 'link';
    back.textContent = 'Back';
    back.addEventListener('click', actions.onBack);

    controls.appendChild(submit);
    controls.appendChild(back);

    root.appendChild(title);
    root.appendChild(username.wrapper);
    root.appendChild(password.wrapper);
    root.appendChild(status);
    root.appendChild(controls);

    return {
      root,
      status,
      setStatus: (text, kind) => setStatus(status, text, kind),
    };
  }

  function createLandingView(actions) {
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
    refresh.addEventListener('click', actions.onRefresh);

    const signout = document.createElement('button');
    signout.className = 'link';
    signout.textContent = 'Sign out';
    signout.addEventListener('click', actions.onSignout);

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
    createBtn.addEventListener('click', function onCreate() {
      actions.onCreate({
        title: gameTitle.input.value.trim(),
        gameType: gameType.input.value.trim() || 'generic',
      });
    });

    createBlock.appendChild(createTitle);
    createBlock.appendChild(gameTitle.wrapper);
    createBlock.appendChild(gameType.wrapper);
    createBlock.appendChild(createBtn);

    const status = statusNode();
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
        join.addEventListener('click', function onJoin() {
          actions.onJoin(game.id);
        });

        const open = document.createElement('button');
        open.className = 'secondary';
        open.textContent = 'Open';
        open.addEventListener('click', function onOpen() {
          actions.onOpen(game.id);
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

  function createGameView(actions) {
    const root = document.createElement('section');
    root.className = 'screen card';

    const headingRow = document.createElement('div');
    headingRow.className = 'row';

    const title = document.createElement('h2');
    title.textContent = 'Game';

    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    const back = document.createElement('button');
    back.className = 'link';
    back.textContent = 'Back to lobby';
    back.addEventListener('click', actions.onBack);

    headingRow.appendChild(title);
    headingRow.appendChild(spacer);
    headingRow.appendChild(back);

    const subtitle = document.createElement('p');

    const feed = document.createElement('div');
    feed.className = 'message-feed';

    const composerRow = document.createElement('div');
    composerRow.className = 'row mobile-stack';
    composerRow.style.marginTop = '10px';

    const messageInput = document.createElement('input');
    messageInput.type = 'text';
    messageInput.placeholder = 'Type a message';

    const sendButton = document.createElement('button');
    sendButton.className = 'primary';
    sendButton.textContent = 'Send';
    sendButton.addEventListener('click', function onSendClick() {
      actions.onSend(messageInput.value);
      messageInput.value = '';
      messageInput.focus();
    });

    messageInput.addEventListener('keydown', function onMessageKeyDown(event) {
      if (event.key === 'Enter') {
        sendButton.click();
      }
    });

    composerRow.appendChild(messageInput);
    composerRow.appendChild(sendButton);

    const status = statusNode();

    root.appendChild(headingRow);
    root.appendChild(subtitle);
    root.appendChild(feed);
    root.appendChild(composerRow);
    root.appendChild(status);

    function setGame(game) {
      title.textContent = game ? game.title : 'Game';
      subtitle.textContent = game
        ? 'Type: ' + game.game_type + ' | Owner: ' + game.owner_username + ' | Status: ' + game.status
        : '';
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
      clearNode(feed);
    }

    return {
      root,
      setGame,
      appendMessages,
      clearMessages,
      setStatus: (text, kind) => setStatus(status, text, kind),
    };
  }

  return {
    createWelcomeView,
    createSignupView,
    createSigninView,
    createLandingView,
    createGameView,
  };
})();
