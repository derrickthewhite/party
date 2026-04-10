import { CHAT_REFRESH_MS } from './config.js';

export function createChatTransport(api) {
 	let timerId = null;

	async function tick(options) {
		if (!options || !options.gameId) {
			return;
		}

		try {
			const sinceId = options.getSinceId();
			const result = await api.listMessages(options.gameId, sinceId);
			options.onMessages(result.messages || []);
			options.onCursor(result.last_id || sinceId || 0);
		} catch (err) {
			options.onError(err);
		}
	}

	function startPolling(options) {
		stopPolling();

        const intervalMs = options.intervalMs || CHAT_REFRESH_MS;

		tick(options);
		timerId = window.setInterval(function pollLoop() {
			tick(options);
		}, intervalMs);
	}

	function stopPolling() {
		if (timerId !== null) {
			window.clearInterval(timerId);
			timerId = null;
		}
	}

	return {
		startPolling,
		stopPolling,
	};
}
