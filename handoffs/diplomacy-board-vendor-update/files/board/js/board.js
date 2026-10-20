// Province graph, positions, and order legality. The map component is mount.js.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.NEUTRAL_FILL = "#f7f1e1";
DiplomacyBoard.NEUTRAL_WATER_FILL = "#8fa4b8";

DiplomacyBoard.esc = function (value) {
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
};

DiplomacyBoard.clone = function (value) {
	return JSON.parse(JSON.stringify(value));
};

DiplomacyBoard.province = function (graph, id) {
	if (!graph || !graph.provinces || id == null || id === "") return null;
	DiplomacyBoard.uniteProvinces(graph);
	var canonical = graph.aliases && graph.aliases[id] ? graph.aliases[id] : id;
	return graph.provinces[canonical] || null;
};

DiplomacyBoard.provinceId = function (graph, id) {
	if (id == null || id === "") return id;
	DiplomacyBoard.uniteProvinces(graph);
	if (graph && graph.aliases && graph.aliases[id]) return graph.aliases[id];
	return id;
};

DiplomacyBoard.shapeIds = function (graph, id) {
	var canonical = DiplomacyBoard.provinceId(graph, id);
	var province = graph && graph.provinces ? graph.provinces[canonical] : null;
	if (province && province.parts && province.parts.length) return province.parts.slice();
	return [canonical];
};

// A union is several drawn shapes that play as one province. `id` is the
// province the others fold into. Neighbors of any part become neighbors of that
// province, minus the parts themselves. A sea shape folded into a land province
// adds fleet coasts along that water, and keeps a neutral-water fill.
DiplomacyBoard.uniteProvinces = function (graph) {
	if (!graph || graph.united) return graph;
	graph.united = true;
	var unions = graph.unions;
	if (!unions || !unions.length) return graph;
	var aliases = {};
	var canonOf = {};
	var u;
	var p;
	for (u = 0; u < unions.length; u++) {
		var parts = unions[u].parts || [];
		for (p = 0; p < parts.length; p++) canonOf[parts[p]] = unions[u].id;
	}
	function canon(id) {
		return canonOf[id] || id;
	}
	function unique(list, block) {
		var seen = {};
		var out = [];
		for (var i = 0; i < list.length; i++) {
			var id = canon(list[i]);
			if (!id || id === block || seen[id]) continue;
			seen[id] = true;
			out.push(id);
		}
		return out;
	}
	function addFleet(province, destId) {
		if (!province.fleet) province.fleet = [];
		if (province.fleet.indexOf(destId) === -1) province.fleet.push(destId);
	}
	for (u = 0; u < unions.length; u++) {
		var group = unions[u];
		var main = graph.provinces[group.id];
		if (!main) continue;
		var neighbors = [];
		var army = [];
		var fleet = [];
		var seaTouch = [];
		var waterParts = [];
		var coastal = !!main.coastal;
		var groupParts = group.parts || [];
		for (p = 0; p < groupParts.length; p++) {
			if (groupParts[p] !== group.id) aliases[groupParts[p]] = group.id;
			var src = graph.provinces[groupParts[p]];
			if (!src) continue;
			if (src.kind === "sea" || src.coastal) coastal = true;
			if (src.access === "neutral-water") waterParts.push(groupParts[p]);
			neighbors = neighbors.concat(src.neighbors || []);
			if (src.kind === "sea") {
				seaTouch = seaTouch.concat(src.neighbors || []);
			} else {
				army = army.concat(src.army || []);
				fleet = fleet.concat(src.fleet || []);
			}
		}
		if (group.name) main.name = group.name;
		main.parts = groupParts.slice();
		if (waterParts.length) main.waterParts = waterParts;
		main.neighbors = unique(neighbors, group.id);
		main.army = unique(army, group.id);
		main.fleet = unique(fleet, group.id);
		main.coastal = coastal;
		var coasts = unique(seaTouch, group.id);
		for (var c = 0; c < coasts.length; c++) {
			var other = graph.provinces[coasts[c]];
			if (!other || (other.access && other.access !== "open")) continue;
			addFleet(main, coasts[c]);
			addFleet(other, group.id);
		}
		for (p = 0; p < groupParts.length; p++) {
			if (groupParts[p] !== group.id) delete graph.provinces[groupParts[p]];
		}
	}
	var ids = [];
	for (var id in graph.provinces) {
		if (Object.prototype.hasOwnProperty.call(graph.provinces, id)) ids.push(id);
	}
	for (var n = 0; n < ids.length; n++) {
		var province = graph.provinces[ids[n]];
		province.neighbors = unique(province.neighbors || [], ids[n]);
		province.army = unique(province.army || [], ids[n]);
		province.fleet = unique(province.fleet || [], ids[n]);
		if (Array.isArray(province.coasts)) {
			for (var ci = 0; ci < province.coasts.length; ci++) {
				var coast = province.coasts[ci];
				if (!coast) continue;
				coast.fleet = unique(coast.fleet || [], ids[n]);
			}
		}
	}
	graph.aliases = aliases;
	return graph;
};

DiplomacyBoard.canonicalizePosition = function (graph, position) {
	DiplomacyBoard.uniteProvinces(graph);
	if (!position) return position;
	var ownership = {};
	for (var provinceId in position.ownership) {
		if (!Object.prototype.hasOwnProperty.call(position.ownership, provinceId)) continue;
		ownership[DiplomacyBoard.provinceId(graph, provinceId)] = position.ownership[provinceId];
	}
	position.ownership = ownership;
	var units = position.units || [];
	for (var i = 0; i < units.length; i++) {
		units[i].province = DiplomacyBoard.provinceId(graph, units[i].province);
	}
	return position;
};

DiplomacyBoard.canonicalizeOrder = function (graph, order) {
	if (!order) return order;
	DiplomacyBoard.uniteProvinces(graph);
	if (order.province) order.province = DiplomacyBoard.provinceId(graph, order.province);
	if (order.to) order.to = DiplomacyBoard.provinceId(graph, order.to);
	if (order.target) order.target = DiplomacyBoard.provinceId(graph, order.target);
	if (order.from) order.from = DiplomacyBoard.provinceId(graph, order.from);
	if (Array.isArray(order.via)) {
		order.via = order.via.map(function (id) {
			return DiplomacyBoard.provinceId(graph, id);
		});
	}
	return order;
};

