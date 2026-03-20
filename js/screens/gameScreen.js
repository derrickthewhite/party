import { clearNode, createStatusNode, setStatus } from './dom.js';

export function createGameScreen(deps) {
	const api = deps.api;
	const state = deps.state;
	const chat = deps.chat;

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
	back.addEventListener('click', function onBack() {
		chat.stopPolling();
		state.patch({ activeGame: null });
		state.setScreen('landing');
	});

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
	sendButton.addEventListener('click', async function onSendClick() {
		const activeGame = state.state.activeGame;
		if (!activeGame) {
			return;
		}

		const body = (messageInput.value || '').trim();
		if (body === '') {
			return;
		}

		try {
			await api.sendMessage(activeGame.id, body);
			messageInput.value = '';
			messageInput.focus();
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	messageInput.addEventListener('keydown', function onMessageKeyDown(event) {
		if (event.key === 'Enter') {
			sendButton.click();
		}
	});

	composerRow.appendChild(messageInput);
	composerRow.appendChild(sendButton);

	const status = createStatusNode();

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
