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

export function showConfirmModal(options) {
	const config = options || {};
	const titleText = String(config.title || 'Confirm action');
	const messageText = String(config.message || 'Are you sure?');
	const confirmText = String(config.confirmLabel || 'Confirm');
	const cancelText = String(config.cancelLabel || 'Cancel');

	return new Promise(function resolvePrompt(resolve) {
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';

		const dialog = document.createElement('div');
		dialog.className = 'modal-card';
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-label', titleText);

		const title = document.createElement('h3');
		title.textContent = titleText;

		const message = document.createElement('p');
		message.className = 'modal-message';
		message.textContent = messageText;

		const actions = document.createElement('div');
		actions.className = 'modal-actions';

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = cancelText;

		const confirmBtn = document.createElement('button');
		confirmBtn.className = 'primary';
		confirmBtn.textContent = confirmText;

		let closed = false;

		function close(result) {
			if (closed) {
				return;
			}

			closed = true;
			document.removeEventListener('keydown', onKeyDown);
			overlay.remove();
			resolve(result);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				close(false);
			}
		}

		overlay.addEventListener('click', function onOverlayClick(event) {
			if (event.target === overlay) {
				close(false);
			}
		});

		cancelBtn.addEventListener('click', function onCancel() {
			close(false);
		});

		confirmBtn.addEventListener('click', function onConfirm() {
			close(true);
		});

		actions.appendChild(cancelBtn);
		actions.appendChild(confirmBtn);
		dialog.appendChild(title);
		dialog.appendChild(message);
		dialog.appendChild(actions);
		overlay.appendChild(dialog);

		document.body.appendChild(overlay);
		document.addEventListener('keydown', onKeyDown);
		confirmBtn.focus();
	});
}
