export function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function labelAndInput(labelText, inputType, placeholder) {
  const wrapper = document.createElement('div');
  wrapper.className = 'column';

  const label = document.createElement('label');
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = inputType;
  input.placeholder = placeholder || '';

  wrapper.appendChild(label);
  wrapper.appendChild(input);

  return { wrapper, input };
}

export function createStatusNode() {
  const node = document.createElement('div');
  node.className = 'status';
  return node;
}

export function setStatus(node, text, kind) {
  node.textContent = text || '';
  node.className = 'status';
  if (kind === 'error') {
    node.classList.add('error');
  }
  if (kind === 'ok') {
    node.classList.add('ok');
  }
}
