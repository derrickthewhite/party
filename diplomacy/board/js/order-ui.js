// Targets, prompt text, and popup markup for writing an order.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.orderPickList = function (graph, position, pending) {
	if (!pending) return [];
	var standing = pending.unit;
	var n = pending.clicks.length;
	var action = DiplomacyBoard.normalizeAction(pending.action);
	var dests = DiplomacyBoard.legalDestinations(graph, standing.province, standing.unit);
	var ids = [];
	var i;
	function otherUnitCanReach(destId) {
		for (var u = 0; u < position.units.length; u++) {
			var other = position.units[u];
			if (other.province === standing.province || other.province === destId) continue;
			if (DiplomacyBoard.canReach(graph, position, other, destId)) return true;
		}
		return false;
	}
	if (action === "move") return dests;
	if (action === "support-defense") {
		for (i = 0; i < dests.length; i++) {
			if (dests[i] !== standing.province && DiplomacyBoard.unitAt(position.units, dests[i])) ids.push(dests[i]);
		}
		return ids;
	}
	if (action === "support-move") {
		if (n === 0) {
			for (i = 0; i < dests.length; i++) {
				if (otherUnitCanReach(dests[i])) ids.push(dests[i]);
			}
			return ids;
		}
		var dest = pending.clicks[0];
		for (i = 0; i < position.units.length; i++) {
			var candidate = position.units[i];
			if (candidate.province === standing.province || candidate.province === dest) continue;
			if (DiplomacyBoard.canReach(graph, position, candidate, dest)) ids.push(candidate.province);
		}
		return ids;
	}
	if (action === "convoy") {
		if (standing.unit === "army") {
			var used = {};
			for (i = 0; i < n; i++) used[pending.clicks[i]] = true;
			var fromSea = n === 0 ? standing.province : pending.clicks[n - 1];
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
		return DiplomacyBoard.coastalLands(graph, pending.clicks[0]);
	}
	return [];
};

DiplomacyBoard.orderPrompt = function (pending) {
	if (!pending) return "";
	var n = pending.clicks.length;
	if (pending.action === "move" || pending.action === "attack") return "Click the province to move to.";
	if (pending.action === "support-defense") return "Click the unit you are supporting.";
	if (pending.action === "support-move" || pending.action === "support-attack") {
		return n === 0 ? "Click the province the move would enter." : "Click a unit that could move there.";
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
	if (pending.action === "move" || pending.action === "attack") draft.to = clicks[0];
	if (pending.action === "support-defense") draft.target = clicks[0];
	if (pending.action === "support-move" || pending.action === "support-attack") {
		draft.to = clicks[0];
		draft.target = clicks[1];
	}
	if (pending.action === "convoy") {
		if (standing.unit === "army") {
			draft.from = standing.province;
			draft.to = clicks[clicks.length - 1];
			draft.via = clicks.slice(0, -1);
		} else {
			draft.from = clicks[0];
			draft.to = clicks[1];
		}
	}
	return draft;
};

DiplomacyBoard.orderPopupHtml = function (graph, unit, current) {
	var province = DiplomacyBoard.province(graph, unit.province);
	var html = "<h2>" + DiplomacyBoard.esc(unit.unit) + " in " + DiplomacyBoard.esc(province ? province.name : unit.province) + "</h2>";
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
	return html;
};

DiplomacyBoard.retreatPopupHtml = function (graph, entry, current) {
	var province = DiplomacyBoard.province(graph, entry.province);
	var html = "<h2>Retreat " + DiplomacyBoard.esc(entry.unit) + " in " + DiplomacyBoard.esc(province ? province.name : entry.province) + "</h2>";
	var choices = entry.choices || [];
	for (var i = 0; i < choices.length; i++) {
		var dest = DiplomacyBoard.province(graph, choices[i]);
		html += "<button type=\"button\" data-retreat-to=\"" + DiplomacyBoard.esc(DiplomacyBoard.canonProvince(graph, choices[i])) + "\">";
		html += DiplomacyBoard.esc(dest ? dest.name : choices[i]) + "</button>";
	}
	if (entry.disband) html += "<button type=\"button\" data-action=\"disband\">Disband</button>";
	if (current) html += "<button type=\"button\" class=\"clear\" data-clear=\"1\">Clear</button>";
	return html;
};

DiplomacyBoard.adjustPopupHtml = function (graph, spec) {
	var province = DiplomacyBoard.province(graph, spec.province);
	var name = province ? province.name : spec.province;
	var html = "<h2>" + DiplomacyBoard.esc(name) + "</h2>";
	var units = spec.units || [];
	for (var i = 0; i < units.length; i++) {
		html += "<button type=\"button\" data-build-unit=\"" + DiplomacyBoard.esc(units[i]) + "\">Build " + DiplomacyBoard.esc(units[i]) + "</button>";
	}
	if (spec.canDisband) html += "<button type=\"button\" data-action=\"disband\">Disband</button>";
	if (spec.current) html += "<button type=\"button\" class=\"clear\" data-clear=\"1\">Clear</button>";
	return html;
};
