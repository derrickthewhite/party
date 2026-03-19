window.ChatTransport = (function createChatTransportModule() {
  let timerId = null;

  async function tick(options) {
    if (!options || !options.gameId) {
      return;
    }

    try {
      const sinceId = options.getSinceId();
      const result = await window.PartyApi.listMessages(options.gameId, sinceId);
      options.onMessages(result.messages || []);
      options.onCursor(result.last_id || sinceId || 0);
    } catch (err) {
      options.onError(err);
    }
  }

  function startPolling(options) {
    stopPolling();

    const intervalMs = options.intervalMs || 2500;

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
})();
