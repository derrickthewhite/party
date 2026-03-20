import { createStatusNode, labelAndInput, setStatus } from './dom.js';

export function createSigninScreen(deps) {
  const state = deps.state;
  const api = deps.api;
  const refreshGames = deps.refreshGames;

  const root = document.createElement('section');
  root.className = 'screen card';

  const title = document.createElement('h2');
  title.textContent = 'Signin';

  const username = labelAndInput('Username', 'text', 'Your handle');
  const password = labelAndInput('Password', 'password', 'Password');

  const status = createStatusNode();

  const controls = document.createElement('div');
  controls.className = 'row mobile-stack';

  const submit = document.createElement('button');
  submit.className = 'primary';
  submit.textContent = 'Sign in';
  submit.addEventListener('click', async function onSubmit() {
    try {
      setStatus(status, 'Signing in...', '');
      const result = await api.signin(username.input.value.trim(), password.input.value);
      state.patch({ user: result.user });
      setStatus(status, '', '');
      await refreshGames();
      state.setScreen('landing');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });

  const back = document.createElement('button');
  back.className = 'link';
  back.textContent = 'Back';
  back.addEventListener('click', function onBack() {
    state.setScreen('welcome');
  });

  controls.appendChild(submit);
  controls.appendChild(back);

  root.appendChild(title);
  root.appendChild(username.wrapper);
  root.appendChild(password.wrapper);
  root.appendChild(status);
  root.appendChild(controls);

  return {
    root,
    setStatus: (text, kind) => setStatus(status, text, kind),
  };
}
