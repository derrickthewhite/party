import { createBaseGameScreen } from './gameScreen.js';

export function createRumbleGameScreen(deps) {
	return createBaseGameScreen(deps, {
		title: 'Rumble Game',
		titleSuffix: 'Rumble',
		showActionComposer: true,
	});
}
