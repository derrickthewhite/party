import { createBaseGameScreen } from './gameScreen.js';

export function createMafiaGameScreen(deps) {
	return createBaseGameScreen(deps, {
		title: 'Mafia Game',
		titleSuffix: 'Mafia',
		showActionComposer: true,
		showParticipantsPanel: true,
	});
}
