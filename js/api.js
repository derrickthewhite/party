function createApiModule() {
  // Resolve API root relative to this module so subdirectory hosting keeps working.
  const API_BASE = new URL('../api', import.meta.url).toString().replace(/\/$/, '');

  async function request(path, method, payload) {
    const response = await fetch(API_BASE + path, {
      method: method || 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Invalid server response.');
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    return data.data;
  }

  return {
    signup: (username, salt, verifier, inviteKey) => request('/auth/signup', 'POST', {
      username,
      salt,
      verifier,
      invite_key: inviteKey,
    }),
    signinStart: (username) => request('/auth/signin/start', 'POST', { username }),
    signinFinish: (username, clientPublic, clientProof) => request('/auth/signin/finish', 'POST', {
      username,
      client_public: clientPublic,
      client_proof: clientProof,
    }),
    signout: () => request('/auth/signout', 'POST'),
    me: () => request('/auth/me', 'GET'),
    listGames: () => request('/games', 'GET'),
    createGame: (title, gameType) => request('/games', 'POST', { title, game_type: gameType }),
    joinGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/join', 'POST'),
    gameDetail: (gameId) => request('/games/' + encodeURIComponent(gameId), 'GET'),
    listMessages: (gameId, sinceId) => request('/games/' + encodeURIComponent(gameId) + '/messages?since_id=' + encodeURIComponent(sinceId || 0), 'GET'),
    sendMessage: (gameId, body) => request('/games/' + encodeURIComponent(gameId) + '/messages', 'POST', { body }),
  };
}

export const api = createApiModule();
