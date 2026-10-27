function orderAction(order) {
	return String(order && order.action || '');
}

function holdSupportTarget(order) {
	const action = orderAction(order);
	if (action === 'support-defense') {
		return String(order.target || order.supportTarget || '');
	}
	if (action === 'support' && !order.supportMove) {
		return String(order.target || order.supportTarget || '');
	}
	return '';
}

function holdKey(power, province) {
	return String(power || '') + ':' + String(province || '');
}

export function flattenOrderDocs(docs) {
	const list = [];
	(Array.isArray(docs) ? docs : []).forEach(function eachDoc(doc) {
		if (!doc) {
			return;
		}
		const power = String(doc.power || '');
		(Array.isArray(doc.orders) ? doc.orders : []).forEach(function eachOrder(order) {
			if (!order) {
				return;
			}
			list.push({
				power: String(order.power || power),
				province: String(order.province || ''),
				action: orderAction(order),
				target: holdSupportTarget(order),
			});
		});
	});
	return list;
}

export function holdKeysFromDocs(docs) {
	const keys = {};
	flattenOrderDocs(docs).forEach(function each(item) {
		if (item.action === 'hold' && item.province) {
			keys[holdKey(item.power, item.province)] = true;
		}
	});
	return keys;
}

export function applySessionHoldDiff(sessionHolds, previousHolds, currentHolds) {
	const next = {};
	Object.keys(sessionHolds || {}).forEach(function each(key) {
		next[key] = true;
	});
	Object.keys(currentHolds || {}).forEach(function each(key) {
		if (!(previousHolds || {})[key]) {
			next[key] = true;
		}
	});
	Object.keys(previousHolds || {}).forEach(function each(key) {
		if (!(currentHolds || {})[key]) {
			delete next[key];
		}
	});
	return next;
}

function powerSet(powers) {
	const set = {};
	(Array.isArray(powers) ? powers : []).forEach(function each(id) {
		set[String(id)] = true;
	});
	return set;
}

export function countOrderProgress(options) {
	const config = options || {};
	const mode = config.mode || 'orders';
	const owned = powerSet(config.powers);
	const orders = flattenOrderDocs(config.docs);

	if (mode === 'retreat') {
		const retreats = (Array.isArray(config.retreats) ? config.retreats : []).filter(function each(entry) {
			return !!(entry && owned[String(entry.power || '')]);
		});
		const ordered = {};
		orders.forEach(function each(item) {
			if ((item.action === 'retreat' || item.action === 'disband') && item.province) {
				ordered[holdKey(item.power, item.province)] = true;
			}
		});
		let given = 0;
		retreats.forEach(function each(entry) {
			if (ordered[holdKey(entry.power, entry.province)]) {
				given += 1;
			}
		});
		return { given: given, total: retreats.length };
	}

	if (mode === 'build') {
		let given = 0;
		let total = 0;
		(Array.isArray(config.adjustments) ? config.adjustments : []).forEach(function each(entry) {
			if (!entry || !owned[String(entry.power || '')]) {
				return;
			}
			const count = Number(entry.count || 0);
			const cap = Math.abs(count);
			if (!cap) {
				return;
			}
			total += cap;
			const mine = orders.filter(function eachOrder(item) {
				return item.power === String(entry.power);
			});
			const action = count > 0 ? 'build' : 'disband';
			const placed = mine.filter(function eachOrder(item) {
				return item.action === action;
			}).length;
			given += Math.min(placed, cap);
		});
		return { given: given, total: total };
	}

	const units = (Array.isArray(config.units) ? config.units : []).filter(function each(unit) {
		return !!(unit && owned[String(unit.power || '')]);
	});
	const byProvince = {};
	orders.forEach(function each(item) {
		if (item.province) {
			byProvince[item.province] = item;
		}
	});
	const supportedHolds = {};
	orders.forEach(function each(item) {
		if (item.target) {
			supportedHolds[item.target] = true;
		}
	});
	const sessionHolds = config.sessionHolds || {};
	let given = 0;
	units.forEach(function each(unit) {
		const province = String(unit.province || '');
		const item = byProvince[province];
		const action = item ? item.action : '';
		if (action && action !== 'hold') {
			given += 1;
			return;
		}
		if (sessionHolds[holdKey(unit.power, province)]) {
			given += 1;
			return;
		}
		if (supportedHolds[province]) {
			given += 1;
		}
	});
	return { given: given, total: units.length };
}

export function formatOrderProgress(progress) {
	const given = Number(progress && progress.given || 0);
	const total = Number(progress && progress.total || 0);
	return given + '/' + total;
}

function comparableValue(value) {
	if (value == null || value === '') {
		return '';
	}
	if (Array.isArray(value)) {
		return value.map(function each(item) {
			return String(item);
		}).join('\u0001');
	}
	return String(value);
}

function comparableOrder(order) {
	if (!order) {
		return '';
	}
	return [
		orderAction(order),
		comparableValue(order.province),
		comparableValue(order.unit),
		comparableValue(order.to),
		comparableValue(order.target || order.supportTarget),
		comparableValue(order.from || order.convoyFrom),
		comparableValue(order.via),
		comparableValue(order.coast),
	].join('\u0000');
}

export function orderDocsEqual(left, right) {
	const leftOrders = (left && Array.isArray(left.orders) ? left.orders : [])
		.map(comparableOrder)
		.sort();
	const rightOrders = (right && Array.isArray(right.orders) ? right.orders : [])
		.map(comparableOrder)
		.sort();
	if (leftOrders.length !== rightOrders.length) {
		return false;
	}
	for (let i = 0; i < leftOrders.length; i += 1) {
		if (leftOrders[i] !== rightOrders[i]) {
			return false;
		}
	}
	return true;
}