DiplomacyBoard.isOpen = function (province) {
	return !!province && (!province.access || province.access === "open");
};

DiplomacyBoard.hoverName = function (province) {
	if (!province || province.access === "unnamed" || province.access === "neutral-water") return "";
	if (province.access === "impassable") return (province.name || "") + " (impassable)";
	return province.name || "";
};

DiplomacyBoard.legalDestinations = function (graph, provinceId, unitType) {
	var province = DiplomacyBoard.province(graph, provinceId);
	if (!province) return [];
	if (unitType === "fleet") return (province.fleet || []).slice();
	if (unitType === "army") return (province.army || []).slice();
	return [];
};

DiplomacyBoard.isLegalMove = function (graph, from, unitType, to) {
	return DiplomacyBoard.legalDestinations(graph, from, unitType).indexOf(DiplomacyBoard.provinceId(graph, to)) !== -1;
};

DiplomacyBoard.coastList = function (province) {
	return province && Array.isArray(province.coasts) ? province.coasts : [];
};

DiplomacyBoard.isMultiCoast = function (province) {
	return DiplomacyBoard.coastList(province).length > 1;
};

DiplomacyBoard.coastById = function (province, coastId) {
	if (!coastId) return null;
	var coasts = DiplomacyBoard.coastList(province);
	for (var i = 0; i < coasts.length; i++) {
		if (coasts[i] && coasts[i].id === coastId) return coasts[i];
	}
	return null;
};

// A fleet on a multi-coast province moves by that coast's list. Other spaces
// keep using the province fleet list.
DiplomacyBoard.fleetMoves = function (graph, provinceId, coastId) {
	var province = DiplomacyBoard.province(graph, provinceId);
	if (!province) return [];
	if (DiplomacyBoard.isMultiCoast(province)) {
		var coast = DiplomacyBoard.coastById(province, coastId);
		return coast && Array.isArray(coast.fleet) ? coast.fleet.slice() : [];
	}
	return (province.fleet || []).slice();
};

DiplomacyBoard.fleetMoveLegal = function (graph, fromId, fromCoast, toId, toCoast) {
	fromId = DiplomacyBoard.provinceId(graph, fromId);
	toId = DiplomacyBoard.provinceId(graph, toId);
	if (!fromId || !toId || fromId === toId) return false;
	if (DiplomacyBoard.fleetMoves(graph, fromId, fromCoast).indexOf(toId) === -1) return false;
	var dest = DiplomacyBoard.province(graph, toId);
	if (DiplomacyBoard.isMultiCoast(dest)) {
		if (!toCoast) return false;
		var coast = DiplomacyBoard.coastById(dest, toCoast);
		if (!coast) return false;
		if ((coast.fleet || []).indexOf(fromId) === -1) return false;
		// Two split provinces can meet on both shores. `via` names which
		// coast of the other province this coast actually touches.
		var origin = DiplomacyBoard.province(graph, fromId);
		if (!DiplomacyBoard.isMultiCoast(origin)) return true;
		var from = DiplomacyBoard.coastById(origin, fromCoast);
		if (!from) return false;
		return DiplomacyBoard.coastViaAllows(from, toId, toCoast) && DiplomacyBoard.coastViaAllows(coast, fromId, fromCoast);
	}
	return !toCoast;
};

DiplomacyBoard.coastViaAllows = function (coast, otherId, otherCoast) {
	if (!coast || !coast.via || !Object.prototype.hasOwnProperty.call(coast.via, otherId)) return true;
	var allowed = coast.via[otherId];
	return Array.isArray(allowed) && allowed.indexOf(otherCoast) !== -1;
};

DiplomacyBoard.reachableCoasts = function (graph, fromId, fromCoast, toId) {
	var dest = DiplomacyBoard.province(graph, toId);
	if (!DiplomacyBoard.isMultiCoast(dest)) return [];
	var coasts = DiplomacyBoard.coastList(dest);
	var out = [];
	for (var i = 0; i < coasts.length; i++) {
		if (DiplomacyBoard.fleetMoveLegal(graph, fromId, fromCoast, toId, coasts[i].id)) out.push(coasts[i]);
	}
	return out;
};

DiplomacyBoard.fleetCanReachProvince = function (graph, fromId, fromCoast, toId) {
	var dest = DiplomacyBoard.province(graph, toId);
	if (!dest) return false;
	if (DiplomacyBoard.isMultiCoast(dest)) return DiplomacyBoard.reachableCoasts(graph, fromId, fromCoast, toId).length > 0;
	return DiplomacyBoard.fleetMoveLegal(graph, fromId, fromCoast, toId, "");
};

DiplomacyBoard.placeLabel = function (graph, provinceId, coastId) {
	var province = DiplomacyBoard.province(graph, provinceId);
	var name = province && province.name ? province.name : String(provinceId || "");
	var coast = DiplomacyBoard.coastById(province, coastId);
	if (coast && coast.name) return name + ", " + coast.name;
	return name;
};

DiplomacyBoard.unitHeading = function (graph, unit) {
	var kind = unit && unit.unit ? unit.unit : "unit";
	return kind + " in " + DiplomacyBoard.placeLabel(graph, unit && unit.province, unit && unit.coast);
};

DiplomacyBoard.clickProvince = function (click) {
	if (click && typeof click === "object") return click.province || "";
	return click || "";
};

DiplomacyBoard.clickCoast = function (click) {
	if (click && typeof click === "object") return click.coast || "";
	return "";
};

DiplomacyBoard.nearestSea = function (graph, province) {
	if (!province || !province.center) return null;
	var list = province.fleet || [];
	var best = null;
	var bestD = Infinity;
	for (var i = 0; i < list.length; i++) {
		var sea = DiplomacyBoard.province(graph, list[i]);
		if (!sea || sea.kind !== "sea" || !sea.center) continue;
		var dx = sea.center.x - province.center.x;
		var dy = sea.center.y - province.center.y;
		var d = dx * dx + dy * dy;
		if (d < bestD) {
			bestD = d;
			best = sea;
		}
	}
	return best;
};

