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

const ICON_LABEL_OVERRIDES = Object.freeze({
	'FantasyHeads/Spotted Boar.svg': 'Triceratops',
	'FantasyHeads/Brown Dog.svg': 'T-Rex',
	'FantasyHeads/Needle Mask.svg': 'Pterosaur',
	'FantasyHeads/Striped Serpent.svg': 'Compsognathus',
	'FantasyHeads/Green Reptile.svg': 'Chameleon',
	'AliensByRegionHeads/Brown Dog.svg': 'Krouta Brown A',
	'AliensByRegionHeads/Spotted Dog A.svg': 'Krouta Spotted A',
	'AliensByRegionHeads/Spotted Dog B.svg': 'Krouta Spotted B',
	'AliensByRegionHeads/Brown Dog B.svg': 'Krouta Brown B',
	'AliensByRegionHeads/Blue Alien.svg': 'Trader Blue',
	'AliensByRegionHeads/Green Alien A.svg': 'Trader Green A',
	'AliensByRegionHeads/Green Alien B.svg': 'Trader Green B',
	'AliensByRegionHeads/Blue Helm Alien.svg': 'Trader Helm Blue',
	'AliensByRegionHeads/Teal Helm Alien.svg': 'Trader Helm Teal A',
	'AliensByRegionHeads/Net Helm Alien.svg': 'Trader Helm Net',
	'AliensByRegionHeads/Green Alien Smile.svg': 'Trader Smile',
	'AliensByRegionHeads/Green Alien Angry.svg': 'Trader Angry',
	'AliensByRegionHeads/Red Astronaut Alien.svg': 'Trader Astronaut',
	'AliensByRegionHeads/Teal Helm Alien B.svg': 'Trader Helm Teal B',
	'AliensByRegionHeads/Teal Helm Alien C.svg': 'Trader Helm Teal C',
	'AliensByRegionHeads/Tongue Alien White.svg': 'Temkor White',
	'AliensByRegionHeads/Tongue Alien Gold.svg': 'Temkor Gold',
	'AliensByRegionHeads/Tongue Alien Black.svg': 'Temkor Black',
	'AliensByRegionHeads/Horned Girl A.svg': 'Ranathim A',
	'AliensByRegionHeads/Horned Girl B.svg': 'Ranathim B',
	'AliensByRegionHeads/Horned Girl C.svg': 'Ranathim C',
	'AliensByRegionHeads/Horned Girl D.svg': 'Ranathim D',
	'AliensByRegionHeads/Horned Girl E.svg': 'Ranathim E',
	'AliensByRegionHeads/Horned Girl F.svg': 'Ranathim F',
	'AliensByRegionHeads/Green Ogre Hair A.svg': 'Nehudi Ogre Hair A',
	'AliensByRegionHeads/Green Ogre Cap A.svg': 'Nehudi Ogre Cap A',
	'AliensByRegionHeads/Green Ogre Cap B.svg': 'Nehudi Ogre Cap B',
	'AliensByRegionHeads/Green Ogre Cap C.svg': 'Nehudi Ogre Cap C',
	'AliensByRegionHeads/Green Ogre Hair B.svg': 'Nehudi Ogre Hair B',
	'AliensByRegionHeads/Green Ogre Hair C.svg': 'Nehudi Ogre Hair C',
	'AliensByRegionHeads/Green Ogre Hair D.svg': 'Nehudi Ogre Hair D',
	'AliensByRegionHeads/Green Ogre Hair E.svg': 'Nehudi Ogre Hair E',
	'AliensByRegionHeads/Green Ogre Hair F.svg': 'Nehudi Ogre Hair F',
	'AliensByRegionHeads/Green Ogre Face A.svg': 'Nehudi Ogre Face A',
	'AliensByRegionHeads/White Lion A.svg': 'Nehudi Lion White A',
	'AliensByRegionHeads/Brown Lion A.svg': 'Nehudi Lion Brown A',
	'AliensByRegionHeads/Pale Lion A.svg': 'Nehudi Lion Pale A',
	'AliensByRegionHeads/White Lion B.svg': 'Nehudi Lion White B',
	'AliensByRegionHeads/Brown Lion B.svg': 'Nehudi Lion Brown B',
	'AliensByRegionHeads/Pale Lion B.svg': 'Nehudi Lion Pale B',
	'AliensByRegionHeads/Gold Face.svg': 'Nehudi Gold Face A',
	'AliensByRegionHeads/Gold Face B.svg': 'Nehudi Gold Face B',
	'AliensByRegionHeads/Ice Elf.svg': 'Nehudi Elf Ice A',
	'AliensByRegionHeads/Green Elf A.svg': 'Nehudi Elf Green',
	'AliensByRegionHeads/Ice Elf B.svg': 'Nehudi Elf Ice B',
	'AliensByRegionHeads/Amber Elf A.svg': 'Nehudi Elf Amber',
	'AliensByRegionHeads/Pale Elf A.svg': 'Nehudi Elf Pale',
	'AliensByRegionHeads/Green Bug.svg': 'Keverling Green A',
	'AliensByRegionHeads/Blue Bug.svg': 'Keverling Blue A',
	'AliensByRegionHeads/Blue Bug Spotted.svg': 'Keverling Blue Spotted A',
	'AliensByRegionHeads/Blue Bug Full A.svg': 'Keverling Blue Full A',
	'AliensByRegionHeads/Green Bug Full A.svg': 'Keverling Green Full A',
	'AliensByRegionHeads/Blue Bug Full B.svg': 'Keverling Blue Full B',
	'AliensByRegionHeads/Green Bug Full B.svg': 'Keverling Green Full B',
	'AliensByRegionHeads/Green Bug Full C.svg': 'Keverling Green Full C',
	'AliensByRegionHeads/Green Bug Spotted Full.svg': 'Keverling Green Spotted Full A',
	'AliensByRegionHeads/Blue Bug Spotted B.svg': 'Keverling Blue Spotted B',
	'AliensByRegionHeads/Blue Bug Plain B.svg': 'Keverling Blue Plain B',
	'AliensByRegionHeads/Green Bug Plain B.svg': 'Keverling Green Plain B',
	'AliensByRegionHeads/Blue Bug Full C.svg': 'Keverling Blue Full C',
	'AliensByRegionHeads/Blue Bug Full D.svg': 'Keverling Blue Full D',
	'AliensByRegionHeads/Green Bug Full D.svg': 'Keverling Green Full D',
	'AliensByRegionHeads/Green Bug Plain C.svg': 'Keverling Green Plain C',
	'AliensByRegionHeads/Green Bug Full E.svg': 'Keverling Green Full E',
	'AliensByRegionHeads/Green Bug Spotted B.svg': 'Keverling Green Spotted B',
	'AliensByRegionHeads/Green Bug Plain D.svg': 'Keleni',
	'AliensByRegionHeads/Green Bug Spotted Full B.svg': 'Keverling Green Spotted Full B',
});

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
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return 'Unassigned icon';
	}

	if (Object.prototype.hasOwnProperty.call(ICON_LABEL_OVERRIDES, normalized)) {
		return ICON_LABEL_OVERRIDES[normalized];
	}

	const fileName = playerIconFileName(normalized);
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
