import { buttonIconLabel, buttonIconUrl } from '../buttonIcons.js';

export function createGameActionButtonMarkup(actionName, refName, className) {
	const label = buttonIconLabel(actionName);
	const iconUrl = buttonIconUrl(actionName);
	const buttonClassName = className ? className + ' game-action-button' : 'game-action-button';

	return `
		<button class="${buttonClassName}" data-ref="${refName}" title="${label}" aria-label="${label}">
			<img class="game-action-button-icon" src="${iconUrl}" alt="" aria-hidden="true">
		</button>
	`;
}