DiplomacyBoard.mapKeyFromSource = function (source) {
	return String(source || "").replace(/\.(svg|json)$/i, "");
};

DiplomacyBoard.tokenSlotKey = function (unitType, provinceId, coastId) {
	if (unitType === "fleet" && coastId) return provinceId + ":" + coastId;
	return provinceId;
};

DiplomacyBoard.ensureTokenSlots = function (graph) {
	if (!graph.tokenSlots || typeof graph.tokenSlots !== "object") graph.tokenSlots = {};
	return graph.tokenSlots;
};

DiplomacyBoard.mergeTokenPositions = function (graph, doc) {
	var slots = DiplomacyBoard.ensureTokenSlots(graph);
	var incoming = doc && doc.slots ? doc.slots : doc;
	if (!incoming || typeof incoming !== "object") return graph;
	for (var key in incoming) {
		if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
		var kinds = incoming[key];
		if (!kinds || typeof kinds !== "object") continue;
		if (!slots[key]) slots[key] = {};
		for (var kind in kinds) {
			if (!Object.prototype.hasOwnProperty.call(kinds, kind)) continue;
			var src = kinds[kind];
			if (!src || typeof src.x !== "number" || typeof src.y !== "number") continue;
			var copy = { x: src.x, y: src.y };
			if (src.facing && typeof src.facing.x === "number" && typeof src.facing.y === "number") {
				copy.facing = { x: src.facing.x, y: src.facing.y };
			}
			slots[key][kind] = copy;
		}
	}
	return graph;
};

DiplomacyBoard.resolvedFleetCoast = function (province, coastId) {
	var coast = DiplomacyBoard.coastById(province, coastId);
	if (!coast && DiplomacyBoard.coastList(province).length === 1) coast = province.coasts[0];
	return coast || null;
};

DiplomacyBoard.tokenSlotForUnit = function (graph, unit) {
	if (!graph || !unit) return null;
	var slots = graph.tokenSlots;
	if (!slots) return null;
	var provinceId = DiplomacyBoard.provinceId(graph, unit.province);
	var kind = unit.unit === "fleet" ? "fleet" : "army";
	var coastId = "";
	if (kind === "fleet") {
		var coast = DiplomacyBoard.resolvedFleetCoast(DiplomacyBoard.province(graph, provinceId), unit.coast);
		if (coast && coast.id) coastId = coast.id;
	}
	var keyed = DiplomacyBoard.tokenSlotKey(kind, provinceId, coastId);
	if (slots[keyed] && slots[keyed][kind]) return slots[keyed][kind];
	if (kind === "fleet" && coastId && slots[provinceId] && slots[provinceId].fleet) return slots[provinceId].fleet;
	return null;
};

// Armies use the province center. A fleet uses its coast anchor, or sits on
// the water edge toward the nearest sea.
DiplomacyBoard.defaultUnitPoint = function (graph, unit) {
	var province = DiplomacyBoard.province(graph, unit && unit.province);
	if (!province || !province.center) return null;
	if (!unit || unit.unit !== "fleet" || province.kind === "sea") return province.center;
	var coast = DiplomacyBoard.resolvedFleetCoast(province, unit.coast);
	if (coast && coast.anchor) return { x: coast.anchor.x, y: coast.anchor.y };
	var sea = DiplomacyBoard.nearestSea(graph, province);
	if (!sea) return province.center;
	var dx = sea.center.x - province.center.x;
	var dy = sea.center.y - province.center.y;
	var len = Math.hypot(dx, dy) || 1;
	var step = Math.min(len * 0.45, 80);
	return {
		x: province.center.x + (dx / len) * step,
		y: province.center.y + (dy / len) * step
	};
};

DiplomacyBoard.unitPoint = function (graph, unit) {
	var slot = DiplomacyBoard.tokenSlotForUnit(graph, unit);
	if (slot) return { x: slot.x, y: slot.y };
	return DiplomacyBoard.defaultUnitPoint(graph, unit);
};

// Local hull space has the bow at negative y. Map y grows downward, so
// starboard is a clockwise quarter-turn from the facing vector.
DiplomacyBoard.hullOffset = function (facing, lx, ly) {
	var fx = facing && typeof facing.x === "number" ? facing.x : 0;
	var fy = facing && typeof facing.y === "number" ? facing.y : -1;
	var len = Math.hypot(fx, fy) || 1;
	var ux = fx / len;
	var uy = fy / len;
	var rx = -uy;
	var ry = ux;
	return {
		x: lx * rx - ly * ux,
		y: lx * ry - ly * uy
	};
};

DiplomacyBoard.defaultFleetFacing = function (graph, unit, anchor) {
	var province = DiplomacyBoard.province(graph, unit && unit.province);
	if (!province || !anchor) return { x: 0, y: -1 };
	var coast = DiplomacyBoard.resolvedFleetCoast(province, unit && unit.coast);
	if (coast && coast.facing && (coast.facing.x || coast.facing.y)) return coast.facing;
	var ids = coast && Array.isArray(coast.fleet) ? coast.fleet : (province.fleet || []);
	var sx = 0;
	var sy = 0;
	var n = 0;
	for (var i = 0; i < ids.length; i++) {
		var sea = DiplomacyBoard.province(graph, ids[i]);
		if (!sea || sea.kind !== "sea" || !sea.center) continue;
		sx += sea.center.x;
		sy += sea.center.y;
		n += 1;
	}
	if (!n) {
		var nearest = DiplomacyBoard.nearestSea(graph, province);
		if (!nearest) return { x: 0, y: -1 };
		return { x: nearest.center.x - anchor.x, y: nearest.center.y - anchor.y };
	}
	return { x: sx / n - anchor.x, y: sy / n - anchor.y };
};

