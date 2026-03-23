import { collectRefs, createNodeFromHtml, setStatus } from './dom.js';
import { buildSignupPayload } from '../srpClient.js';

export function createSignupScreen(deps) {
	const state = deps.state;
	const api = deps.api;
	const navigateToScreen = deps.navigateToScreen || function fallbackNavigate(screen) {
		state.setScreen(screen);
	};

	const root = createNodeFromHtml(`
		<section class="screen card">
			<h2>Signup</h2>
			<form data-ref="form">
				<div class="column">
					<label for="signup-username">Username</label>
					<input id="signup-username" type="text" placeholder="Your handle" data-ref="username">
				</div>
				<div class="column">
					<label for="signup-password">Password</label>
					<input id="signup-password" type="password" placeholder="Password" data-ref="password">
				</div>
				<div class="column">
					<label for="signup-invite">Invite key</label>
					<input id="signup-invite" type="password" placeholder="Shared key" data-ref="invite">
				</div>
				<div class="status" data-ref="status"></div>
				<div class="row mobile-stack">
					<button class="primary" type="submit" data-ref="submit">Create account</button>
					<button class="link" type="button" data-ref="back">Back</button>
				</div>
			</form>
		</section>
	`);
	const refs = collectRefs(root);
	const form = refs.form;
	const username = refs.username;
	const password = refs.password;
	const invite = refs.invite;
	const status = refs.status;

	username.name = 'username';
	username.autocapitalize = 'off';
	username.spellcheck = false;
	username.autocomplete = 'username';
	password.name = 'password';
	password.autocomplete = 'new-password';
	invite.name = 'invite_key';
	invite.autocomplete = 'off';

	form.addEventListener('submit', async function onSubmit(event) {
		event.preventDefault();
		try {
			const trimmedUsername = username.value.trim();
			const rawPassword = password.value;

			if (trimmedUsername === '' || rawPassword === '') {
				throw new Error('Username and password are required.');
			}

			setStatus(status, 'Creating account...', '');
			const srpPayload = await buildSignupPayload(trimmedUsername, rawPassword);
			await api.signup(srpPayload.username, srpPayload.salt, srpPayload.verifier, invite.value);

			password.value = '';
			setStatus(status, 'Account created. Redirecting to sign in...', 'ok');
			navigateToScreen('signin');
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
