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

// Direct move, or an army convoy along seas that currently have fleets.
// This does not look at orders: a convoy counts as a move the army could make.
DiplomacyBoard.canReach = function (graph, position, unit, destId) {
	if (!unit || !destId) return false;
	destId = DiplomacyBoard.provinceId(graph, destId);
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
		if (!DiplomacyBoard.canPlace(graph, unit.province, unit.unit)) {
			DiplomacyBoard.fail("A " + unit.unit + " cannot stand in " + unit.province);
		}
		if (!DiplomacyBoard.province(graph, unit.province)) DiplomacyBoard.fail("Unknown province " + unit.province);
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
	if (action === "move") order.to = raw.to;
	if (action === "support-defense") order.target = raw.target;
	if (action === "support-move") {
		order.target = raw.target;
		order.to = raw.to;
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
	if (action === "move") out.to = order.to;
	if (action === "support-defense") out.target = order.target;
	if (action === "support-move") {
		out.target = order.target;
		out.to = order.to;
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
	if (action === "hold") return true;
	if (action === "move") {
		return DiplomacyBoard.isLegalMove(graph, order.province, standing.unit, order.to);
	}
	if (action === "support-defense") {
		return order.target
			&& order.target !== order.province
			&& DiplomacyBoard.unitAt(position.units, order.target)
			&& DiplomacyBoard.isLegalMove(graph, order.province, standing.unit, order.target);
	}
	if (action === "support-move") {
		var ally = DiplomacyBoard.unitAt(position.units, order.target);
		return !!(ally
			&& order.target !== order.province
			&& order.to
			&& order.to !== order.province
			&& DiplomacyBoard.isLegalMove(graph, order.province, standing.unit, order.to)
			&& DiplomacyBoard.canReach(graph, position, ally, order.to));
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
	if (order.action === "retreat") out.to = order.to;
	return out;
};

DiplomacyBoard.exportAdjustmentOrder = function (order) {
	if (order.action === "build") {
		return { action: "build", province: order.province, unit: order.unit };
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