DiplomacyBoard.fleetFacing = function (graph, unit, anchor) {
	var slot = DiplomacyBoard.tokenSlotForUnit(graph, unit);
	if (slot && slot.facing && (slot.facing.x || slot.facing.y)) return slot.facing;
	return DiplomacyBoard.defaultFleetFacing(graph, unit, anchor);
};

DiplomacyBoard.moveTokenSlot = function (graph, key, kind, point) {
	var slots = DiplomacyBoard.ensureTokenSlots(graph);
	if (!slots[key]) slots[key] = {};
	if (!slots[key][kind]) slots[key][kind] = { x: point.x, y: point.y };
	slots[key][kind].x = point.x;
	slots[key][kind].y = point.y;
};

DiplomacyBoard.buildTokenPositions = function (graph) {
	DiplomacyBoard.uniteProvinces(graph);
	var slots = DiplomacyBoard.ensureTokenSlots(graph);
	var ids = [];
	var id;
	for (id in graph.provinces) {
		if (Object.prototype.hasOwnProperty.call(graph.provinces, id)) ids.push(id);
	}
	ids.sort();
	for (var i = 0; i < ids.length; i++) {
		id = ids[i];
		var province = graph.provinces[id];
		if (!DiplomacyBoard.isOpen(province) || !province.center) continue;
		if (province.kind !== "sea") {
			if (!slots[id]) slots[id] = {};
			if (!slots[id].army) {
				var armyAt = DiplomacyBoard.defaultUnitPoint(graph, { province: id, unit: "army" });
				if (armyAt) slots[id].army = { x: armyAt.x, y: armyAt.y };
			}
		}
		if (province.kind === "sea") {
			if (!slots[id]) slots[id] = {};
			if (!slots[id].fleet) {
				var seaAt = DiplomacyBoard.defaultUnitPoint(graph, { province: id, unit: "fleet" });
				var seaFace = DiplomacyBoard.defaultFleetFacing(graph, { province: id, unit: "fleet" }, seaAt);
				slots[id].fleet = { x: seaAt.x, y: seaAt.y, facing: { x: seaFace.x, y: seaFace.y } };
			}
		} else if (province.coastal) {
			var coasts = DiplomacyBoard.coastList(province);
			if (!coasts.length) {
				if (!slots[id]) slots[id] = {};
				if (!slots[id].fleet) {
					var fleetAt = DiplomacyBoard.defaultUnitPoint(graph, { province: id, unit: "fleet" });
					var fleetFace = DiplomacyBoard.defaultFleetFacing(graph, { province: id, unit: "fleet" }, fleetAt);
					slots[id].fleet = { x: fleetAt.x, y: fleetAt.y, facing: { x: fleetFace.x, y: fleetFace.y } };
				}
			} else {
				for (var c = 0; c < coasts.length; c++) {
					var coast = coasts[c];
					var key = DiplomacyBoard.tokenSlotKey("fleet", id, coast.id);
					if (!slots[key]) slots[key] = {};
					if (!slots[key].fleet) {
						var coastAt = DiplomacyBoard.defaultUnitPoint(graph, { province: id, unit: "fleet", coast: coast.id });
						var coastFace = DiplomacyBoard.defaultFleetFacing(graph, { province: id, unit: "fleet", coast: coast.id }, coastAt);
						slots[key].fleet = { x: coastAt.x, y: coastAt.y, facing: { x: coastFace.x, y: coastFace.y } };
					}
				}
			}
		}
	}
	return {
		kind: "diplomacy-token-positions",
		map: DiplomacyBoard.mapKeyFromSource(graph.source),
		slots: slots
	};
};

DiplomacyBoard.listTokenSlots = function (graph) {
	DiplomacyBoard.buildTokenPositions(graph);
	var slots = graph.tokenSlots || {};
	var out = [];
	var keys = [];
	var key;
	for (key in slots) {
		if (Object.prototype.hasOwnProperty.call(slots, key)) keys.push(key);
	}
	keys.sort();
	for (var i = 0; i < keys.length; i++) {
		key = keys[i];
		var kinds = slots[key];
		for (var kind in kinds) {
			if (!Object.prototype.hasOwnProperty.call(kinds, kind)) continue;
			var src = kinds[kind];
			if (!src || typeof src.x !== "number" || typeof src.y !== "number") continue;
			out.push({
				key: key,
				kind: kind,
				x: src.x,
				y: src.y,
				facing: src.facing ? { x: src.facing.x, y: src.facing.y } : null
			});
		}
	}
	return out;
};

DiplomacyBoard.exportTokenPositions = function (graph) {
	DiplomacyBoard.buildTokenPositions(graph);
	return {
		kind: "diplomacy-token-positions",
		map: DiplomacyBoard.mapKeyFromSource(graph.source),
		slots: DiplomacyBoard.clone(graph.tokenSlots)
	};
};

DiplomacyBoard.slotNear = function (graph, mapPt, radius) {
	if (!mapPt) return null;
	var best = null;
	var bestD = radius * radius;
	var slots = DiplomacyBoard.listTokenSlots(graph);
	for (var i = 0; i < slots.length; i++) {
		var slot = slots[i];
		var dx = mapPt.x - slot.x;
		var dy = mapPt.y - slot.y;
		var d = dx * dx + dy * dy;
		if (d <= bestD) {
			bestD = d;
			best = slot;
		}
	}
	return best;
};

// Direct move, or an army convoy along seas that currently have fleets.
// This does not look at orders: a convoy counts as a move the army could make.
DiplomacyBoard.canReach = function (graph, position, unit, destId, destCoast) {
	if (!unit || !destId) return false;
	destId = DiplomacyBoard.provinceId(graph, destId);
	if (unit.unit === "fleet") {
		if (destCoast) return DiplomacyBoard.fleetMoveLegal(graph, unit.province, unit.coast, destId, destCoast);
		return DiplomacyBoard.fleetCanReachProvince(graph, unit.province, unit.coast, destId);
	}
	if (DiplomacyBoard.isLegalMove(graph, unit.province, unit.unit, destId)) return true;
	if (unit.unit !== "army") return false;
	var dest = DiplomacyBoard.province(graph, destId);
	var origin = DiplomacyBoard.province(graph, unit.province);
	if (!dest || dest.kind === "sea" || !dest.coastal || !origin || !origin.coastal) return false;
	var seen = {};
	var queue = DiplomacyBoard.seasBeside(graph, unit.province);
	while (queue.length) {
		var seaId = queue.shift();
		if (seen[seaId]) continue;
		seen[seaId] = true;
		if (!DiplomacyBoard.fleetOnSea(position, seaId)) continue;
		if (DiplomacyBoard.isLegalMove(graph, seaId, "fleet", destId)) return true;
		var next = DiplomacyBoard.legalDestinations(graph, seaId, "fleet");
		for (var i = 0; i < next.length; i++) {
			var hop = DiplomacyBoard.province(graph, next[i]);
			if (hop && hop.kind === "sea" && !seen[next[i]]) queue.push(next[i]);
		}
	}
	return false;
};

