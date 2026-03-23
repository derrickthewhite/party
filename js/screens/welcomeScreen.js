import { collectRefs, createNodeFromHtml } from './dom.js';

export function createWelcomeScreen(deps) {
	const state = deps.state;
	const navigateToScreen = deps.navigateToScreen || function fallbackNavigate(screen) {
		state.setScreen(screen);
	};

	const root = createNodeFromHtml(`
		<section class="screen card">
			<h1>Party</h1>
			<p>Create private accounts, make games, join friends, and chat in each game.</p>
			<hr>
			<div class="row">
				<button class="primary" data-ref="signup">Create account</button>
				<button class="secondary" data-ref="signin">Sign in</button>
			</div>
		</section>
	`);
	const refs = collectRefs(root);

	refs.signup.addEventListener('click', function onGoSignup() {
		navigateToScreen('signup');
	});

	refs.signin.addEventListener('click', function onGoSignin() {
		navigateToScreen('signin');
	});

	return { root };
}
