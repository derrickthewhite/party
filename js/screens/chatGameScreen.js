import { createBaseGameScreen } from './gameScreen.js';

export function createChatGameScreen(deps) {
	return createBaseGameScreen(deps, {
		title: 'Chat Game',
		titleSuffix: 'Chat',
		showActionComposer: false,
		showParticipantsPanel: true,
	});
}