DiplomacyBoard.canPlace = function (graph, provinceId, unitType) {
	var province = DiplomacyBoard.province(graph, provinceId);
	if (!province || !DiplomacyBoard.isOpen(province)) return false;
	if (unitType === "army") return province.kind !== "sea";
	if (unitType === "fleet") return province.kind === "sea" || province.coastal;
	return false;
};

DiplomacyBoard.canConvoy = function (graph, unit) {
	var province = DiplomacyBoard.province(graph, unit && unit.province);
	if (!province || !unit) return false;
	if (unit.unit === "army") return !!province.coastal;
	if (unit.unit === "fleet") return province.kind === "sea";
	return false;
};

DiplomacyBoard.seasBeside = function (graph, provinceId) {
	var dests = DiplomacyBoard.legalDestinations(graph, provinceId, "fleet");
	var ids = [];
	for (var i = 0; i < dests.length; i++) {
		var sea = DiplomacyBoard.province(graph, dests[i]);
		if (sea && sea.kind === "sea") ids.push(dests[i]);
	}
	return ids;
};

DiplomacyBoard.convoyLandingsViaSea = function (graph, seaId, exceptId) {
	var dests = DiplomacyBoard.legalDestinations(graph, seaId, "fleet");
	var ids = [];
	for (var i = 0; i < dests.length; i++) {
		if (dests[i] === exceptId) continue;
		var land = DiplomacyBoard.province(graph, dests[i]);
		if (land && land.kind !== "sea") ids.push(dests[i]);
	}
	return ids;
};

DiplomacyBoard.convoyLandingsForArmy = function (graph, armyProvince) {
	var seas = DiplomacyBoard.seasBeside(graph, armyProvince);
	var seen = {};
	var ids = [];
	for (var s = 0; s < seas.length; s++) {
		var lands = DiplomacyBoard.convoyLandingsViaSea(graph, seas[s], armyProvince);
		for (var i = 0; i < lands.length; i++) {
			if (seen[lands[i]]) continue;
			seen[lands[i]] = true;
			ids.push(lands[i]);
		}
	}
	return ids;
};

DiplomacyBoard.sharedConvoySea = function (graph, fromId, toId) {
	var seas = DiplomacyBoard.seasBeside(graph, fromId);
	for (var i = 0; i < seas.length; i++) {
		if (DiplomacyBoard.isLegalMove(graph, seas[i], "fleet", toId)) return seas[i];
	}
	return null;
};

DiplomacyBoard.coastalLands = function (graph, exceptId) {
	var ids = [];
	var provinces = graph.provinces || {};
	for (var id in provinces) {
		if (!Object.prototype.hasOwnProperty.call(provinces, id)) continue;
		if (id === exceptId) continue;
		var province = provinces[id];
		if (province && province.kind !== "sea" && province.coastal) ids.push(id);
	}
	return ids;
};

DiplomacyBoard.fleetOnSea = function (position, seaId) {
	var unit = DiplomacyBoard.unitAt(position.units, seaId);
	return unit && unit.unit === "fleet" ? unit : null;
};

DiplomacyBoard.isLegalArmyConvoy = function (graph, position, from, via, to) {
	var start = DiplomacyBoard.province(graph, from);
	var land = DiplomacyBoard.province(graph, to);
	if (!start || !start.coastal || !land || land.kind === "sea" || from === to) return false;
	if (!Array.isArray(via) || via.length < 1) return false;
	if (!DiplomacyBoard.isLegalMove(graph, from, "fleet", via[0])) return false;
	for (var i = 0; i < via.length; i++) {
		var sea = DiplomacyBoard.province(graph, via[i]);
		if (!sea || sea.kind !== "sea" || !DiplomacyBoard.fleetOnSea(position, via[i])) return false;
		if (i > 0 && !DiplomacyBoard.isLegalMove(graph, via[i - 1], "fleet", via[i])) return false;
	}
	return DiplomacyBoard.isLegalMove(graph, via[via.length - 1], "fleet", to);
};

DiplomacyBoard.powerById = function (powers, id) {
	for (var i = 0; i < powers.length; i++) {
		if (powers[i].id === id) return powers[i];
	}
	return null;
};

DiplomacyBoard.unitAt = function (units, provinceId) {
	for (var i = 0; i < units.length; i++) {
		if (units[i].province === provinceId) return units[i];
	}
	return null;
};

DiplomacyBoard.emptyPosition = function (map) {
	return {
		kind: "diplomacy-position",
		map: map,
		powers: [],
		ownership: {},
		units: []
	};
};

DiplomacyBoard.emptyOrders = function (map, power) {
	return {
		kind: "diplomacy-orders",
		map: map,
		power: power || "",
		orders: []
	};
};

DiplomacyBoard.fail = function (message) {
	var error = new Error(message);
	error.diplomacy = true;
	throw error;
};

DiplomacyBoard.requireMap = function (doc, source) {
	if (!doc || typeof doc !== "object") DiplomacyBoard.fail("Not a Diplomacy document");
	if (doc.map !== source) DiplomacyBoard.fail("Document is for " + (doc.map || "an unknown map"));
};

