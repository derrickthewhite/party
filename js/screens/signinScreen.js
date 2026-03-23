import { collectRefs, createNodeFromHtml, setStatus } from './dom.js';
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

	const root = createNodeFromHtml(`
		<section class="screen card">
			<h2>Signin</h2>
			<form data-ref="form">
				<div class="column">
					<label for="signin-username">Username</label>
					<input id="signin-username" type="text" placeholder="Your handle" data-ref="username">
				</div>
				<div class="column">
					<label for="signin-password">Password</label>
					<input id="signin-password" type="password" placeholder="Password" data-ref="password">
				</div>
				<div class="status" data-ref="status"></div>
				<div class="row mobile-stack">
					<button class="primary" type="submit" data-ref="submit">Sign in</button>
					<button class="link" type="button" data-ref="back">Back</button>
				</div>
			</form>
		</section>
	`);
	const refs = collectRefs(root);
	const form = refs.form;
	const username = refs.username;
	const password = refs.password;
	const status = refs.status;

	username.name = 'username';
	username.autocomplete = 'username';
	username.autocapitalize = 'off';
	username.spellcheck = false;
	password.name = 'password';
	password.autocomplete = 'current-password';

	form.addEventListener('submit', async function onSubmit(event) {
		event.preventDefault();
		try {
			const trimmedUsername = username.value.trim();
			const rawPassword = password.value;

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

			password.value = '';
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

	refs.back.addEventListener('click', function onBack() {
		navigateToScreen('welcome');
	});

	return {
		root,
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
