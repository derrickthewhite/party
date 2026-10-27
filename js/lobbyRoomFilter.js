export function isValidRoomId(value) {
	return /^[0-9]+$/.test(String(value || ''));
}

export function isValidRoomFilter(value) {
	if (value === 'all') {
		return true;
	}

	return isValidRoomId(value);
}

export function sortRoomsByName(rooms) {
	return (Array.isArray(rooms) ? rooms.slice() : []).sort(function sortRooms(left, right) {
		const byName = String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
		if (byName !== 0) {
			return byName;
		}

		return Number(left.id || 0) - Number(right.id || 0);
	});
}

export function resolveRoomFilter(currentFilter, rooms, games) {
	const sorted = sortRoomsByName(rooms);
	if (sorted.length === 0) {
		return null;
	}

	if (sorted.length === 1) {
		return String(sorted[0].id);
	}

	if (currentFilter === 'all') {
		return 'all';
	}

	const validIds = {};
	sorted.forEach(function eachRoom(room) {
		validIds[String(room.id)] = true;
	});
	if (validIds[String(currentFilter)]) {
		return String(currentFilter);
	}

	return pickRankedRoomId(sorted, games);
}

export function roomFilterAfterLeavingGame(currentFilter, gameRoomId) {
	if (currentFilter === 'all') {
		return 'all';
	}

	if (isValidRoomId(gameRoomId)) {
		return String(gameRoomId);
	}

	return isValidRoomFilter(currentFilter) ? String(currentFilter) : null;
}

function isCountableLobbyStatus(status) {
	const normalized = String(status || '').toLowerCase().replace(/-/g, '_');
	return normalized === 'open' || normalized === 'in_progress';
}

function isUserGameMember(game) {
	if (!game) {
		return false;
	}

	if (game.is_member) {
		return true;
	}

	const role = String(game.member_role || '').trim();
	return role !== '';
}

function pickRankedRoomId(sortedRooms, games) {
	const statsByRoom = {};
	sortedRooms.forEach(function eachRoom(room) {
		statsByRoom[String(room.id)] = {
			memberships: 0,
			playerMemberships: 0,
		};
	});

	(Array.isArray(games) ? games : []).forEach(function eachGame(game) {
		if (!isCountableLobbyStatus(game && game.status) || !isUserGameMember(game)) {
			return;
		}

		const roomKey = String(game.room_id);
		const stats = statsByRoom[roomKey];
		if (!stats) {
			return;
		}

		stats.memberships += 1;
		if (String(game.member_role || '').toLowerCase() !== 'observer') {
			stats.playerMemberships += 1;
		}
	});

	let best = sortedRooms[0];
	sortedRooms.forEach(function eachRoom(room) {
		const current = statsByRoom[String(room.id)];
		const bestStats = statsByRoom[String(best.id)];
		if (current.memberships > bestStats.memberships) {
			best = room;
			return;
		}

		if (current.memberships === bestStats.memberships && current.playerMemberships > bestStats.playerMemberships) {
			best = room;
		}
	});

	return String(best.id);
}
