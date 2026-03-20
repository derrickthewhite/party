import { createStatusNode, labelAndInput, setStatus } from './dom.js';

export function createSignupScreen(deps) {
  const state = deps.state;
  const api = deps.api;

  const root = document.createElement('section');
  root.className = 'screen card';

  const title = document.createElement('h2');
  title.textContent = 'Signup';

  const username = labelAndInput('Username', 'text', 'Your handle');
  const password = labelAndInput('Password', 'password', 'Password');
  const invite = labelAndInput('Invite key', 'password', 'Shared key');

  const status = createStatusNode();

  const controls = document.createElement('div');
  controls.className = 'row mobile-stack';

  const submit = document.createElement('button');
  submit.className = 'primary';
  submit.textContent = 'Create account';
  submit.addEventListener('click', async function onSubmit() {
    try {
      setStatus(status, 'Creating account...', '');
      await api.signup(username.input.value.trim(), password.input.value, invite.input.value);
      setStatus(status, 'Account created. You can sign in now.', 'ok');
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
  root.appendChild(invite.wrapper);
  root.appendChild(status);
  root.appendChild(controls);

  return {
    root,
    setStatus: (text, kind) => setStatus(status, text, kind),
  };
}
