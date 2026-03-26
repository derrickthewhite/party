import { createBaseGameScreen } from './gameScreen.js';

export function createStubGameScreen(deps) {
	return createBaseGameScreen(deps, {
		title: 'Stub Game',
		titleSuffix: 'Stub',
		showActionComposer: true,
		showParticipantsPanel: true,
	});
}
