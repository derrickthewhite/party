// Movement resolution for the standard Diplomacy rules.
// Strengths and success conditions follow the Diplomacy Adjudicator Test Cases.
// Cycles are resolved by trying both guesses. A pure circle of moves succeeds.
// A convoy paradox disrupts the convoying fleets (the Szykman rule) and the
// rest of the orders are resolved again. Retreats are not applied: a dislodged
// unit stays in its province and is marked.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.adjudicate = function (graph, position, orders) {
	var UNRESOLVED = 0;
	var GUESSING = 1;
	var RESOLVED = 2;
	var list = [];
	var byProvince = {};
	var depList = [];
	var nrOfDep = 0;
	var depth = 0;
	var notes = [];
	var noted = {};
	var rawByProvince = {};
	var i;

	orders = orders || [];
	for (i = 0; i < orders.length; i++) {
		var raw = orders[i];
		if (raw && raw.province) rawByProvince[raw.province] = raw;
	}

	var units = position && Array.isArray(position.units) ? position.units : [];
	for (i = 0; i < units.length; i++) {
		var unit = units[i];
		if (!unit || !unit.province || byProvince[unit.province]) continue;
		var order = makeOrder(unit, rawByProvince[unit.province]);
		order.index = list.length;
		list.push(order);
		byProvince[unit.province] = order;
	}
	for (i = 0; i < list.length; i++) {
		if (list[i].viaConvoy && !list[i].via.length) list[i].via = searchRoute(list[i]);
	}

	for (i = 0; i < list.length; i++) {
		if (list[i].action === "convoy") resolve(i);
	}
	for (i = 0; i < list.length; i++) {
		if (list[i].action !== "hold") resolve(i);
	}

	var taken = {};
	for (i = 0; i < list.length; i++) {
		if (list[i].action === "move" && list[i].resolution) taken[list[i].to] = list[i].province;
	}
	for (i = 0; i < list.length; i++) {
		var done = list[i];
		var moved = done.action === "move" && !!done.resolution;
		done.moved = moved;
		done.dislodged = !moved && !!taken[done.province];
		done.pathOk = done.action === "move" ? pathSucceeds(done) : false;
		done.summary = summary(done);
	}

	var lines = [];
	var results = {};
	for (i = 0; i < list.length; i++) {
		lines.push(sentence(list[i]));
		results[list[i].province] = {
			action: list[i].action,
			to: list[i].to,
			supportTarget: list[i].supportTarget,
			supportTo: list[i].supportTo,
			resolution: !!list[i].resolution,
			moved: !!list[i].moved,
			dislodged: !!list[i].dislodged,
			pathOk: !!list[i].pathOk,
			summary: list[i].summary
		};
	}
	lines.sort();
	var text = lines.join("\n");
	if (notes.length) text += (text ? "\n\n" : "") + notes.join("\n");
	if (text) text += "\n";

	var drawn = [];
	for (i = 0; i < units.length; i++) {
		var standing = units[i];
		var outcome = standing && byProvince[standing.province];
		if (!outcome) continue;
		drawn.push({
			province: outcome.moved ? outcome.to : standing.province,
			origin: standing.province,
			unit: standing.unit,
			power: standing.power,
			dislodged: !!outcome.dislodged
		});
	}

	return { text: text, notes: notes.slice(), units: drawn, results: results };

	function makeOrder(unit, raw) {
		var order = {
			province: unit.province,
			unit: unit.unit,
			power: unit.power,
			action: "hold",
			to: null,
			viaConvoy: false,
			via: [],
			supportMove: false,
			supportTarget: null,
			supportTo: null,
			convoyFrom: null,
			convoyTo: null,
			state: UNRESOLVED,
			resolution: false,
			illegal: false
		};
		if (!raw) return order;
		var action = DiplomacyBoard.normalizeAction(raw.action);
		if (action === "move") {
			order.action = "move";
			order.to = raw.to || null;
			if (!order.to) order.illegal = true;
		} else if (action === "convoy" && unit.unit === "army") {
			order.action = "move";
			order.viaConvoy = true;
			order.to = raw.to || null;
			order.via = Array.isArray(raw.via) ? raw.via.slice() : [];
			if (!order.to) order.illegal = true;
		} else if (action === "convoy" && unit.unit === "fleet") {
			order.action = "convoy";
			order.convoyFrom = raw.from || null;
			order.convoyTo = raw.to || null;
		} else if (action === "support-defense") {
			order.action = "support";
			order.supportTarget = raw.target || null;
		} else if (action === "support-move") {
			order.action = "support";
			order.supportMove = true;
			order.supportTarget = raw.target || null;
			order.supportTo = raw.to || null;
		} else if (action !== "hold") {
			order.illegal = true;
		}
		return order;
	}

	function placeName(id) {
		var province = DiplomacyBoard.province(graph, id);
		return province && province.name ? province.name : String(id || "");
	}

	function powerName(id) {
		var power = DiplomacyBoard.powerById((position && position.powers) || [], id);
		return power && power.name ? power.name : String(id || "");
	}

	function note(text) {
		if (noted[text]) return;
		noted[text] = true;
		notes.push(text);
	}

	function searchRoute(order) {
		var queue = [{ at: order.province, path: [] }];
		var seen = {};
		seen[order.province] = true;
		while (queue.length) {
			var item = queue.shift();
			var nexts = DiplomacyBoard.legalDestinations(graph, item.at, "fleet");
			for (var n = 0; n < nexts.length; n++) {
				var seaId = nexts[n];
				if (seen[seaId]) continue;
				var sea = DiplomacyBoard.province(graph, seaId);
				if (!sea || sea.kind !== "sea") continue;
				var fleet = byProvince[seaId];
				if (!fleet || fleet.action !== "convoy" || fleet.convoyFrom !== order.province || fleet.convoyTo !== order.to) continue;
				var path = item.path.concat([seaId]);
				if (DiplomacyBoard.isLegalMove(graph, seaId, "fleet", order.to)) return path;
				seen[seaId] = true;
				queue.push({ at: seaId, path: path });
			}
		}
		return [];
	}

	function directPath(order) {
		return !!(order.to && DiplomacyBoard.isLegalMove(graph, order.province, order.unit, order.to));
	}

	function pathSucceeds(order) {
		if (!order || order.action !== "move" || !order.to) return false;
		if (!order.viaConvoy) return directPath(order);
		var via = order.via || [];
		if (!via.length) return false;
		var prev = order.province;
		for (var hop = 0; hop < via.length; hop++) {
			var seaId = via[hop];
			var sea = DiplomacyBoard.province(graph, seaId);
			if (!sea || sea.kind !== "sea") return false;
			if (!DiplomacyBoard.isLegalMove(graph, prev, "fleet", seaId)) return false;
			var fleet = byProvince[seaId];
			if (!fleet || fleet.action !== "convoy") return false;
			if (fleet.convoyFrom !== order.province || fleet.convoyTo !== order.to) return false;
			if (!resolve(fleet.index)) return false;
			prev = seaId;
		}
		return DiplomacyBoard.isLegalMove(graph, prev, "fleet", order.to);
	}

	function isHeadToHead(order) {
		if (!order || order.action !== "move" || order.viaConvoy || !order.to) return false;
		var other = byProvince[order.to];
		if (!other || other.action !== "move" || other.viaConvoy || other.to !== order.province) return false;
		return directPath(order) && directPath(other);
	}

	function movesInto(province) {
		var found = [];
		for (var n = 0; n < list.length; n++) {
			if (list[n].action === "move" && list[n].to === province) found.push(list[n]);
		}
		return found;
	}

	function supportWanted(order) {
		var target = byProvince[order.supportTarget];
		if (!target) return false;
		if (!order.supportMove) return target.action !== "move";
		return target.action === "move" && target.to === order.supportTo;
	}

	function supportCount(move, skipPower) {
		var count = 0;
		for (var n = 0; n < list.length; n++) {
			var support = list[n];
			if (support.action !== "support" || !support.supportMove) continue;
			if (support.supportTarget !== move.province || support.supportTo !== move.to) continue;
			if (skipPower && support.power === skipPower) continue;
			if (resolve(support.index)) count += 1;
		}
		return count;
	}

	function holdSupportCount(province) {
		var count = 0;
		for (var n = 0; n < list.length; n++) {
			var support = list[n];
			if (support.action !== "support" || support.supportMove) continue;
			if (support.supportTarget !== province) continue;
			if (resolve(support.index)) count += 1;
		}
		return count;
	}

	function attackStrength(order) {
		if (!pathSucceeds(order)) return 0;
		var dest = byProvince[order.to];
		var headToHead = isHeadToHead(order);
		var leaves = dest && dest.action === "move" && resolve(dest.index);
		if (!dest || (!headToHead && leaves)) return 1 + supportCount(order, null);
		if (dest.power === order.power) return 0;
		return 1 + supportCount(order, dest.power);
	}

	function holdStrength(province) {
		var order = byProvince[province];
		if (!order) return 0;
		if (order.action === "move") return resolve(order.index) ? 0 : 1;
		return 1 + holdSupportCount(province);
	}

	function preventStrength(order) {
		if (!pathSucceeds(order)) return 0;
		if (isHeadToHead(order)) {
			var other = byProvince[order.to];
			if (other && resolve(other.index)) return 0;
		}
		return 1 + supportCount(order, null);
	}

	function defendStrength(order) {
		return 1 + supportCount(order, null);
	}

	function adjudicateMove(order) {
		var strength = attackStrength(order);
		if (isHeadToHead(order)) {
			if (strength <= defendStrength(byProvince[order.to])) return false;
		} else if (strength <= holdStrength(order.to)) return false;
		var rivals = movesInto(order.to);
		for (var n = 0; n < rivals.length; n++) {
			if (rivals[n] === order) continue;
			if (strength <= preventStrength(rivals[n])) return false;
		}
		return true;
	}

	function adjudicateSupport(order) {
		if (!supportWanted(order)) return false;
		var attackers = movesInto(order.province);
		var dest = order.supportMove ? order.supportTo : order.supportTarget;
		for (var n = 0; n < attackers.length; n++) {
			var attack = attackers[n];
			if (attack.power === order.power) continue;
			if (attack.province === dest) {
				if (resolve(attack.index)) return false;
				continue;
			}
			if (pathSucceeds(attack)) return false;
		}
		return true;
	}

	function moverSucceeds(order) {
		if (order.state === RESOLVED) return !!order.resolution;
		if (order.state === GUESSING) return !!resolve(order.index);
		return adjudicateMove(order);
	}

	function adjudicateConvoy(order) {
		var attackers = movesInto(order.province);
		for (var n = 0; n < attackers.length; n++) {
			if (moverSucceeds(attackers[n])) return false;
		}
		return true;
	}

	function adjudicate(nr) {
		var order = list[nr];
		if (order.action === "move") return adjudicateMove(order);
		if (order.action === "support") return adjudicateSupport(order);
		if (order.action === "convoy") return adjudicateConvoy(order);
		return true;
	}

	function backup(old) {
		var n;
		var anyConvoy = false;
		var allMoves = true;
		for (n = old; n < nrOfDep; n++) {
			var kind = list[depList[n]].action;
			if (kind === "convoy") anyConvoy = true;
			if (kind !== "move") allMoves = false;
		}
		if (anyConvoy) {
			var where = [];
			for (n = old; n < nrOfDep; n++) {
				var convoy = list[depList[n]];
				if (convoy.action === "convoy") {
					convoy.state = RESOLVED;
					convoy.resolution = false;
					where.push(placeName(convoy.province));
				} else list[depList[n]].state = UNRESOLVED;
			}
			note("Convoy paradox: the convoy in " + where.join(", ") + " is disrupted.");
		} else if (allMoves) {
			for (n = old; n < nrOfDep; n++) {
				list[depList[n]].state = RESOLVED;
				list[depList[n]].resolution = true;
			}
			note("Circular movement succeeds.");
		} else {
			for (n = old; n < nrOfDep; n++) {
				list[depList[n]].state = RESOLVED;
				list[depList[n]].resolution = false;
			}
			note("An unresolved cycle fails.");
		}
		nrOfDep = old;
	}

	function resolve(nr) {
		if (++depth > 8000) {
			depth -= 1;
			throw new Error("Resolution did not settle");
		}
		try {
			return resolveAt(nr);
		} finally {
			depth -= 1;
		}
	}

	function resolveAt(nr) {
		var order = list[nr];
		if (order.state === RESOLVED) return !!order.resolution;
		if (order.action === "hold") {
			order.state = RESOLVED;
			order.resolution = true;
			return true;
		}
		if (order.state === GUESSING) {
			var seen = 0;
			while (seen < nrOfDep) {
				if (depList[seen++] === nr) return !!order.resolution;
			}
			depList[nrOfDep++] = nr;
			return !!order.resolution;
		}
		var old = nrOfDep;
		order.resolution = false;
		order.state = GUESSING;
		var first = !!adjudicate(nr);
		if (nrOfDep === old) {
			if (order.state !== RESOLVED) {
				order.resolution = first;
				order.state = RESOLVED;
			}
			return first;
		}
		if (depList[old] !== nr) {
			depList[nrOfDep++] = nr;
			order.resolution = first;
			return first;
		}
		while (nrOfDep > old) list[depList[--nrOfDep]].state = UNRESOLVED;
		order.resolution = true;
		order.state = GUESSING;
		var second = !!adjudicate(nr);
		if (first === second) {
			while (nrOfDep > old) list[depList[--nrOfDep]].state = UNRESOLVED;
			order.resolution = first;
			order.state = RESOLVED;
			return first;
		}
		backup(old);
		return resolve(nr);
	}

	function summary(order) {
		var dest = order.to ? placeName(order.to) : "";
		if (order.action === "move" && order.dislodged) {
			if (order.viaConvoy && !order.pathOk) return "convoy to " + dest + " is disrupted, and the unit is dislodged";
			return "fails to move to " + dest + " and is dislodged";
		}
		if (order.dislodged) {
			if (order.action === "support" && supportWanted(order) && !order.resolution) return "support is cut and the unit is dislodged";
			if (order.action === "convoy") return "is dislodged and the convoy fails";
			return "is dislodged";
		}
		if (order.action === "hold" || order.illegal) return "holds";
		if (order.action === "move") {
			if (order.resolution) return "moves to " + dest;
			if (order.viaConvoy && !order.pathOk) return "convoy to " + dest + " is disrupted";
			if (!order.pathOk) return "cannot reach " + dest;
			return "bounces";
		}
		if (order.action === "support") {
			if (!supportWanted(order)) return "support is void";
			if (!order.resolution) return "support is cut";
			if (order.supportMove) return "supports " + placeName(order.supportTarget) + " to " + placeName(order.supportTo);
			return "supports " + placeName(order.supportTarget);
		}
		if (order.action === "convoy") {
			var from = placeName(order.convoyFrom);
			var to = placeName(order.convoyTo);
			if (!order.resolution) return "fails to convoy " + from + " to " + to;
			return "convoys " + from + " to " + to;
		}
		return "holds";
	}

	function sentence(order) {
		var kind = order.unit === "fleet" ? "fleet" : "army";
		return powerName(order.power) + " " + kind + " " + placeName(order.province) + " — " + order.summary + ".";
	}
};
