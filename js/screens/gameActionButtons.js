import { buttonIconLabel, buttonIconUrl } from '../buttonIcons.js';

export function createGameActionButtonMarkup(actionName, refName, className) {
	const label = buttonIconLabel(actionName);
	const iconUrl = buttonIconUrl(actionName);
	const buttonClassName = className ? className + ' game-action-button' : 'game-action-button';

	return `
		<button type="button" class="${buttonClassName}" data-ref="${refName}" data-action-icon="${actionName}" title="${label}" aria-label="${label}">
			<img class="game-action-button-icon" src="${iconUrl}" alt="" aria-hidden="true">
		</button>
	`;
}

export function setGameActionButtonLabel(button, label) {
	if (!button || typeof label !== 'string') {
		return;
	}

	button.title = label;
	button.setAttribute('aria-label', label);
}

// Ensure an icon for a given action exists inside a container.
// Inserts or updates an <img> with class `mafia-action-type-icon` and sets title/aria.
export function ensureActionTypeIcon(container, actionName, titleText) {
	if (!container || typeof actionName !== 'string') return;
	try {
		const iconUrl = buttonIconUrl && buttonIconUrl(actionName);
		if (!iconUrl) return;
		// Do not force container display here; caller controls visibility.
		let img = container.querySelector('.mafia-action-type-icon');
		if (!img) {
			img = document.createElement('img');
			img.className = 'mafia-action-type-icon';
			img.setAttribute('alt', '');
			container.insertBefore(img, container.firstChild);
		}
		img.src = iconUrl;
		if (typeof titleText === 'string' && titleText) {
			img.title = titleText;
			img.setAttribute('aria-label', titleText);
		}
	} catch (e) {
		// silent
	}
}