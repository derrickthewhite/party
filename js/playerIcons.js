export function normalizePlayerIconKey(iconKey) {
	if (typeof iconKey !== 'string') {
		return null;
	}

	const trimmed = iconKey.trim();
	return trimmed ? trimmed : null;
}

export function playerIconUrl(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return '';
	}

	return new URL('../assets/PlayerIcons/' + encodeURIComponent(normalized), import.meta.url).toString();
}

export function playerIconLabel(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return 'Unassigned icon';
	}

	const base = normalized.replace(/\.svg$/i, '');
	const spaced = base
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();

	return spaced.replace(/\b\w/g, function eachLetter(letter) {
		return letter.toUpperCase();
	});
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