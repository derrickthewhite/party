export function createNodeFromHtml(html) {
	const template = document.createElement('template');
	template.innerHTML = String(html || '').trim();
	if (template.content.childElementCount !== 1) {
		throw new Error('Template HTML must produce exactly one root element.');
	}

	return template.content.firstElementChild;
}

export function createTemplate(html) {
	const template = document.createElement('template');
	template.innerHTML = String(html || '').trim();
	return template;
}

export function cloneTemplateNode(template) {
	if (!template || !template.content || !template.content.firstElementChild) {
		throw new Error('Template must contain a root element.');
	}

	return template.content.firstElementChild.cloneNode(true);
}

export function collectRefs(root) {
	const refs = {};
	if (root && root.nodeType === Node.ELEMENT_NODE && root.hasAttribute('data-ref')) {
		refs[root.getAttribute('data-ref')] = root;
	}

	if (!root || typeof root.querySelectorAll !== 'function') {
		return refs;
	}

	root.querySelectorAll('[data-ref]').forEach(function eachRef(node) {
		const key = node.getAttribute('data-ref');
		if (key && !refs[key]) {
			refs[key] = node;
		}
	});

	return refs;
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

export function showInfoModal(options) {
	const config = options || {};
	const titleText = String(config.title || 'Details');
	const messageText = String(config.message || '');
	const closeText = String(config.closeLabel || 'Close');
	const sections = Array.isArray(config.sections) ? config.sections : [];
	const detailsVariant = String(config.detailsVariant || 'default');
	const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	return new Promise(function resolvePrompt(resolve) {
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';

		const dialog = document.createElement('div');
		dialog.className = 'modal-card modal-card-wide';
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-label', titleText);

		const title = document.createElement('h3');
		title.textContent = titleText;

		const body = document.createElement('div');
		body.className = 'modal-body';

		if (messageText) {
			const message = document.createElement('p');
			message.className = 'modal-message';
			message.textContent = messageText;
			body.appendChild(message);
		}

		if (sections.length > 0) {
			const details = document.createElement('div');
			details.className = detailsVariant === 'compact'
				? 'modal-details modal-details-compact'
				: 'modal-details';
			sections.forEach(function eachSection(section) {
				const row = document.createElement('div');
				row.className = 'modal-detail-row';

				const label = document.createElement('div');
				label.className = 'modal-detail-label';
				label.textContent = String(section && section.label ? section.label : 'Detail');

				const value = document.createElement('div');
				value.className = 'modal-detail-value';
				const nextValue = Array.isArray(section && section.value)
					? section.value.join(', ')
					: String(section && section.value ? section.value : 'None');
				value.textContent = nextValue;

				row.appendChild(label);
				row.appendChild(value);
				details.appendChild(row);
			});
			body.appendChild(details);
		}

		const actions = document.createElement('div');
		actions.className = 'modal-actions';

		const closeBtn = document.createElement('button');
		closeBtn.className = 'primary';
		closeBtn.textContent = closeText;

		let closed = false;

		function close() {
			if (closed) {
				return;
			}

			closed = true;
			document.removeEventListener('keydown', onKeyDown);
			overlay.remove();
			if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') {
				priorFocus.focus();
			}
			resolve();
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				close();
			}
		}

		overlay.addEventListener('click', function onOverlayClick(event) {
			if (event.target === overlay) {
				close();
			}
		});

		closeBtn.addEventListener('click', close);

		actions.appendChild(closeBtn);
		dialog.appendChild(title);
		dialog.appendChild(body);
		dialog.appendChild(actions);
		overlay.appendChild(dialog);

		document.body.appendChild(overlay);
		document.addEventListener('keydown', onKeyDown);
		closeBtn.focus();
	});
}
