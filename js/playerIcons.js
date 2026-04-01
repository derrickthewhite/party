export function normalizePlayerIconKey(iconKey) {
	if (typeof iconKey !== 'string') {
		return null;
	}

	const trimmed = iconKey.trim().replace(/\\+/g, '/');
	if (!trimmed) {
		return null;
	}

	const segments = trimmed.split('/').filter(Boolean);
	if (!segments.length || segments.some(function hasUnsafeSegment(segment) {
		return segment === '.' || segment === '..';
	})) {
		return null;
	}

	return segments.join('/');
}

function humanizeIconName(value) {
	return String(value || '')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim()
		.replace(/\b\w/g, function eachLetter(letter) {
			return letter.toUpperCase();
		});
}

export function playerIconFileName(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return '';
	}

	const segments = normalized.split('/');
	return segments[segments.length - 1] || '';
}

export function playerIconGroupKey(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return '';
	}

	const lastSlashIndex = normalized.lastIndexOf('/');
	return lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex);
}

export function playerIconGroupLabel(groupKey) {
	const normalized = normalizePlayerIconKey(groupKey);
	if (!normalized) {
		return 'Classic';
	}

	const segments = normalized.split('/');
	return humanizeIconName(segments[segments.length - 1]);
}

export function playerIconUrl(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return '';
	}

	const encodedPath = normalized
		.split('/')
		.map(function encodeSegment(segment) {
			return encodeURIComponent(segment);
		})
		.join('/');

	return new URL('../assets/PlayerIcons/' + encodedPath, import.meta.url).toString();
}

export function playerIconLabel(iconKey) {
	const fileName = playerIconFileName(iconKey);
	if (!fileName) {
		return 'Unassigned icon';
	}

	return humanizeIconName(fileName.replace(/\.svg$/i, ''));
}

export function setPlayerIconImage(node, iconKey, username) {
	if (!node) {
		return;
	}

	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		node.removeAttribute('src');
		node.alt = '';
		node.title = '';
		node.style.display = 'none';
		return;
	}

	node.src = playerIconUrl(normalized);
	node.alt = String(username || 'Player') + ' icon';
	node.title = playerIconLabel(normalized);
	node.style.display = '';
	node.setAttribute('loading', 'lazy');
	node.setAttribute('decoding', 'async');
}