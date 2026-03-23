import { createStatusNode, labelAndInput, setStatus } from './dom.js';
import { buildSignupPayload } from '../srpClient.js';

export function createSignupScreen(deps) {
	const state = deps.state;
	const api = deps.api;
	const navigateToScreen = deps.navigateToScreen || function fallbackNavigate(screen) {
		state.setScreen(screen);
	};

	const root = document.createElement('section');
	root.className = 'screen card';

	const title = document.createElement('h2');
	title.textContent = 'Signup';

	const username = labelAndInput('Username', 'text', 'Your handle');
	const password = labelAndInput('Password', 'password', 'Password');
	const invite = labelAndInput('Invite key', 'password', 'Shared key');
	const form = document.createElement('form');

	const status = createStatusNode();

	const controls = document.createElement('div');
	controls.className = 'row mobile-stack';

	username.input.name = 'username';
	username.input.autocapitalize = 'off';
	username.input.spellcheck = false;
	// signal browser to offer password saving
	username.input.autocomplete = 'username';
	password.input.name = 'password';
	password.input.autocomplete = 'new-password';
	invite.input.name = 'invite_key';
	invite.input.autocomplete = 'off';

	const submit = document.createElement('button');
	submit.className = 'primary';
	submit.textContent = 'Create account';
	submit.type = 'submit';
	form.addEventListener('submit', async function onSubmit(event) {
		event.preventDefault();
		try {
			const trimmedUsername = username.input.value.trim();
			const rawPassword = password.input.value;

			if (trimmedUsername === '' || rawPassword === '') {
				throw new Error('Username and password are required.');
			}

			setStatus(status, 'Creating account...', '');
			const srpPayload = await buildSignupPayload(trimmedUsername, rawPassword);
			await api.signup(srpPayload.username, srpPayload.salt, srpPayload.verifier, invite.input.value);

			password.input.value = '';
			setStatus(status, 'Account created. Redirecting to sign in...', 'ok');
			navigateToScreen('signin');
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
	form.appendChild(invite.wrapper);
	form.appendChild(status);
	form.appendChild(controls);

	root.appendChild(title);
	root.appendChild(form);

	return {
		root,
		setStatus: (text, kind) => setStatus(status, text, kind),
	};
}
