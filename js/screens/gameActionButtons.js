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