function createStateModule() {
	const state = {
		screen: 'welcome',
		user: null,
		games: [],
		activeGame: null,
		statusText: '',
		statusKind: '',
		messageCursorByGame: {},
	};

	const listeners = new Set();

	function emit() {
		listeners.forEach((listener) => listener(state));
	}

	function subscribe(listener) {
		listeners.add(listener);
		return function unsubscribe() {
			listeners.delete(listener);
		};
	}

	function patch(partial) {
		Object.assign(state, partial);
		emit();
	}

	function setScreen(screen) {
		state.screen = screen;
		emit();
	}

	function setStatus(text, kind) {
		state.statusText = text || '';
		state.statusKind = kind || '';
		emit();
	}

	function clearStatus() {
		setStatus('', '');
	}

	function setMessageCursor(gameId, lastId) {
		if (!gameId) {
			return;
		}
		state.messageCursorByGame[String(gameId)] = Number(lastId || 0);
	}

	function getMessageCursor(gameId) {
		return state.messageCursorByGame[String(gameId)] || 0;
	}

	return {
		state,
		subscribe,
		patch,
		setScreen,
		setStatus,
		clearStatus,
		setMessageCursor,
		getMessageCursor,
	};
}

export const state = createStateModule();
