export function createWelcomeScreen(deps) {
 	const state = deps.state;

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
	signup.addEventListener('click', function onGoSignup() {
		state.clearStatus();
		state.setScreen('signup');
	});

	const signin = document.createElement('button');
	signin.className = 'secondary';
	signin.textContent = 'Sign in';
	signin.addEventListener('click', function onGoSignin() {
		state.clearStatus();
		state.setScreen('signin');
	});

	buttons.appendChild(signup);
	buttons.appendChild(signin);

	root.appendChild(title);
	root.appendChild(subtitle);
	root.appendChild(document.createElement('hr'));
	root.appendChild(buttons);

	return { root };
}
