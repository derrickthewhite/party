const BUTTON_ICON_FILES = {
	open: 'Open.svg',
	join: 'Join.svg',
	leave: 'Leave.svg',
	observe: 'Observe.svg',
	start: 'Start.svg',
	end: 'End.svg',
	remove: 'Delete.svg',
};

const BUTTON_ICON_LABELS = {
	open: 'Open game',
	join: 'Join game',
	leave: 'Leave game',
	observe: 'Observe game',
	start: 'Start game',
	end: 'End game',
	remove: 'Delete game',
};

export function normalizeButtonIconAction(actionName) {
	if (typeof actionName !== 'string') {
		return '';
	}

	return actionName.trim().toLowerCase();
}

export function buttonIconFileName(actionName) {
	const normalized = normalizeButtonIconAction(actionName);
	return BUTTON_ICON_FILES[normalized] || '';
}

export function buttonIconLabel(actionName) {
	const normalized = normalizeButtonIconAction(actionName);
	return BUTTON_ICON_LABELS[normalized] || '';
}

export function buttonIconUrl(actionName) {
	const fileName = buttonIconFileName(actionName);
	if (!fileName) {
		return '';
	}

	return new URL('../assets/ButtonIcons/' + encodeURIComponent(fileName), import.meta.url).toString();
}