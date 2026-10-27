// Targets, prompt text, and popup markup for writing an order.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.moveDestinations = function (graph, unit) {
	if (!unit) return [];
	if (unit.unit === "fleet") {
		var ids = DiplomacyBoard.fleetMoves(graph, unit.province, unit.coast);
		var out = [];
		for (var i = 0; i < ids.length; i++) {
			var dest = DiplomacyBoard.province(graph, ids[i]);
			if (DiplomacyBoard.isMultiCoast(dest)) {
				if (!DiplomacyBoard.reachableCoasts(graph, unit.province, unit.coast, ids[i]).length) continue;
			}
			out.push(ids[i]);
		}
		return out;
	}
	return DiplomacyBoard.legalDestinations(graph, unit.province, unit.unit);
};

// Provinces the supported unit can move to that this unit can legally support.
DiplomacyBoard.supportMoveDestinations = function (graph, position, supporter, target) {
	if (!supporter || !target || supporter.province === target.province) return [];
	var dests = DiplomacyBoard.moveDestinations(graph, supporter);
	var ids = [];
	for (var i = 0; i < dests.length; i++) {
		if (target.province === dests[i]) continue;
		if (DiplomacyBoard.supportMoveLegal(graph, position, supporter, target, dests[i])) ids.push(dests[i]);
	}
	return ids;
};

DiplomacyBoard.supportMoveLegal = function (graph, position, supporter, target, destId, coastId) {
	if (!supporter || !target || !destId) return false;
	var order = {
		province: supporter.province,
		unit: supporter.unit,
		power: supporter.power,
		action: "support-move",
		target: target.province,
		to: destId
	};
	if (coastId) order.coast = coastId;
	if (DiplomacyBoard.isLegalOrder(graph, position, order)) return true;
	if (coastId) return false;
	var dest = DiplomacyBoard.province(graph, destId);
	if (!DiplomacyBoard.isMultiCoast(dest)) return false;
	var coasts = DiplomacyBoard.coastList(dest);
	for (var i = 0; i < coasts.length; i++) {
		order.coast = coasts[i].id;
		if (DiplomacyBoard.isLegalOrder(graph, position, order)) return true;
	}
	return false;
};

DiplomacyBoard.coastOptions = function (graph, position, pending) {
	if (!pending || !pending.unit) return [];
	var action = DiplomacyBoard.normalizeAction(pending.action);
	var unit = pending.unit;
	var n = pending.clicks.length;
	var out = [];
	var seen = {};
	function add(provinceId, coastId) {
		var key = provinceId + "\0" + coastId;
		if (seen[key]) return;
		seen[key] = true;
		out.push({ province: provinceId, coast: coastId });
	}
	var dests = [];
	if (action === "move") {
		if (n !== 0) return out;
		dests = DiplomacyBoard.moveDestinations(graph, unit);
	} else if (action === "support-move") {
		if (n !== 1) return out;
		var target = DiplomacyBoard.unitAt(position && position.units, DiplomacyBoard.clickProvince(pending.clicks[0]));
		dests = DiplomacyBoard.supportMoveDestinations(graph, position, unit, target);
	} else {
		return out;
	}
	for (var i = 0; i < dests.length; i++) {
		var dest = DiplomacyBoard.province(graph, dests[i]);
		if (!DiplomacyBoard.isMultiCoast(dest)) continue;
		var coasts = DiplomacyBoard.coastList(dest);
		for (var c = 0; c < coasts.length; c++) {
			var coastId = coasts[c].id;
			if (action === "support-move") {
				var ally = DiplomacyBoard.unitAt(position.units, DiplomacyBoard.clickProvince(pending.clicks[0]));
				if (!DiplomacyBoard.supportMoveLegal(graph, position, unit, ally, dests[i], coastId)) continue;
			} else if (unit.unit === "fleet") {
				if (!DiplomacyBoard.fleetMoveLegal(graph, unit.province, unit.coast, dests[i], coastId)) continue;
			} else {
				continue;
			}
			add(dests[i], coastId);
		}
	}
	return out;
};

