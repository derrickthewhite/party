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

export function pickRandomPlayerIconKey(iconCatalog, currentIconKey) {
	const normalizedCurrentIconKey = normalizePlayerIconKey(currentIconKey);
	const availableIcons = Array.isArray(iconCatalog) ? iconCatalog : [];
	const seenKeys = new Set();
	const selectableIcons = availableIcons.filter(function isSelectableIcon(iconKey) {
		const normalizedIconKey = normalizePlayerIconKey(iconKey);
		if (!normalizedIconKey || seenKeys.has(normalizedIconKey)) {
			return false;
		}
		seenKeys.add(normalizedIconKey);
		return normalizedIconKey !== normalizedCurrentIconKey;
	});

	if (!selectableIcons.length) {
		return null;
	}

	const index = randomIndex(selectableIcons.length);
	return selectableIcons[index] || null;
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

function looksLikeHumanIconFileName(fileName) {
	return /^human\b/i.test(String(fileName || '').trim());
}

const PLAYER_ICON_GROUP_LABELS = {
	humans: 'Humans',
	animals: 'Animals',
	monster: 'Monster',
	fantasy: 'Fantasy',
	alien: 'Alien',
	'science-fiction': 'Science Fiction',
};

function prefixedIconList(folderName, fileNames) {
	return fileNames.map(function prefixFileName(fileName) {
		return folderName + '/' + fileName;
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

	// Use module-level explicit sets for animals/humans.
	// These are defined once to allow other modules to check membership.
	// (Lowercased normalized paths.)

	if (isPlayerIconAnimal(normalized)) return 'animals';

	if (isPlayerIconHuman(normalized)) return 'humans';

	const lastSlashIndex = normalized.lastIndexOf('/');
	return lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex);
}

// Module-level explicit sets so other modules can check membership.
const EXPLICIT_ANIMAL_ICON_KEYS = [
	...prefixedIconList('FairyTaleWarHeads', [
		'BlackCat.svg',
		'BoarHead.svg',
		'GreenDragon.svg',
		'TuskOgre.svg',
	]),
	...prefixedIconList('FantasyHeads', [
		'Armadillo.svg',
		'Bear.svg',
		'Black Horse.svg',
		'Blue Jay.svg',
		'Brown Horse.svg',
		'Brown Lizard.svg',
		'Brown Mare.svg',
		'Buckskin Horse.svg',
		'Chameleon.svg',
		'Chestnut Mare.svg',
		'Compsagnathus.svg',
		'Dapple Gray Horse.svg',
		'Panda.svg',
		'Grey Speckled Horse.svg',
		'Palomino Horse.svg',
		'Possum.svg',
		'pupitar.svg',
		'Racoon.svg',
		'Red Panda.svg',
		'Pterosaur.svg',
		'Raptor.svg',
		'Skunk.svg',
		'Spikey Lizard.svg',
		'Tan Horse.svg',
		'Triceratops.svg',
		'Turtle Beast.svg',
		'Tyrannasaur.svg',
		'Undead Horse.svg',
		'White Horse.svg',
		'Wolf.svg',
		'Unicorn.svg',
		'Dragon.svg',
	]),
	...prefixedIconList('Classic', [
		'RoseCatGlasses.svg',
	]),
	...prefixedIconList('AliensByRegionHeads', [
		'Cat (Black).svg',
		'Cat (Ginger).svg',
		'Cat (Grey).svg',
		'Cat (Tiger).svg',
		'Cat (White).svg',
		'Snake (Black).svg',
		'Snake (Brown).svg',
		'Snake (Green).svg',
		'Snake (Orange).svg',
		'Mogwai A.svg',
		'Mogwai B.svg',
	]),
	...prefixedIconList('CrimsonNetworkHeads', [
		'GoldFox.svg',
		'SandFox.svg',
		'Scarab.svg',
		'Tiger.svg',
		'Saurian.svg',
		'Ant.svg',
		'Keleni.svg',
		'Hunter 1.svg',
		'Hunter 2.svg',
		'Grey Hairless.svg',
	]),
];

const EXPLICIT_HUMAN_ICON_KEYS = [
	...prefixedIconList('FairyTaleWarHeads', [
		'BarredHelm.svg',
		'BeardedKing.svg',
		'CrownedKing.svg',
		'GreatHelm.svg',
		'GreyHoodWoman.svg',
		'HeadbandPage.svg',
		'HeadbandWarrior.svg',
		'MailCapWarrior.svg',
		'MustachedKing.svg',
		'NasalHelm.svg',
		'SternKing.svg',
		'StripedCapPage.svg',
		'SunPriestess.svg',
		'WhiteHairedNoble.svg',
		'Witch.svg',
		'YoungKing.svg',
		'ClosedKnightHelm.svg',
		'TVisorHelm.svg',
	]),
	...prefixedIconList('FantasyHeads', [
		'Black Headwrap Man.svg',
		'Grenadier Mustache.svg',
		'Outlaw.svg',
		'Roman Soldier.svg',
		'Tall Shako Soldier.svg',
		'Long Bandana Skull.svg',
	]),
	...prefixedIconList('AliensByRegionHeads', [
		'Human A.svg',
		'Human B.svg',
		'Human C.svg',
		'Human D.svg',
		'Human E.svg',
		'Human F.svg',
		'Human G.svg',
		'Human H.svg',
		'Human I.svg',
		'Human J.svg',
		'Human K.svg',
		'Human L.svg',
		'Human M.svg',
		'Human N.svg',
		'Human R.svg',
		'Human X.svg',
		'Human Y.svg',
		'Human Z.svg',
	]),
	...prefixedIconList('CrimsonNetworkHeads', [
		'Human 1.svg',
		'Human 10.svg',
		'Human 11.svg',
		'Human 2.svg',
		'Human 3.svg',
		'Human 4.svg',
		'Human 5.svg',
		'Human 6.svg',
		'Human 7.svg',
		'Human 8.svg',
		'Human 9.svg',
	]),
	...prefixedIconList('PsiWarsHeads', [
		'Human A1.svg',
		'Human A2.svg',
		'Human A3.svg',
		'Human A4.svg',
		'Human A5.svg',
		'Human A6.svg',
		'Human A7.svg',
		'Human A8.svg',
		'Human A9.svg',
		'Human A10.svg',
		'Human A11.svg',
		'Human A12.svg',
		'Human A13.svg',
		'Human A14.svg',
		'Human A15.svg',
		'Human A16.svg',
		'Human A17.svg',
		'Human A18.svg',
		'Human A19.svg',
		'Human B2.svg',
		'Human B3.svg',
		'Human B4.svg',
		'Human B5.svg',
		'Human B6.svg',
		'Human B7.svg',
		'Human B8.svg',
		'Human B9.svg',
		'Human B10.svg',
		'Human B11.svg',
		'Human B12.svg',
		'Human B13.svg',
		'Human A20.svg',
		'Human A21.svg',
		'Human A22.svg',
		'Human A23.svg',
		'Human A24.svg',
		'Human A25.svg',
		'Human A26.svg',
		'Human A27.svg',
		'Human A28.svg',
		'Human A29.svg',
		'Human A30.svg',
		'Human b14.svg',
		'Human B15.svg',
		'Human Helmet 1.svg',
	]),
];

const EXPLICIT_FANTASY_THEME_ICON_KEYS = [
	...prefixedIconList('FairyTaleWarHeads', [
		'BarredHelm.svg',
		'BeardedKing.svg',
		'Beast.svg',
		'BlackCat.svg',
		'ClosedKnightHelm.svg',
		'CrownedKing.svg',
		'GreatHelm.svg',
		'GreenDragon.svg',
		'GreyHoodWoman.svg',
		'HeadbandPage.svg',
		'HeadbandWarrior.svg',
		'MailCapWarrior.svg',
		'MustachedKing.svg',
		'NasalHelm.svg',
		'SternKing.svg',
		'StripedCapPage.svg',
		'SunPriestess.svg',
		'TuskOgre.svg',
		'TVisorHelm.svg',
		'WhiteHairedNoble.svg',
		'Witch.svg',
		'YoungKing.svg',
	]),
	...prefixedIconList('FantasyHeads', [
		'Armadillo.svg',
		'Bear.svg',
		'Bearded Skull.svg',
		'Black Horse.svg',
		'Black Tricorne Skull.svg',
		'Blob.svg',
		'Blue Jay.svg',
		'Blue Pirate Skull.svg',
		'Brown Horse.svg',
		'Brown Lizard.svg',
		'Brown Mare.svg',
		'Buckskin Horse.svg',
		'Chameleon.svg',
		'Chestnut Mare.svg',
		'Compsagnathus.svg',
		'Cowbow Skull.svg',
		'Dapple Gray Horse.svg',
		'Dino Warrior A.svg',
		'Dino Warrior B.svg',
		'Dragon.svg',
		'Goblin.svg',
		'Grenadier Mustache.svg',
		'Grey Speckled Horse.svg',
		'Long Bandana Skull.svg',
		'Nightcap Skull.svg',
		'Nyad.svg',
		'Outlaw.svg',
		'Palomino Horse.svg',
		'Panda.svg',
		'Plain Skull.svg',
		'Possum.svg',
		'Pointed Hood Skull.svg',
		'Pterosaur.svg',
		'Racoon.svg',
		'Raptor.svg',
		'Red Bandana Skull.svg',
		'Red Hat Skull.svg',
		'Red Hood Skull.svg',
		'Red Panda.svg',
		'Red Tricorne Soldier.svg',
		'Roman Skull.svg',
		'Roman Soldier.svg',
		'Skunk.svg',
		'Spikey Lizard.svg',
		'Tall Shako Soldier.svg',
		'Tan Horse.svg',
		'Top Knot Skull.svg',
		'Triceratops.svg',
		'Turtle Beast.svg',
		'Tyrannasaur.svg',
		'Undead Horse.svg',
		'Unicorn.svg',
		'Vampire A.svg',
		'White Horse.svg',
		'Wide Hat Skull.svg',
		'Wolf.svg',
		'Yellow Cowl Skull.svg',
	]),
];

const EXPLICIT_MONSTER_THEME_ICON_KEYS = [
	...prefixedIconList('FairyTaleWarHeads', [
		'Beast.svg',
		'BlackCat.svg',
		'GreenDragon.svg',
		'TuskOgre.svg',
	]),
	...prefixedIconList('FantasyHeads', [
		'Bearded Skull.svg',
		'Black Tricorne Skull.svg',
		'Blob.svg',
		'Blue Pirate Skull.svg',
		'Cowbow Skull.svg',
		'Dragon.svg',
		'Goblin.svg',
		'Long Bandana Skull.svg',
		'Nightcap Skull.svg',
		'Plain Skull.svg',
		'Pointed Hood Skull.svg',
		'Red Bandana Skull.svg',
		'Red Hat Skull.svg',
		'Red Hood Skull.svg',
		'Roman Skull.svg',
		'Top Knot Skull.svg',
		'Vampire A.svg',
		'Wide Hat Skull.svg',
		'Yellow Cowl Skull.svg',
	]),
	...prefixedIconList('PsiWarsHeads', [
		'Cat Helmet 1.svg',
		'CatBoy A.svg',
		'CatGirl A.svg',
		'CatGirl B.svg',
		'CatGirl C.svg',
		'Demon 1.svg',
		'Demon 2.svg',
		'demon 3.svg',
		'Dragon (Blue).svg',
		'Gaunt Blob.svg',
		'Gaunt Bone Mask.svg',
		'Gaunt Fat.svg',
		'Gaunt Tongue.svg',
		'Keleni E.svg',
		'Keleni F.svg',
		'LorokoVithanni.svg',
		'Mask 1.svg',
		'Mask 10.svg',
		'Mask 2.svg',
		'Mask 3.svg',
		'Mask 4.svg',
		'Mask 5.svg',
		'Mask 6.svg',
		'Mask 7.svg',
		'Mask 8.svg',
		'Mask 9.svg',
		'Matra 1.svg',
		'Ranathim E.svg',
		'Ranathim F.svg',
		'Ranathim G.svg',
		'Ranathim H.svg',
		'Ranathim I.svg',
		'Ranathim J.svg',
		'Ranathim K.svg',
		'Robot 1.svg',
		'Robot 2.svg',
		'Robot 3.svg',
		'Robot 4.svg',
		'Sand Man.svg',
		'Temkor (Blue).svg',
		'Temkor (Red) B.svg',
		'Trader E.svg',
		'Trader Helmet 1.svg',
	]),
];

const EXPLICIT_ALIEN_THEME_ICON_KEYS = [
	...prefixedIconList('AlienHeads', [
		'AlienHead01.svg',
		'AlienHead02.svg',
		'AlienHead03.svg',
		'AlienHead04.svg',
		'AlienHead05.svg',
		'AlienHead06.svg',
		'AlienHead07.svg',
		'AlienHead08.svg',
		'AlienHead09.svg',
	]),
	...prefixedIconList('AliensByRegionHeads', [
		'Blue Bug A.svg',
		'Blue Bug B.svg',
		'Blue Bug C.svg',
		'Blue Bug D.svg',
		'Blue Bug E.svg',
		'Cat (Black).svg',
		'Cat (Ginger).svg',
		'Cat (Grey).svg',
		'Cat (Jaguar).svg',
		'Cat (Tiger).svg',
		'Cat (White).svg',
		'Cat (Wild).svg',
		'Desert Nehudi A.svg',
		'Desert Nehudi B.svg',
		'Desert Nehudi C.svg',
		'Desert Nehudi D.svg',
		'Desert Nehudi E.svg',
		'Forest Nehudi B.svg',
		'Forest Nehudi C.svg',
		'Forest Nehudi D.svg',
		'Forest Nehudi.svg',
		'Forest Nehui E.svg',
		'Gaunt A.svg',
		'Gaunt B.svg',
		'Gaunt C.svg',
		'Gaunt D.svg',
		'Green Bug A.svg',
		'Green Bug B.svg',
		'Green Bug C.svg',
		'Green Bug D.svg',
		'Green Bug E.svg',
		'Green Bug F.svg',
		'Green Bug G.svg',
		'Green Bug H.svg',
		'hmmm A.svg',
		'hmmm B.svg',
		'Karkadann A.svg',
		'Karkadann B.svg',
		'Karkadann C.svg',
		'Karkadann D.svg',
		'Keleni A.svg',
		'Keleni B.svg',
		'Keleni C.svg',
		'Keleni D.svg',
		'Krouta A.svg',
		'Krouta B.svg',
		'Krouta C.svg',
		'Krouta D.svg',
		'Loroko A.svg',
		'Loroko B.svg',
		'Loroko C.svg',
		'Loroko D.svg',
		'Mogwai A.svg',
		'Mogwai B.svg',
		'Mogwai C.svg',
		'Mogwai D.svg',
		'Plains Nehudi A.svg',
		'Plains Nehudi B.svg',
		'Plains Nehudi C.svg',
		'Plains Nehudi D.svg',
		'Plains Nehudi E.svg',
		'Ranathim A.svg',
		'Ranathim B.svg',
		'Ranathim C.svg',
		'Ranathim D.svg',
		'Snake (Black).svg',
		'Snake (Brown).svg',
		'Snake (Green).svg',
		'Snake (Orange).svg',
		'Snow Nedui C.svg',
		'Snow Nehudi A.svg',
		'Snow Nehudi B.svg',
		'Snow Nehudi D.svg',
		'SnowNehudi E.svg',
		'Temkor (Gold).svg',
		'Temkor (Green).svg',
		'Temkor (Red).svg',
		'Temkor (White).svg',
		'Trader A.svg',
		'Trader B.svg',
		'Trader C.svg',
		'Trader D.svg',
		'Vithani A.svg',
		'Vithani B.svg',
		'Vithani C.svg',
		'Vithani D.svg',
	]),
];

const EXPLICIT_SCIENCE_FICTION_THEME_ICON_KEYS = [
	...prefixedIconList('CrimsonNetworkHeads', [
		'Ant.svg',
		'AquaOracle.svg',
		'Astronaut.svg',
		'BronzeCenturion.svg',
		'BronzeVanguard.svg',
		'Bug Alien.svg',
		'GoldFox.svg',
		'Grey Hairless.svg',
		'Human 1.svg',
		'Human 10.svg',
		'Human 11.svg',
		'Human 2.svg',
		'Human 3.svg',
		'Human 4.svg',
		'Human 5.svg',
		'Human 6.svg',
		'Human 7.svg',
		'Human 8.svg',
		'Human 9.svg',
		'Hunter 1.svg',
		'Hunter 2.svg',
		'Keleni.svg',
		'Ranathim.svg',
		'Red Squidhead.svg',
		'Robot.svg',
		'SandFox.svg',
		'Saurian.svg',
		'Scarab.svg',
		'Tiger.svg',
		'Trooper.svg',
	]),
	...prefixedIconList('PsiWarsHeads', [
		'Cat Helmet 1.svg',
		'CatBoy A.svg',
		'CatGirl A.svg',
		'CatGirl B.svg',
		'CatGirl C.svg',
		'Demon 1.svg',
		'Demon 2.svg',
		'demon 3.svg',
		'Dragon (Blue).svg',
		'Gaunt Blob.svg',
		'Gaunt Bone Mask.svg',
		'Gaunt Fat.svg',
		'Gaunt Tongue.svg',
		'Human A1.svg',
		'Human A10.svg',
		'Human A11.svg',
		'Human A12.svg',
		'Human A13.svg',
		'Human A14.svg',
		'Human A15.svg',
		'Human A16.svg',
		'Human A17.svg',
		'Human A18.svg',
		'Human A19.svg',
		'Human A2.svg',
		'Human A20.svg',
		'Human A21.svg',
		'Human A22.svg',
		'Human A23.svg',
		'Human A24.svg',
		'Human A25.svg',
		'Human A26.svg',
		'Human A27.svg',
		'Human A28.svg',
		'Human A29.svg',
		'Human A30.svg',
		'Human A3.svg',
		'Human A4.svg',
		'Human A5.svg',
		'Human A6.svg',
		'Human A7.svg',
		'Human A8.svg',
		'Human A9.svg',
		'Human B10.svg',
		'Human B11.svg',
		'Human B12.svg',
		'Human B13.svg',
		'Human b14.svg',
		'Human B15.svg',
		'Human B2.svg',
		'Human B3.svg',
		'Human B4.svg',
		'Human B5.svg',
		'Human B6.svg',
		'Human B7.svg',
		'Human B8.svg',
		'Human B9.svg',
		'Human Helmet 1.svg',
		'Keleni E.svg',
		'Keleni F.svg',
		'LorokoVithanni.svg',
		'Mask 1.svg',
		'Mask 10.svg',
		'Mask 2.svg',
		'Mask 3.svg',
		'Mask 4.svg',
		'Mask 5.svg',
		'Mask 6.svg',
		'Mask 7.svg',
		'Mask 8.svg',
		'Mask 9.svg',
		'Matra 1.svg',
		'Ranathim E.svg',
		'Ranathim F.svg',
		'Ranathim G.svg',
		'Ranathim H.svg',
		'Ranathim I.svg',
		'Ranathim J.svg',
		'Ranathim K.svg',
		'Robot 1.svg',
		'Robot 2.svg',
		'Robot 3.svg',
		'Robot 4.svg',
		'Sand Man.svg',
		'Temkor (Blue).svg',
		'Temkor (Red) B.svg',
		'Trader E.svg',
		'Trader Helmet 1.svg',
	]),
];

const EXPLICIT_ANIMAL_ICONS = new Set(EXPLICIT_ANIMAL_ICON_KEYS.map(function toLowerCase(key) { return key.toLowerCase(); }));
const EXPLICIT_HUMAN_ICONS = new Set(EXPLICIT_HUMAN_ICON_KEYS.map(function toLowerCase(key) { return key.toLowerCase(); }));
const EXPLICIT_FANTASY_THEME_ICONS = new Set(EXPLICIT_FANTASY_THEME_ICON_KEYS.map(function toLowerCase(key) { return key.toLowerCase(); }));
const EXPLICIT_MONSTER_THEME_ICONS = new Set(EXPLICIT_MONSTER_THEME_ICON_KEYS.map(function toLowerCase(key) { return key.toLowerCase(); }));
const EXPLICIT_ALIEN_THEME_ICONS = new Set(EXPLICIT_ALIEN_THEME_ICON_KEYS.map(function toLowerCase(key) { return key.toLowerCase(); }));
const EXPLICIT_SCIENCE_FICTION_THEME_ICONS = new Set(EXPLICIT_SCIENCE_FICTION_THEME_ICON_KEYS.map(function toLowerCase(key) { return key.toLowerCase(); }));

export function isPlayerIconAnimal(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) return false;
	return EXPLICIT_ANIMAL_ICONS.has(normalized.toLowerCase());
}

export function isPlayerIconHuman(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) return false;
	if (EXPLICIT_HUMAN_ICONS.has(normalized.toLowerCase())) {
		return true;
	}

	return looksLikeHumanIconFileName(playerIconFileName(normalized));
}

export function playerIconThemeKey(iconKey) {
	const normalized = normalizePlayerIconKey(iconKey);
	if (!normalized) {
		return '';
	}
	const lowerKey = normalized.toLowerCase();
	if (EXPLICIT_MONSTER_THEME_ICONS.has(lowerKey)) {
		return 'monster';
	}
	if (EXPLICIT_FANTASY_THEME_ICONS.has(lowerKey)) {
		return 'fantasy';
	}
	if (EXPLICIT_ALIEN_THEME_ICONS.has(lowerKey)) {
		return 'alien';
	}
	if (EXPLICIT_SCIENCE_FICTION_THEME_ICONS.has(lowerKey)) {
		return 'science-fiction';
	}
	return '';
}

export function playerIconGroupLabel(groupKey) {
	const normalized = normalizePlayerIconKey(groupKey);
	const rawValue = String(groupKey || '').trim();
	const normalizedKey = normalized ? normalized.toLowerCase() : rawValue.toLowerCase();
	if (PLAYER_ICON_GROUP_LABELS[normalizedKey]) {
		return PLAYER_ICON_GROUP_LABELS[normalizedKey];
	}

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