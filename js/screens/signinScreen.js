import { createStatusNode, labelAndInput, setStatus } from './dom.js';
import { startClientHandshake } from '../srpClient.js';

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
      const trimmedUsername = username.input.value.trim();
      const rawPassword = password.input.value;

      if (trimmedUsername === '' || rawPassword === '') {
        throw new Error('Username and password are required.');
      }

      setStatus(status, 'Signing in...', '');
      const start = await api.signinStart(trimmedUsername);
      const handshake = await startClientHandshake(trimmedUsername, rawPassword, start);
      const result = await api.signinFinish(trimmedUsername, handshake.clientPublic, handshake.clientProof);

      if ((result.server_proof || '') !== handshake.expectedServerProof) {
        throw new Error('Unable to verify server auth proof.');
      }

      password.input.value = '';
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