DiplomacyBoard.orderPickList = function (graph, position, pending) {
	if (!pending) return [];
	var standing = pending.unit;
	var n = pending.clicks.length;
	var action = DiplomacyBoard.normalizeAction(pending.action);
	var dests = DiplomacyBoard.moveDestinations(graph, standing);
	var ids = [];
	var i;
	if (action === "move") return dests;
	if (action === "support-defense") {
		for (i = 0; i < dests.length; i++) {
			if (dests[i] === standing.province) continue;
			var target = DiplomacyBoard.unitAt(position.units, dests[i]);
			if (!target) continue;
			if (standing.unit === "fleet" && !DiplomacyBoard.fleetCanReachProvince(graph, standing.province, standing.coast, dests[i])) continue;
			ids.push(dests[i]);
		}
		return ids;
	}
	if (action === "support-move") {
		if (n === 0) {
			for (i = 0; i < position.units.length; i++) {
				var candidate = position.units[i];
				if (DiplomacyBoard.supportMoveDestinations(graph, position, standing, candidate).length) {
					ids.push(candidate.province);
				}
			}
			return ids;
		}
		var target = DiplomacyBoard.unitAt(position.units, DiplomacyBoard.clickProvince(pending.clicks[0]));
		return DiplomacyBoard.supportMoveDestinations(graph, position, standing, target);
	}
	if (action === "convoy") {
		if (standing.unit === "army") {
			var used = {};
			for (i = 0; i < n; i++) used[DiplomacyBoard.clickProvince(pending.clicks[i])] = true;
			var fromSea = n === 0 ? standing.province : DiplomacyBoard.clickProvince(pending.clicks[n - 1]);
			var hops = DiplomacyBoard.legalDestinations(graph, fromSea, "fleet");
			for (i = 0; i < hops.length; i++) {
				var hop = DiplomacyBoard.province(graph, hops[i]);
				if (!hop || used[hops[i]] || hops[i] === standing.province) continue;
				if (hop.kind === "sea") {
					if (DiplomacyBoard.fleetOnSea(position, hops[i])) ids.push(hops[i]);
				} else if (n > 0) {
					ids.push(hops[i]);
				}
			}
			return ids;
		}
		if (n === 0) {
			for (i = 0; i < position.units.length; i++) {
				if (position.units[i].unit !== "army") continue;
				var home = DiplomacyBoard.province(graph, position.units[i].province);
				if (home && home.coastal) ids.push(position.units[i].province);
			}
			return ids;
		}
		return DiplomacyBoard.coastalLands(graph, DiplomacyBoard.clickProvince(pending.clicks[0]));
	}
	return [];
};

DiplomacyBoard.orderPrompt = function (pending) {
	if (!pending) return "";
	var n = pending.clicks.length;
	if (pending.action === "move" || pending.action === "attack") return "Click the province to move to.";
	if (pending.action === "support-defense") return "Click the unit you are supporting.";
	if (pending.action === "support-move" || pending.action === "support-attack") {
		return n === 0 ? "Click the unit to support." : "Click where it is moving.";
	}
	if (pending.action === "convoy") {
		if (pending.unit.unit === "army") {
			return n === 0 ? "Click the first fleet." : "Click the next fleet, or the landing.";
		}
		return n === 0 ? "Click the army to convoy." : "Click where the army is landing.";
	}
	return "";
};

DiplomacyBoard.orderDraft = function (pending) {
	var standing = pending.unit;
	var clicks = pending.clicks;
	var draft = {
		province: standing.province,
		unit: standing.unit,
		power: standing.power,
		action: pending.action
	};
	function putDest(click) {
		draft.to = DiplomacyBoard.clickProvince(click);
		var coast = DiplomacyBoard.clickCoast(click);
		if (coast) draft.coast = coast;
	}
	if (pending.action === "move" || pending.action === "attack") putDest(clicks[0]);
	if (pending.action === "support-defense") draft.target = DiplomacyBoard.clickProvince(clicks[0]);
	if (pending.action === "support-move" || pending.action === "support-attack") {
		draft.target = DiplomacyBoard.clickProvince(clicks[0]);
		putDest(clicks[1]);
	}
	if (pending.action === "convoy") {
		if (standing.unit === "army") {
			draft.from = standing.province;
			draft.to = DiplomacyBoard.clickProvince(clicks[clicks.length - 1]);
			draft.via = clicks.slice(0, -1).map(DiplomacyBoard.clickProvince);
		} else {
			draft.from = DiplomacyBoard.clickProvince(clicks[0]);
			draft.to = DiplomacyBoard.clickProvince(clicks[1]);
		}
	}
	return draft;
};

