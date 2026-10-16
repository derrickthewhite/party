const iconLabelByKey = new Map();

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

	return segments[segments.length - 1] || null;
}

export function catalogIconEntry(entry) {
	if (typeof entry === 'string') {
		const key = normalizePlayerIconKey(entry);
		if (!key) {
			return null;
		}
		return {
			key,
			label: playerIconLabel(key),
			tags: [],
			hidden: false,
			auto_assign: false,
		};
	}

	if (!entry || typeof entry !== 'object') {
		return null;
	}

	const key = normalizePlayerIconKey(entry.key);
	if (!key) {
		return null;
	}

	const label = typeof entry.label === 'string' && entry.label.trim()
		? entry.label.trim()
		: playerIconLabel(key);
	const tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];

	return {
		key,
		label,
		tags,
		hidden: !!entry.hidden,
		auto_assign: !!entry.auto_assign,
	};
}

export function rememberPlayerIconCatalog(iconCatalog) {
	if (!Array.isArray(iconCatalog)) {
		return;
	}

	iconCatalog.forEach(function eachEntry(entry) {
		const item = catalogIconEntry(entry);
		if (!item) {
			return;
		}
		iconLabelByKey.set(item.key, item.label);
	});
}

export function pickRandomPlayerIconKey(iconCatalog, currentIconKey) {
	const normalizedCurrentIconKey = normalizePlayerIconKey(currentIconKey);
	const availableIcons = Array.isArray(iconCatalog) ? iconCatalog : [];
	const seenKeys = new Set();
	const selectableIcons = availableIcons.filter(function isSelectableIcon(entry) {
		const item = catalogIconEntry(entry);
		if (!item || item.hidden || seenKeys.has(item.key)) {
			return false;
		}
		seenKeys.add(item.key);
		return item.key !== normalizedCurrentIconKey;
	});

	if (!selectableIcons.length) {
		return null;
	}

	const index = randomIndex(selectableIcons.length);
	const selected = catalogIconEntry(selectableIcons[index]);
	return selected ? selected.key : null;
}

function randomIndex(limit) {
	if (!Number.isFinite(limit) || limit <= 0) {
		return 0;
	}

	if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') {
		const values = new Uint32Array(1);
		crypto.getRandomValues(values);
		return values[0] % limit;
	}

	return Math.floor(Math.random() * limit);
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
	return normalizePlayerIconKey(iconKey) || '';
}

export function playerIconUrl(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return '';
	}

	return new URL('../assets/PlayerIcons/' + encodeURIComponent(normalized), import.meta.url).toString();
}

export function playerIconLabel(iconKey) {
	const fileName = playerIconFileName(iconKey);
	if (!fileName) {
		return 'Unassigned icon';
	}

	if (iconLabelByKey.has(fileName)) {
		return iconLabelByKey.get(fileName);
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