DiplomacyBoard.validatePosition = function (graph, doc) {
	DiplomacyBoard.requireMap(doc, graph.source);
	if (doc.kind !== "diplomacy-position" && doc.kind !== "diplomacy-board") {
		DiplomacyBoard.fail("Expected a position document");
	}
	var powers = Array.isArray(doc.powers) ? doc.powers : DiplomacyBoard.fail("powers must be a list");
	var seen = {};
	var i;
	for (i = 0; i < powers.length; i++) {
		var power = powers[i];
		if (!power || !power.id) DiplomacyBoard.fail("Every power needs an id");
		if (seen[power.id]) DiplomacyBoard.fail("Duplicate power " + power.id);
		seen[power.id] = true;
		if (!power.name) DiplomacyBoard.fail("Power " + power.id + " needs a name");
		if (!power.color) DiplomacyBoard.fail("Power " + power.id + " needs a color");
	}
	var ownership = doc.ownership && typeof doc.ownership === "object" ? doc.ownership : DiplomacyBoard.fail("ownership must be a map");
	for (var provinceId in ownership) {
		if (!Object.prototype.hasOwnProperty.call(ownership, provinceId)) continue;
		var province = DiplomacyBoard.province(graph, provinceId);
		if (!province) DiplomacyBoard.fail("Unknown province " + provinceId);
		if (province.kind === "sea") DiplomacyBoard.fail(provinceId + " is water and cannot be owned");
		if (!DiplomacyBoard.isOpen(province)) DiplomacyBoard.fail((province.name || provinceId) + " cannot be owned");
		if (!seen[ownership[provinceId]]) DiplomacyBoard.fail("Ownership of " + provinceId + " points at unknown power " + ownership[provinceId]);
	}
	var units = Array.isArray(doc.units) ? doc.units : DiplomacyBoard.fail("units must be a list");
	var occupied = {};
	for (i = 0; i < units.length; i++) {
		var unit = units[i];
		if (!unit || !unit.province) DiplomacyBoard.fail("Every unit needs a province");
		if (occupied[unit.province]) DiplomacyBoard.fail("Two units in " + unit.province);
		occupied[unit.province] = true;
		if (unit.unit !== "army" && unit.unit !== "fleet") DiplomacyBoard.fail("Unit in " + unit.province + " must be army or fleet");
		if (!seen[unit.power]) DiplomacyBoard.fail("Unit in " + unit.province + " belongs to unknown power " + unit.power);
		var home = DiplomacyBoard.province(graph, unit.province);
		if (!home) DiplomacyBoard.fail("Unknown province " + unit.province);
		if (!DiplomacyBoard.canPlace(graph, unit.province, unit.unit)) {
			DiplomacyBoard.fail("A " + unit.unit + " cannot stand in " + unit.province);
		}
		if (unit.unit === "fleet" && DiplomacyBoard.isMultiCoast(home)) {
			if (!DiplomacyBoard.coastById(home, unit.coast)) {
				DiplomacyBoard.fail("Fleet in " + (home.name || unit.province) + " needs a coast");
			}
		} else if (unit.coast) {
			DiplomacyBoard.fail((home.name || unit.province) + " does not use a coast");
		}
	}
	return true;
};

DiplomacyBoard.knownMode = function (mode) {
	if (mode === "position" || mode === "retreat" || mode === "build") return mode;
	return "orders";
};

DiplomacyBoard.normalizeAction = function (action) {
	if (action === "attack") return "move";
	if (action === "support-attack") return "support-move";
	return action;
};

DiplomacyBoard.clicksFor = function (action, unit) {
	action = DiplomacyBoard.normalizeAction(action);
	if (action === "hold") return 0;
	if (action === "move" || action === "support-defense") return 1;
	if (action === "support-move") return 2;
	if (action === "convoy") return 2;
	return -1;
};

DiplomacyBoard.copyOrder = function (raw, standing) {
	var action = DiplomacyBoard.normalizeAction(raw.action);
	var order = {
		province: standing.province,
		unit: standing.unit,
		power: standing.power,
		action: action
	};
	if (action === "move") {
		order.to = raw.to;
		if (raw.coast) order.coast = raw.coast;
	}
	if (action === "support-defense") order.target = raw.target;
	if (action === "support-move") {
		order.target = raw.target;
		order.to = raw.to;
		if (raw.coast) order.coast = raw.coast;
	}
	if (action === "convoy") {
		order.from = raw.from || (standing.unit === "army" ? standing.province : raw.from);
		order.to = raw.to;
		if (Array.isArray(raw.via) && raw.via.length) order.via = raw.via.slice();
	}
	return order;
};

DiplomacyBoard.exportableOrder = function (order) {
	var action = DiplomacyBoard.normalizeAction(order.action);
	var out = {
		province: order.province,
		unit: order.unit,
		action: action
	};
	if (action === "move") {
		out.to = order.to;
		if (order.coast) out.coast = order.coast;
	}
	if (action === "support-defense") out.target = order.target;
	if (action === "support-move") {
		out.target = order.target;
		out.to = order.to;
		if (order.coast) out.coast = order.coast;
	}
	if (action === "convoy") {
		out.from = order.from;
		out.to = order.to;
		if (Array.isArray(order.via) && order.via.length) out.via = order.via.slice();
	}
	return out;
};

