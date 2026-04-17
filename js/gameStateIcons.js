function normalizeToken(value) {
	if (typeof value !== 'string') {
		return '';
	}

	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

const GAME_TYPE_ICON_FILES = {
	chat: 'TypeChat.svg',
	mafia: 'TypeMafia.svg',
	diplomacy: 'TypeDiplomacy.svg',
	rumble: 'TypeRumble.svg',
	stub: 'TypeStub.svg',
};

const GAME_TYPE_LABELS = {
	chat: 'Chat',
	mafia: 'Mafia',
	diplomacy: 'Diplomacy',
	rumble: 'Rumble',
	stub: 'Stub',
};

const GAME_STATUS_ALIASES = {
	pending: 'open',
	inprogress: 'in_progress',
	in_progress: 'in_progress',
	ended: 'closed',
};

const GAME_STATUS_ICON_FILES = {
	open: 'StatusOpen.svg',
	in_progress: 'StatusInProgress.svg',
	closed: 'StatusClosed.svg',
};

const GAME_STATUS_LABELS = {
	open: 'Open',
	in_progress: 'In progress',
	closed: 'Closed',
};

const GAME_PHASE_ICON_FILES = {
	'chat:chat': 'PhaseChatChat.svg',
	'mafia:start': 'PhaseMafiaStart.svg',
	'mafia:day': 'PhaseMafiaDay.svg',
	'mafia:night': 'PhaseMafiaNight.svg',
	'rumble:bidding': 'PhaseRumbleBidding.svg',
	'rumble:battle': 'PhaseRumbleBattle.svg',
	'diplomacy:orders': 'PhaseDiplomacyOrders.svg',
	'mafia:trial': 'PhaseMafiaTrial.svg',
	'mafia:dusk': 'PhaseMafiaDusk.svg',
	'rumble:resolve': 'PhaseRumbleResolve.svg',
	'diplomacy:retreat': 'PhaseDiplomacyRetreat.svg',
	'diplomacy:build': 'PhaseDiplomacyBuild.svg',
	'chat:archive': 'PhaseChatArchive.svg',
	'generic:setup': 'PhaseGenericSetup.svg',
};

const GAME_PHASE_LABELS = {
	'chat:chat': 'Chat',
	'mafia:start': 'Role reveal',
	'mafia:day': 'Day',
	'mafia:night': 'Night',
	'rumble:bidding': 'Bidding',
	'rumble:battle': 'Battle',
	'diplomacy:orders': 'Orders',
	'mafia:trial': 'Trial',
	'mafia:dusk': 'Dusk',
	'rumble:resolve': 'Resolve',
	'diplomacy:retreat': 'Retreat',
	'diplomacy:build': 'Build',
	'chat:archive': 'Archive',
	'generic:setup': 'Setup',
};

const RUMBLE_SUMMARY_ICON_FILES = {
	energy: 'RumbleReportEnergy.svg',
	health: 'RumbleReportHealth.svg',
	attack: 'RumbleReportAttack.svg',
	abilities: 'RumbleReportAbilities.svg',
	defense: 'RumbleReportDefense.svg',
	incoming: 'RumbleReportIncoming.svg',
	damage: 'RumbleReportDamage.svg',
	burn: 'RumbleReportBurn.svg',
	heal: 'RumbleReportHeal.svg',
	arrow: 'RumbleReportArrow.svg',
};

const RUMBLE_SUMMARY_LABELS = {
	energy: 'Energy',
	health: 'Health',
	attack: 'Attack spend',
	abilities: 'Ability spend',
	defense: 'Defense',
	incoming: 'Incoming attacks',
	damage: 'Damage through',
	burn: 'Health burn',
	heal: 'Healing',
	arrow: 'Then',
};

function iconUrl(fileName) {
	if (!fileName) {
		return '';
	}

	return new URL('../assets/GameStateIcons/' + encodeURIComponent(fileName), import.meta.url).toString();
}

function makeDescriptor(group, key, fileName, label) {
	if (!fileName) {
		return null;
	}

	return {
		group,
		key,
		label: label || key,
		url: iconUrl(fileName),
	};
}

function normalizeStatus(status) {
	const normalized = normalizeToken(status);
	return GAME_STATUS_ALIASES[normalized] || normalized;
}

function phaseLookupKey(gameType, phase) {
	const normalizedType = normalizeToken(gameType);
	const normalizedPhase = normalizeToken(phase);
	if (!normalizedType || !normalizedPhase) {
		return '';
	}

	return normalizedType + ':' + normalizedPhase;
}

export function getGameTypeIcon(gameType) {
	const key = normalizeToken(gameType);
	return makeDescriptor('type', key, GAME_TYPE_ICON_FILES[key], GAME_TYPE_LABELS[key]);
}

export function getGameStatusIcon(status) {
	const key = normalizeStatus(status);
	return makeDescriptor('status', key, GAME_STATUS_ICON_FILES[key], GAME_STATUS_LABELS[key]);
}

export function getGamePhaseIcon(gameType, phase) {
	const key = phaseLookupKey(gameType, phase);
	const fileName = GAME_PHASE_ICON_FILES[key];
	const label = GAME_PHASE_LABELS[key];
	if (fileName) {
		return makeDescriptor('phase', key, fileName, label);
	}

	return null;
}

export function getRumbleSummaryIcon(kind) {
	const key = normalizeToken(kind);
	return makeDescriptor('rumble_report', key, RUMBLE_SUMMARY_ICON_FILES[key], RUMBLE_SUMMARY_LABELS[key]);
}

const MEMBER_BADGE_FILE = 'MemberStar.svg';

export function getMemberBadgeIcon() {
	return makeDescriptor('badge', 'member', MEMBER_BADGE_FILE, 'Member');
}

export function collectGameInfoIcons(game, options) {
	const opts = options || {};
	const typeIcon = getGameTypeIcon(game && game.game_type ? game.game_type : '');
	const phaseIcon = getGamePhaseIcon(game && game.game_type ? game.game_type : '', game && game.phase ? game.phase : '');
	let statusIcon = getGameStatusIcon(game && game.status ? game.status : '');

	if (opts.hideInProgressWhenPhase && phaseIcon && statusIcon && statusIcon.key === 'in_progress') {
		statusIcon = null;
	}

	return {
		typeIcon,
		statusIcon,
		phaseIcon,
	};
}

export function setGameInfoIconNode(node, icon) {
	if (!node) {
		return;
	}

	if (!icon || !icon.url) {
		node.style.display = 'none';
		node.dataset.iconId = '';
		node.removeAttribute('src');
		node.alt = '';
		node.title = '';
		return;
	}

	const iconId = icon.group + ':' + icon.key;
	if (node.dataset.iconId !== iconId) {
		node.src = icon.url;
		node.dataset.iconId = iconId;
	}

	node.alt = icon.label;
	node.title = icon.label;
	node.style.display = '';
}
