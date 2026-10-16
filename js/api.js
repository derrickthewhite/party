function createApiModule() {
	// Resolve API root relative to this module so subdirectory hosting keeps working.
	const API_BASE = new URL('../api', import.meta.url).toString().replace(/\/$/, '');

	async function request(path, method, payload) {
		const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;
		const headers = isForm ? {} : {
			'Content-Type': 'application/json',
		};
		const response = await fetch(API_BASE + path, {
			method: method || 'GET',
			credentials: 'include',
			headers: headers,
			body: payload == null ? undefined : (isForm ? payload : JSON.stringify(payload)),
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
		createGame: (title, gameType, roomId) => request('/games', 'POST', {
			title,
			game_type: gameType,
			room_id: roomId,
		}),
		adminListUsers: () => request('/admin/users', 'GET'),
		adminListRooms: () => request('/admin/rooms', 'GET'),
		adminCreateRoom: (name, code) => request('/admin/rooms', 'POST', { name, code }),
		adminUpdateRoom: (roomId, name, code) => request('/admin/rooms/' + encodeURIComponent(roomId), 'POST', {
			name,
			code,
		}),
		adminAddRoomMembers: (roomId, userIds) => request('/admin/rooms/' + encodeURIComponent(roomId) + '/members', 'POST', {
			user_ids: userIds,
		}),
		adminRemoveUserRoom: (userId, roomId) => request('/admin/users/' + encodeURIComponent(userId) + '/rooms/' + encodeURIComponent(roomId), 'DELETE'),
		adminSetUserAdmin: (userId, isAdmin) => request('/admin/users/' + encodeURIComponent(userId) + '/admin', 'POST', {
			is_admin: isAdmin ? 1 : 0,
		}),
		adminDeleteUser: (userId) => request('/admin/users/' + encodeURIComponent(userId), 'DELETE'),
		adminDeleteRoom: (roomId) => request('/admin/rooms/' + encodeURIComponent(roomId), 'DELETE'),
		adminListPlayerIcons: () => request('/admin/player-icons', 'GET'),
		adminUpdatePlayerIcon: (payload) => request('/admin/player-icons/icon', 'POST', payload),
		adminBulkPlayerIcons: (payload) => request('/admin/player-icons/bulk', 'POST', payload),
		adminCreatePlayerIconTag: (name) => request('/admin/player-icons/tags', 'POST', { name }),
		adminRenamePlayerIconTag: (tagId, name) => request('/admin/player-icons/tags/' + encodeURIComponent(tagId), 'POST', { name }),
		adminDeletePlayerIconTag: (tagId) => request('/admin/player-icons/tags/' + encodeURIComponent(tagId), 'DELETE'),
		adminUploadPlayerIcon: (file) => {
			const form = new FormData();
			form.append('file', file);
			return request('/admin/player-icons/upload', 'POST', form);
		},
		joinGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/join', 'POST'),
		observeGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/observe', 'POST'),
		leaveGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/leave', 'POST'),
		setGameIcon: (gameId, iconKey) => request('/games/' + encodeURIComponent(gameId) + '/icon', 'POST', {
			icon_key: iconKey,
		}),
		setGameSettings: (gameId, settings) => request('/games/' + encodeURIComponent(gameId) + '/settings', 'POST', settings),
		setDiplomacyPower: (gameId, power) => request('/games/' + encodeURIComponent(gameId) + '/diplomacy-power', 'POST', {
			power: power,
		}),
		diplomacySnapshot: (gameId, year, phase) => request(
			'/games/' + encodeURIComponent(gameId) + '/diplomacy-snapshot?year=' + encodeURIComponent(year) + '&phase=' + encodeURIComponent(phase),
			'GET'
		),
		submitDiplomacyOrder: (gameId, actionType, payload) => request('/games/' + encodeURIComponent(gameId) + '/actions/diplomacy-order', 'POST', {
			action_type: actionType,
			payload: payload || {},
		}),
		startGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/start', 'POST'),
		endGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/end', 'POST'),
		deleteGame: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/delete', 'POST'),
		gameDetail: (gameId) => request('/games/' + encodeURIComponent(gameId), 'GET'),
		listMessages: (gameId, sinceId) => request('/games/' + encodeURIComponent(gameId) + '/messages?since_id=' + encodeURIComponent(sinceId || 0), 'GET'),
		sendMessage: (gameId, body) => request('/games/' + encodeURIComponent(gameId) + '/messages', 'POST', { body }),
		listActions: (gameId, sinceId) => request('/games/' + encodeURIComponent(gameId) + '/actions?since_id=' + encodeURIComponent(sinceId || 0), 'GET'),
		sendAction: (gameId, actionType, payload) => request('/games/' + encodeURIComponent(gameId) + '/actions', 'POST', { action_type: actionType, payload: payload || {} }),
		revealActions: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/actions/reveal', 'POST'),
		submitRumbleOrder: (gameId, attacks, abilityActivations) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-order', 'POST', {
			attacks: attacks || {},
			ability_activations: Array.isArray(abilityActivations) ? abilityActivations : [],
		}),
		cancelRumbleOrder: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-order/cancel', 'POST'),
		submitRumbleBids: (gameId, bids) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-bids', 'POST', {
			bids: bids || {},
		}),
		cancelRumbleBids: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-bids/cancel', 'POST'),
		setRumbleShipName: (gameId, shipName) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-ship-name', 'POST', {
			ship_name: shipName,
		}),
		grantRumbleAbilities: (gameId, userId, abilityIds) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-admin-grant-abilities', 'POST', {
			user_id: userId,
			ability_ids: Array.isArray(abilityIds) ? abilityIds : [],
		}),
		revokeRumbleAbilities: (gameId, userId, abilityIds) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-admin-revoke-abilities', 'POST', {
			user_id: userId,
			ability_ids: Array.isArray(abilityIds) ? abilityIds : [],
		}),
		setRumbleHealth: (gameId, userId, health, startingHealth = null) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-admin-set-health', 'POST', Object.assign({
			user_id: userId,
			health: health,
		}, startingHealth !== null ? { starting_health: startingHealth } : {})),
		endRumbleBidding: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/actions/rumble-bids/end', 'POST'),
		endRumbleTurn: (gameId) => request('/games/' + encodeURIComponent(gameId) + '/actions/reveal', 'POST'),
	};
}

export const api = createApiModule();
