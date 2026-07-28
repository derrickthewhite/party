export function showPlayerIconPreviewModal(options) {
	const config = options || {};
	const src = String(config.src || '').trim();
	if (!src) {
		return;
	}

	const titleText = String(config.title || 'Icon preview').trim() || 'Icon preview';
	const altText = String(config.alt || 'Player icon').trim() || 'Player icon';
	const detailText = String(config.detail || '').trim();
	const closeText = String(config.closeLabel || 'Close').trim() || 'Close';
	const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';

	const dialog = document.createElement('div');
	dialog.className = 'modal-card player-icon-preview-modal';
	dialog.setAttribute('role', 'dialog');
	dialog.setAttribute('aria-modal', 'true');
	dialog.setAttribute('aria-label', titleText);

	const title = document.createElement('h3');
	title.textContent = titleText;

	const body = document.createElement('div');
	body.className = 'player-icon-preview-body';

	const image = document.createElement('img');
	image.className = 'player-icon player-icon-preview-image';
	image.src = src;
	image.alt = altText;
	image.setAttribute('decoding', 'async');

	body.appendChild(image);

	if (detailText) {
		const detail = document.createElement('p');
		detail.className = 'player-icon-preview-detail';
		detail.textContent = detailText;
		body.appendChild(detail);
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
}

export function bindPlayerIconPreview(node, options) {
	if (!node || node.nodeType !== Node.ELEMENT_NODE) {
		return;
	}

	if (node.dataset.iconPreviewBound === '1') {
		return;
	}
	node.dataset.iconPreviewBound = '1';
	node.classList.add('player-icon-preview-trigger');
	node.setAttribute('role', 'button');
	node.setAttribute('aria-haspopup', 'dialog');
	if (!node.hasAttribute('tabindex')) {
		node.tabIndex = 0;
	}

	function resolveText(value, fallback) {
		if (typeof value === 'function') {
			return String(value() || '').trim() || fallback;
		}

		return String(value || '').trim() || fallback;
	}

	function openPreview() {
		const src = String(node.getAttribute('src') || '').trim();
		if (!src) {
			return;
		}

		const config = options || {};
		const title = resolveText(config.title, 'Icon preview');
		const detail = resolveText(config.detail, '');
		const alt = resolveText(config.alt, String(node.getAttribute('alt') || '').trim() || 'Player icon');

		showPlayerIconPreviewModal({
			src,
			title,
			detail,
			alt,
			closeLabel: config.closeLabel,
		});
	}

	node.addEventListener('click', function onIconClick() {
		openPreview();
	});

	node.addEventListener('keydown', function onIconKeyDown(event) {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}
		event.preventDefault();
		openPreview();
	});
}