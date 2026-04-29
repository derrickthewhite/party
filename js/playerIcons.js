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

	const segments = normalized.split('/').filter(Boolean);
	const fileName = segments[segments.length - 1] || '';
	const lowerFile = fileName.toLowerCase();
	const lowerSegments = segments.map(function (s) { return String(s || '').toLowerCase(); });

	// Use module-level explicit sets for animals/humans.
	// These are defined once to allow other modules to check membership.
	// (Lowercased normalized paths.)

	if (EXPLICIT_ANIMAL_ICONS.has(normalized.toLowerCase())) return 'animals';

	if (EXPLICIT_HUMAN_ICONS.has(normalized.toLowerCase())) return 'humans';

	const lastSlashIndex = normalized.lastIndexOf('/');
	return lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex);
}

// Module-level explicit sets so other modules can check membership.
const EXPLICIT_ANIMAL_ICONS = new Set([
	'FairyTaleWarHeads/BlackCat.svg',
	'FairyTaleWarHeads/BoarHead.svg',
	'FairyTaleWarHeads/GreenDragon.svg',
	'FairyTaleWarHeads/TuskOgre.svg',

	'FantasyHeads/Black Horse.svg',
	'FantasyHeads/Brown Horse.svg',
	'FantasyHeads/Brown Lizard.svg',
	'FantasyHeads/Brown Mare.svg',
	'FantasyHeads/Buckskin Horse.svg',
	'FantasyHeads/Chameleon.svg',
	'FantasyHeads/Panda.svg',
	'FantasyHeads/Red Panda.svg',
	'FantasyHeads/Pterosaur.svg',
	'FantasyHeads/Raptor.svg',
	'FantasyHeads/Triceratops.svg',
	'FantasyHeads/Turtle Beast.svg',
	'FantasyHeads/Tyrannasaur.svg',
	'FantasyHeads/Wolf.svg',
	'FantasyHeads/Unicorn.svg',
	'FantasyHeads/Dragon.svg',

	'Classic/RoseCatGlasses.svg',

	'AliensByRegionHeads/Cat (Black).svg',
	'AliensByRegionHeads/Cat (Ginger).svg',
	'AliensByRegionHeads/Cat (Grey).svg',
	'AliensByRegionHeads/Cat (Tiger).svg',
	'AliensByRegionHeads/Cat (White).svg',
	'AliensByRegionHeads/Snake (Black).svg',
	'AliensByRegionHeads/Snake (Brown).svg',
	'AliensByRegionHeads/Snake (Green).svg',
	'AliensByRegionHeads/Snake (Orange).svg',
	'AliensByRegionHeads/Mogwai A.svg',
	'AliensByRegionHeads/Mogwai B.svg',
	
	'CrimsonNetworkHeads/GoldFox.svg',
	'CrimsonNetworkHeads/SandFox.svg',
	'CrimsonNetworkHeads/Scarab.svg',
	'CrimsonNetworkHeads/Tiger.svg',
	'CrimsonNetworkHeads/Saurian.svg',
	'CrimsonNetworkHeads/Ant.svg',
	'CrimsonNetworkHeads/Keleni.svg',
	'CrimsonNetworkHeads/Hunter 1.svg',
	'CrimsonNetworkHeads/Hunter 2.svg',
	'CrimsonNetworkHeads/Grey Hairless.svg'
].map(function (s) { return s.toLowerCase(); }));

const EXPLICIT_HUMAN_ICONS = new Set([
	'FairyTaleWarHeads/BarredHelm.svg',
	'FairyTaleWarHeads/BeardedKing.svg',
	'FairyTaleWarHeads/CrownedKing.svg',
	'FairyTaleWarHeads/GreatHelm.svg',
	'FairyTaleWarHeads/GreyHoodWoman.svg',
	'FairyTaleWarHeads/HeadbandPage.svg',
	'FairyTaleWarHeads/HeadbandWarrior.svg',
	'FairyTaleWarHeads/MailCapWarrior.svg',
	'FairyTaleWarHeads/MustachedKing.svg',
	'FairyTaleWarHeads/NasalHelm.svg',
	'FairyTaleWarHeads/SternKing.svg',
	'FairyTaleWarHeads/StripedCapPage.svg',
	'FairyTaleWarHeads/SunPriestess.svg',
	'FairyTaleWarHeads/WhiteHairedNoble.svg',
	'FairyTaleWarHeads/Witch.svg',
	'FairyTaleWarHeads/YoungKing.svg',
	'FairyTaleWarHeads/ClosedKnightHelm.svg',
	'FairyTaleWarHeads/TVisorHelm.svg',

	'FantasyHeads/Black Headwrap Man.svg',
	'FantasyHeads/Grenadier Mustache.svg',
	'FantasyHeads/Outlaw.svg',
	'FantasyHeads/Roman Soldier.svg',
	'FantasyHeads/Tall Shako Soldier.svg',
	'FantasyHeads/Long Bandana Skull.svg',

	'AliensByRegionHeads/Human A.svg',
	'AliensByRegionHeads/Human B.svg',
	'AliensByRegionHeads/Human C.svg',
	'AliensByRegionHeads/Human D.svg',
	'AliensByRegionHeads/Human E.svg',
	'AliensByRegionHeads/Human F.svg',
	'AliensByRegionHeads/Human G.svg',
	'AliensByRegionHeads/Human H.svg',
	'AliensByRegionHeads/Human I.svg',
	'AliensByRegionHeads/Human J.svg',
	'AliensByRegionHeads/Human K.svg',
	'AliensByRegionHeads/Human L.svg',
	'AliensByRegionHeads/Human M.svg',
	'AliensByRegionHeads/Human N.svg',
	'AliensByRegionHeads/Human R.svg',
	'AliensByRegionHeads/Human X.svg',
	'AliensByRegionHeads/Human Y.svg',
	'AliensByRegionHeads/Human Z.svg',
	
	'CrimsonNetworkHeads/Human 1.svg',
	'CrimsonNetworkHeads/Human 2.svg',
	'CrimsonNetworkHeads/Human 3.svg',
	'CrimsonNetworkHeads/Human 4.svg',
	'CrimsonNetworkHeads/Human 5.svg',
	'CrimsonNetworkHeads/Human 6.svg',
	'CrimsonNetworkHeads/Human 7.svg',
	'CrimsonNetworkHeads/Human 8.svg',
	'CrimsonNetworkHeads/Human 9.svg'
].map(function (s) { return s.toLowerCase(); }));

export function isPlayerIconAnimal(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) return false;
	return EXPLICIT_ANIMAL_ICONS.has(normalized.toLowerCase());
}

export function isPlayerIconHuman(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) return false;
	return EXPLICIT_HUMAN_ICONS.has(normalized.toLowerCase());
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