DiplomacyBoard.isLegalOrder = function (graph, position, order) {
	var standing = DiplomacyBoard.unitAt(position.units, order.province);
	if (!standing) return false;
	if (order.unit && order.unit !== standing.unit) return false;
	var action = DiplomacyBoard.normalizeAction(order.action);
	if (action === "hold") return !order.coast;
	if (action === "move") {
		if (standing.unit === "fleet") {
			return DiplomacyBoard.fleetMoveLegal(graph, order.province, standing.coast, order.to, order.coast || "");
		}
		return !order.coast && DiplomacyBoard.isLegalMove(graph, order.province, standing.unit, order.to);
	}
	if (action === "support-defense") {
		if (!order.target || order.target === order.province || order.coast) return false;
		if (!DiplomacyBoard.unitAt(position.units, order.target)) return false;
		if (standing.unit === "fleet") return DiplomacyBoard.fleetCanReachProvince(graph, order.province, standing.coast, order.target);
		return DiplomacyBoard.isLegalMove(graph, order.province, standing.unit, order.target);
	}
	if (action === "support-move") {
		var ally = DiplomacyBoard.unitAt(position.units, order.target);
		if (!ally || order.target === order.province || !order.to || order.to === order.province) return false;
		var dest = DiplomacyBoard.province(graph, order.to);
		var coast = order.coast || "";
		if (ally.unit === "fleet") {
			if (DiplomacyBoard.isMultiCoast(dest)) {
				if (!coast || !DiplomacyBoard.fleetMoveLegal(graph, ally.province, ally.coast, order.to, coast)) return false;
			} else if (coast || !DiplomacyBoard.fleetMoveLegal(graph, ally.province, ally.coast, order.to, "")) return false;
		} else if (coast || !DiplomacyBoard.canReach(graph, position, ally, order.to)) return false;
		if (standing.unit === "fleet") {
			if (DiplomacyBoard.isMultiCoast(dest)) {
				return !!coast && DiplomacyBoard.fleetMoveLegal(graph, order.province, standing.coast, order.to, coast);
			}
			return DiplomacyBoard.fleetMoveLegal(graph, order.province, standing.coast, order.to, "");
		}
		return DiplomacyBoard.isLegalMove(graph, order.province, standing.unit, order.to);
	}
	if (action === "convoy") {
		var here = DiplomacyBoard.province(graph, order.province);
		if (standing.unit === "army") {
			var via = Array.isArray(order.via) ? order.via : [];
			if (via.length === 0) {
				var sea = DiplomacyBoard.sharedConvoySea(graph, order.province, order.to);
				if (sea) via = [sea];
			}
			return DiplomacyBoard.isLegalArmyConvoy(graph, position, order.province, via, order.to);
		}
		var army = DiplomacyBoard.unitAt(position.units, order.from);
		var dest = DiplomacyBoard.province(graph, order.to);
		return !!(standing.unit === "fleet"
			&& here
			&& here.kind === "sea"
			&& army
			&& army.unit === "army"
			&& dest
			&& dest.kind !== "sea"
			&& dest.coastal
			&& order.from !== order.to);
	}
	return false;
};

DiplomacyBoard.validateOrders = function (graph, position, doc, expectedPower) {
	DiplomacyBoard.requireMap(doc, graph.source);
	if (doc.kind !== "diplomacy-orders" && doc.kind !== "diplomacy-board") {
		DiplomacyBoard.fail("Expected an orders document");
	}
	var powerId = expectedPower != null ? expectedPower : doc.power;
	if (doc.kind === "diplomacy-orders" && powerId && doc.power !== powerId) {
		DiplomacyBoard.fail("Orders are for " + doc.power);
	}
	var list = Array.isArray(doc.orders) ? doc.orders : DiplomacyBoard.fail("orders must be a list");
	var used = {};
	for (var i = 0; i < list.length; i++) {
		var order = list[i];
		if (!order || !order.province) DiplomacyBoard.fail("Every order needs a province");
		if (used[order.province]) DiplomacyBoard.fail("Two orders from " + order.province);
		used[order.province] = true;
		var standing = DiplomacyBoard.unitAt(position.units, order.province);
		if (!standing) DiplomacyBoard.fail("No unit in " + order.province);
		if (order.unit && order.unit !== standing.unit) {
			DiplomacyBoard.fail("Order in " + order.province + " does not match the unit there");
		}
		var owner = order.power || powerId || standing.power;
		if (owner !== standing.power) DiplomacyBoard.fail("Order in " + order.province + " is not for the unit's power");
		if (doc.kind === "diplomacy-orders" && powerId && standing.power !== powerId) {
			DiplomacyBoard.fail("Order in " + order.province + " is not for " + powerId);
		}
		var action = DiplomacyBoard.normalizeAction(order.action);
		if (DiplomacyBoard.clicksFor(action) < 0) {
			DiplomacyBoard.fail("Unknown order " + (order.action || ""));
		}
		var normalized = DiplomacyBoard.copyOrder(order, standing);
		if (!DiplomacyBoard.isLegalOrder(graph, position, normalized)) {
			DiplomacyBoard.fail("Illegal " + action + " from " + order.province);
		}
	}
	return true;
};

// Retreat and adjustment documents repeat the choices the host supplied.
// They do not consult movement legality or supply-center counts.
DiplomacyBoard.canonProvince = function (graph, id) {
	return DiplomacyBoard.provinceId(graph, id);
};

DiplomacyBoard.findRetreat = function (graph, retreats, provinceId) {
	var id = DiplomacyBoard.canonProvince(graph, provinceId);
	var list = retreats || [];
	for (var i = 0; i < list.length; i++) {
		if (DiplomacyBoard.canonProvince(graph, list[i].province) === id) return list[i];
	}
	return null;
};

DiplomacyBoard.findAdjustment = function (adjustments, powerId) {
	var list = adjustments || [];
	for (var i = 0; i < list.length; i++) {
		if (list[i].power === powerId) return list[i];
	}
	return null;
};

DiplomacyBoard.adjustmentBuildsAt = function (graph, adjustment, provinceId) {
	var id = DiplomacyBoard.canonProvince(graph, provinceId);
	var found = [];
	var builds = adjustment && adjustment.builds ? adjustment.builds : [];
	for (var i = 0; i < builds.length; i++) {
		if (DiplomacyBoard.canonProvince(graph, builds[i].province) === id) found.push(builds[i].unit);
	}
	return found;
};

DiplomacyBoard.adjustmentCanDisband = function (graph, adjustment, provinceId) {
	if (!adjustment || !(adjustment.count < 0)) return false;
	var id = DiplomacyBoard.canonProvince(graph, provinceId);
	var list = adjustment.disbands || [];
	for (var i = 0; i < list.length; i++) {
		if (DiplomacyBoard.canonProvince(graph, list[i]) === id) return true;
	}
	return false;
};

DiplomacyBoard.exportRetreatOrder = function (order) {
	var out = {
		province: order.province,
		unit: order.unit,
		action: order.action
	};
	if (order.action === "retreat") {
		out.to = order.to;
		if (order.coast) out.coast = order.coast;
	}
	return out;
};