DiplomacyBoard.orderPopupHtml = function (graph, unit, current) {
	var html = "<h2>" + DiplomacyBoard.esc(DiplomacyBoard.unitHeading(graph, unit)) + "</h2>";
	html += "<div class=\"move-options\">";
	html += "<button type=\"button\" data-action=\"hold\">Hold</button>";
	html += "<button type=\"button\" data-action=\"move\">Move</button>";
	html += "<button type=\"button\" data-action=\"support-defense\">Support defense</button>";
	html += "<button type=\"button\" data-action=\"support-move\">Support move</button>";
	if (DiplomacyBoard.canConvoy(graph, unit)) {
		html += "<button type=\"button\" data-action=\"convoy\">Convoy</button>";
	}
	if (current) {
		html += "<button type=\"button\" class=\"clear\" data-clear=\"1\">Clear</button>";
	}
	html += "</div>";
	return html;
};

DiplomacyBoard.coastOptionsHtml = function (graph, unit, options) {
	var html = "<h2>" + DiplomacyBoard.esc(DiplomacyBoard.unitHeading(graph, unit)) + "</h2>";
	html += "<div class=\"move-options\">";
	for (var i = 0; i < options.length; i++) {
		var opt = options[i];
		html += "<button type=\"button\" data-pick-coast=\"" + DiplomacyBoard.esc(opt.coast) + "\" data-province=\"" + DiplomacyBoard.esc(opt.province) + "\">";
		html += DiplomacyBoard.esc(DiplomacyBoard.placeLabel(graph, opt.province, opt.coast));
		html += "</button>";
	}
	html += "</div>";
	return html;
};

DiplomacyBoard.retreatPopupHtml = function (graph, entry, current) {
	var where = DiplomacyBoard.placeLabel(graph, entry.province, entry.coast);
	var html = "<h2>Retreat " + DiplomacyBoard.esc(entry.unit) + " in " + DiplomacyBoard.esc(where) + "</h2>";
	html += "<div class=\"move-options\">";
	var choices = entry.choices || [];
	for (var i = 0; i < choices.length; i++) {
		var provinceId = DiplomacyBoard.canonProvince(graph, choices[i]);
		var dest = DiplomacyBoard.province(graph, provinceId);
		var coasts = entry.unit === "fleet" ? DiplomacyBoard.reachableCoasts(graph, entry.province, entry.coast, provinceId) : [];
		if (entry.unit === "fleet" && DiplomacyBoard.isMultiCoast(dest) && !coasts.length) {
			coasts = DiplomacyBoard.coastList(dest);
		}
		if (coasts.length) {
			for (var c = 0; c < coasts.length; c++) {
				html += "<button type=\"button\" data-retreat-to=\"" + DiplomacyBoard.esc(provinceId) + "\" data-coast=\"" + DiplomacyBoard.esc(coasts[c].id) + "\">";
				html += DiplomacyBoard.esc(DiplomacyBoard.placeLabel(graph, provinceId, coasts[c].id)) + "</button>";
			}
		} else {
			html += "<button type=\"button\" data-retreat-to=\"" + DiplomacyBoard.esc(provinceId) + "\">";
			html += DiplomacyBoard.esc(dest ? dest.name : choices[i]) + "</button>";
		}
	}
	if (entry.disband) html += "<button type=\"button\" data-action=\"disband\">Disband</button>";
	if (current) html += "<button type=\"button\" class=\"clear\" data-clear=\"1\">Clear</button>";
	html += "</div>";
	return html;
};

DiplomacyBoard.adjustPopupHtml = function (graph, spec) {
	var province = DiplomacyBoard.province(graph, spec.province);
	var name = province ? province.name : spec.province;
	var html = "<h2>" + DiplomacyBoard.esc(name) + "</h2>";
	html += "<div class=\"move-options\">";
	var units = spec.units || [];
	for (var i = 0; i < units.length; i++) {
		if (units[i] === "fleet" && DiplomacyBoard.isMultiCoast(province)) {
			var coasts = DiplomacyBoard.coastList(province);
			for (var c = 0; c < coasts.length; c++) {
				html += "<button type=\"button\" data-build-unit=\"fleet\" data-coast=\"" + DiplomacyBoard.esc(coasts[c].id) + "\">";
				html += "Build fleet, " + DiplomacyBoard.esc(coasts[c].name) + "</button>";
			}
		} else {
			html += "<button type=\"button\" data-build-unit=\"" + DiplomacyBoard.esc(units[i]) + "\">Build " + DiplomacyBoard.esc(units[i]) + "</button>";
		}
	}
	if (spec.canDisband) html += "<button type=\"button\" data-action=\"disband\">Disband</button>";
	if (spec.current) html += "<button type=\"button\" class=\"clear\" data-clear=\"1\">Clear</button>";
	html += "</div>";
	return html;
};
