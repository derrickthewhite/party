import { createStatusNode, labelAndInput, setStatus } from './dom.js';
import { startClientHandshake } from '../srpClient.js';
import { isSafeNext } from '../url-utils.js';

export function createSigninScreen(deps) {
	const state = deps.state;
	const api = deps.api;
	const refreshGames = deps.refreshGames;
	const getNext = typeof deps.next === 'function'
		? deps.next
		: function fallbackNext() {
			return deps.next || null;
		};
	const getNextGame = typeof deps.nextGame === 'function'
		? deps.nextGame
		: function fallbackNextGame() {
			return deps.nextGame || null;
		};
	const openGame = deps.openGame || null;
	const navigateToScreen = deps.navigateToScreen || function fallbackNavigate(screen) {
		state.setScreen(screen);
	};

	const root = document.createElement('section');
	root.className = 'screen card';

	const title = document.createElement('h2');
	title.textContent = 'Signin';

	const username = labelAndInput('Username', 'text', 'Your handle');
	const password = labelAndInput('Password', 'password', 'Password');
	const form = document.createElement('form');
	const status = createStatusNode();

	const controls = document.createElement('div');
	controls.className = 'row mobile-stack';
	username.input.name = 'username';
	username.input.autocomplete = 'username';
	username.input.autocapitalize = 'off';
	username.input.spellcheck = false;
	password.input.name = 'password';
	password.input.autocomplete = 'current-password';

	const submit = document.createElement('button');
	submit.className = 'primary';
	submit.textContent = 'Sign in';
	submit.type = 'submit';
	form.addEventListener('submit', async function onSubmit(event) {
		event.preventDefault();
		try {
			const trimmedUsername = username.input.value.trim();
			const rawPassword = password.input.value;

			if (trimmedUsername === '' || rawPassword === '') {
				throw new Error('Username and password are required.');
			}

			setStatus(status, 'Signing in...', '');
			const start = await api.signinStart(trimmedUsername);
			const canonicalUsername = String(start.username || trimmedUsername);
			const handshake = await startClientHandshake(canonicalUsername, rawPassword, start);
			const result = await api.signinFinish(canonicalUsername, handshake.clientPublic, handshake.clientProof);

			if ((result.server_proof || '') !== handshake.expectedServerProof) {
				throw new Error('Unable to verify server auth proof.');
			}

			password.input.value = '';
			state.patch({ user: result.user });
			setStatus(status, '', '');
			await refreshGames();

			const nextGame = getNextGame();
			if (nextGame && openGame) {
				try {
					await openGame(nextGame);
					return;
				} catch (openError) {
					// fall through to generic next handling
				}
			}

			const next = getNext();
			if (next && isSafeNext(next)) {
				if (next.startsWith('/')) {
					window.location.href = next;
					return;
				}
				if (next.startsWith('#')) {
					location.hash = next;
					return;
				}
			}
			state.setScreen('landing');
		} catch (err) {
			setStatus(status, err.message, 'error');
		}
	});

	const back = document.createElement('button');
	back.className = 'link';
	back.textContent = 'Back';
	back.type = 'button';
	back.addEventListener('click', function onBack() {
		navigateToScreen('welcome');
	});

	controls.appendChild(submit);
	controls.appendChild(back);

	form.appendChild(username.wrapper);
	form.appendChild(password.wrapper);
	form.appendChild(status);
	form.appendChild(controls);

	root.appendChild(title);
	root.appendChild(form);

	return {
		root,
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