DiplomacyBoard.exportAdjustmentOrder = function (order) {
	if (order.action === "build") {
		var built = { action: "build", province: order.province, unit: order.unit };
		if (order.coast) built.coast = order.coast;
		return built;
	}
	return { action: "disband", province: order.province };
};

DiplomacyBoard.validateRetreats = function (graph, doc, retreats, expectedPower) {
	DiplomacyBoard.requireMap(doc, graph.source);
	if (!doc || doc.kind !== "diplomacy-retreats") DiplomacyBoard.fail("Expected a retreats document");
	var powerId = expectedPower != null ? expectedPower : doc.power;
	if (powerId && doc.power !== powerId) DiplomacyBoard.fail("Retreats are for " + doc.power);
	var list = Array.isArray(doc.orders) ? doc.orders : DiplomacyBoard.fail("orders must be a list");
	var used = {};
	for (var i = 0; i < list.length; i++) {
		var order = list[i];
		if (!order || !order.province) DiplomacyBoard.fail("Every retreat needs a province");
		var provinceId = DiplomacyBoard.canonProvince(graph, order.province);
		if (used[provinceId]) DiplomacyBoard.fail("Two retreats from " + order.province);
		used[provinceId] = true;
		if (!DiplomacyBoard.province(graph, provinceId)) DiplomacyBoard.fail("Unknown province " + order.province);
		var entry = DiplomacyBoard.findRetreat(graph, retreats, provinceId);
		if (!entry) DiplomacyBoard.fail("No retreat offered for " + order.province);
		if (order.unit !== "army" && order.unit !== "fleet") DiplomacyBoard.fail("Retreat in " + order.province + " needs a unit");
		if (order.unit !== entry.unit) DiplomacyBoard.fail("Retreat in " + order.province + " does not match the unit");
		if (doc.power && entry.power !== doc.power) DiplomacyBoard.fail("Retreat in " + order.province + " is not for " + doc.power);
		if (order.action === "retreat") {
			var to = DiplomacyBoard.canonProvince(graph, order.to);
			var choices = entry.choices || [];
			var allowed = false;
			for (var c = 0; c < choices.length; c++) {
				if (DiplomacyBoard.canonProvince(graph, choices[c]) === to) allowed = true;
			}
			if (!allowed) DiplomacyBoard.fail("Retreat from " + order.province + " is not one of the choices");
			var dest = DiplomacyBoard.province(graph, to);
			if (order.unit === "fleet" && DiplomacyBoard.isMultiCoast(dest)) {
				if (!DiplomacyBoard.coastById(dest, order.coast)) {
					DiplomacyBoard.fail("Retreat to " + (dest.name || to) + " needs a coast");
				}
			} else if (order.coast) {
				DiplomacyBoard.fail("Retreat to " + (dest && dest.name || to) + " does not use a coast");
			}
		} else if (order.action === "disband") {
			if (!entry.disband) DiplomacyBoard.fail("Disband is not offered for " + order.province);
		} else {
			DiplomacyBoard.fail("Unknown retreat order " + (order.action || ""));
		}
	}
	return true;
};

DiplomacyBoard.validateAdjustments = function (graph, doc, adjustments, expectedPower) {
	DiplomacyBoard.requireMap(doc, graph.source);
	if (!doc || doc.kind !== "diplomacy-adjustments") DiplomacyBoard.fail("Expected an adjustments document");
	var powerId = expectedPower != null ? expectedPower : doc.power;
	if (powerId && doc.power !== powerId) DiplomacyBoard.fail("Adjustments are for " + doc.power);
	var adjustment = DiplomacyBoard.findAdjustment(adjustments, doc.power);
	if (!adjustment) DiplomacyBoard.fail("No adjustment offered for " + (doc.power || "that power"));
	var list = Array.isArray(doc.orders) ? doc.orders : DiplomacyBoard.fail("orders must be a list");
	var count = adjustment.count || 0;
	var used = {};
	var builds = 0;
	var disbands = 0;
	for (var i = 0; i < list.length; i++) {
		var order = list[i];
		if (!order || !order.province) DiplomacyBoard.fail("Every adjustment needs a province");
		var provinceId = DiplomacyBoard.canonProvince(graph, order.province);
		if (used[provinceId]) DiplomacyBoard.fail("Two adjustments in " + order.province);
		used[provinceId] = true;
		if (!DiplomacyBoard.province(graph, provinceId)) DiplomacyBoard.fail("Unknown province " + order.province);
		if (order.action === "build") {
			var offered = DiplomacyBoard.adjustmentBuildsAt(graph, adjustment, provinceId);
			if (offered.indexOf(order.unit) === -1) DiplomacyBoard.fail("Build in " + order.province + " is not one of the choices");
			var buildAt = DiplomacyBoard.province(graph, provinceId);
			if (order.unit === "fleet" && DiplomacyBoard.isMultiCoast(buildAt)) {
				if (!DiplomacyBoard.coastById(buildAt, order.coast)) {
					DiplomacyBoard.fail("Build in " + (buildAt.name || provinceId) + " needs a coast");
				}
			} else if (order.coast) {
				DiplomacyBoard.fail("Build in " + (buildAt && buildAt.name || provinceId) + " does not use a coast");
			}
			builds += 1;
		} else if (order.action === "disband") {
			if (!DiplomacyBoard.adjustmentCanDisband(graph, adjustment, provinceId)) {
				DiplomacyBoard.fail("Disband in " + order.province + " is not one of the choices");
			}
			disbands += 1;
		} else {
			DiplomacyBoard.fail("Unknown adjustment " + (order.action || ""));
		}
	}
	if (count > 0 && (disbands > 0 || builds > count)) DiplomacyBoard.fail("That adjustment allows " + count + " builds");
	if (count < 0 && (builds > 0 || disbands > -count)) DiplomacyBoard.fail("That adjustment allows " + (-count) + " disbands");
	if (count === 0 && list.length) DiplomacyBoard.fail("That power has no adjustment");
	return true;
};
