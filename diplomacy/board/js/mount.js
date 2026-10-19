// Interactive board: pan, zoom, place units, and write orders.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.mount = function (host, options) {
	options = options || {};
	if (!host) DiplomacyBoard.fail("mount needs a host element");
	if (!options.graph) DiplomacyBoard.fail("mount needs a graph");

	var graph = options.graph;
	DiplomacyBoard.uniteProvinces(graph);
	var mode = DiplomacyBoard.knownMode(options.mode);
	var positionTool = options.positionTool || "own";
	var playingAs = options.playingAs || "";
	var orderScope = options.orderScope || "all";
	var retreats = Array.isArray(options.retreats) ? options.retreats : [];
	var adjustments = Array.isArray(options.adjustments) ? options.adjustments : [];
	var readOnly = !!options.readOnly;
	var suppliedResolution = null;
	var position = DiplomacyBoard.emptyPosition(graph.source);
	var orders = [];
	var ghostOrders = [];
	var showResolved = false;
	var resolution = null;
	var openProvince = null;
	var pending = null;
	var destroyed = false;
	var svg = null;
	var overlay = null;
	var viewBox = { x: 0, y: 0, w: 1, h: 1 };
	var cam = { x: 0, y: 0, w: 1, h: 1 };
	var originalFill = {};
	var scale = 1;
	var drag = null;
	var skipClick = false;
	var swallowClick = false;
	var resizeObserver = null;

	host.innerHTML = "";
	host.classList.add("diplomacy-board");
	var viewport = document.createElement("div");
	viewport.className = "map-viewport";
	var stage = document.createElement("div");
	stage.className = "map-stage";
	var unitsCanvas = document.createElement("canvas");
	unitsCanvas.className = "units-canvas";
	var popup = document.createElement("div");
	popup.className = "move-popup";
	popup.hidden = true;
	var prompt = document.createElement("div");
	prompt.className = "order-prompt";
	prompt.hidden = true;
	var zoomBar = document.createElement("div");
	zoomBar.className = "map-zoom";
	zoomBar.innerHTML = "<button type=\"button\" data-zoom=\"in\" aria-label=\"Zoom in\">+</button>"
		+ "<button type=\"button\" data-zoom=\"out\" aria-label=\"Zoom out\">−</button>"
		+ "<button type=\"button\" data-zoom=\"reset\" aria-label=\"Reset view\">1:1</button>";
	var caption = document.createElement("div");
	caption.className = "map-caption";
	caption.setAttribute("aria-live", "polite");
	viewport.appendChild(stage);
	viewport.appendChild(zoomBar);
	viewport.appendChild(prompt);
	viewport.appendChild(popup);
	host.appendChild(viewport);
	host.appendChild(caption);

	function emit() {
		if (typeof options.onChange === "function") {
			options.onChange({
				position: api.getPosition(),
				orders: api.getOrders(),
				board: api.exportBoard()
			});
		}
	}

	function viewBoxOf(node) {
		var raw = (node.getAttribute("viewBox") || "0 0 1 1").trim().split(/[\s,]+/);
		return {
			x: Number(raw[0]) || 0,
			y: Number(raw[1]) || 0,
			w: Number(raw[2]) || 1,
			h: Number(raw[3]) || 1
		};
	}

	function pct(point) {
		return {
			left: ((point.x - cam.x) / cam.w) * 100 + "%",
			top: ((point.y - cam.y) / cam.h) * 100 + "%"
		};
	}

	function copyBox(box) {
		return { x: box.x, y: box.y, w: box.w, h: box.h };
	}

	function viewBoxAttr(box) {
		return box.x + " " + box.y + " " + box.w + " " + box.h;
	}

	function rememberFills() {
		originalFill = DiplomacyBoard.captureFills(svg);
	}

	function paintOwnership() {
		DiplomacyBoard.paintOwnership(svg, graph, position, originalFill);
	}

	function orderPhase(next) {
		return next === "retreat" || next === "build" ? next : "move";
	}

	function keepOrdersThatMatch() {
		if (mode === "retreat" || mode === "build") {
			var kept = [];
			var tallies = {};
			for (var k = 0; k < orders.length; k++) {
				if (!phaseOrderAllowed(orders[k])) continue;
				if (mode === "build") {
					var allowance = DiplomacyBoard.findAdjustment(adjustments, orders[k].power);
					var limit = Math.abs(allowance && allowance.count || 0);
					var key = orders[k].power + "\0" + orders[k].action;
					if ((tallies[key] || 0) >= limit) continue;
					tallies[key] = (tallies[key] || 0) + 1;
				}
				kept.push(orders[k]);
			}
			orders = kept;
			return;
		}
		var next = [];
		for (var i = 0; i < orders.length; i++) {
			var standing = DiplomacyBoard.unitAt(position.units, orders[i].province);
			if (!standing) continue;
			var copy = DiplomacyBoard.copyOrder(orders[i], standing);
			if (!DiplomacyBoard.isLegalOrder(graph, position, copy)) continue;
			next.push(copy);
		}
		orders = next;
	}

	function phaseOrderAllowed(order) {
		if (mode === "retreat") {
			var entry = DiplomacyBoard.findRetreat(graph, retreats, order.province);
			if (!entry || order.unit !== entry.unit) return false;
			if (order.action === "disband") return !!entry.disband;
			if (order.action !== "retreat") return false;
			var choices = entry.choices || [];
			var to = DiplomacyBoard.canonProvince(graph, order.to);
			var listed = false;
			for (var i = 0; i < choices.length; i++) {
				if (DiplomacyBoard.canonProvince(graph, choices[i]) === to) listed = true;
			}
			if (!listed) return false;
			var dest = DiplomacyBoard.province(graph, to);
			if (order.unit === "fleet" && DiplomacyBoard.isMultiCoast(dest)) return !!DiplomacyBoard.coastById(dest, order.coast);
			return !order.coast;
		}
		if (mode !== "build") return false;
		var adjustment = DiplomacyBoard.findAdjustment(adjustments, order.power);
		if (!adjustment) return false;
		if (order.action === "build") {
			if (!(adjustment.count > 0)) return false;
			if (DiplomacyBoard.adjustmentBuildsAt(graph, adjustment, order.province).indexOf(order.unit) === -1) return false;
			var buildAt = DiplomacyBoard.province(graph, order.province);
			if (order.unit === "fleet" && DiplomacyBoard.isMultiCoast(buildAt)) return !!DiplomacyBoard.coastById(buildAt, order.coast);
			return !order.coast;
		}
		if (order.action === "disband") return DiplomacyBoard.adjustmentCanDisband(graph, adjustment, order.province);
		return false;
	}

	function orderFrom(provinceId) {
		for (var i = 0; i < orders.length; i++) {
			if (orders[i].province === provinceId) return orders[i];
		}
		return null;
	}

	function writeOrder(order) {
		if (readOnly) return;
		orders = orders.filter(function (item) {
			return item.province !== order.province;
		});
		orders.push(order);
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function clearOrder(provinceId) {
		if (readOnly) return;
		orders = orders.filter(function (order) {
			return order.province !== provinceId;
		});
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function unitClickable(unit) {
		if (readOnly || mode !== "orders") return false;
		if (orderScope === "all") return true;
		return !!playingAs && unit.power === playingAs;
	}

	function retreatClickable(entry) {
		if (readOnly || !entry) return false;
		if (orderScope === "all") return true;
		return !!playingAs && entry.power === playingAs;
	}

	function editableAdjustments() {
		if (orderScope === "mine") {
			var one = DiplomacyBoard.findAdjustment(adjustments, playingAs);
			return one ? [one] : [];
		}
		return adjustments;
	}

	function adjustmentAt(provinceId) {
		var list = editableAdjustments();
		for (var i = 0; i < list.length; i++) {
			var adjustment = list[i];
			if (adjustment.count > 0 && DiplomacyBoard.adjustmentBuildsAt(graph, adjustment, provinceId).length) return adjustment;
			if (DiplomacyBoard.adjustmentCanDisband(graph, adjustment, provinceId)) return adjustment;
		}
		return null;
	}

	function countPhaseOrders(powerId, action, exceptProvince) {
		var n = 0;
		for (var i = 0; i < orders.length; i++) {
			if (phaseOrderKind(orders[i]) !== mode) continue;
		if (orders[i].power !== powerId || orders[i].action !== action) continue;
			if (exceptProvince && orders[i].province === exceptProvince) continue;
			n += 1;
		}
		return n;
	}

	function placePopup() {
		if (popup.hidden) return;
		var rect = viewport.getBoundingClientRect();
		var margin = 8;
		popup.style.left = "0px";
		popup.style.top = "0px";
		popup.style.maxHeight = Math.max(48, rect.height - margin * 2) + "px";
		popup.style.maxWidth = Math.max(120, rect.width - margin * 2) + "px";
		var pop = popup.getBoundingClientRect();
		var left = (rect.width - pop.width) / 2;
		var top = (rect.height - pop.height) / 2;
		if (left < margin) left = margin;
		if (top < margin) top = margin;
		if (left + pop.width > rect.width - margin) left = Math.max(margin, rect.width - margin - pop.width);
		if (top + pop.height > rect.height - margin) top = Math.max(margin, rect.height - margin - pop.height);
		popup.style.left = left + "px";
		popup.style.top = top + "px";
	}

	function pickList() {
		return DiplomacyBoard.orderPickList(graph, position, pending);
	}

	function mapId(id) {
		return DiplomacyBoard.provinceId(graph, id);
	}

	function offeredProvinces() {
		var ids = [];
		var i;
		if (mode === "orders") return pickList();
		if (readOnly) return ids;
		if (mode === "retreat" && openProvince) {
			var entry = DiplomacyBoard.findRetreat(graph, retreats, openProvince);
			if (!retreatClickable(entry)) return ids;
			var choices = entry.choices || [];
			for (i = 0; i < choices.length; i++) ids.push(DiplomacyBoard.canonProvince(graph, choices[i]));
			return ids;
		}
		if (mode === "build") {
			var list = editableAdjustments();
			for (i = 0; i < list.length; i++) {
				var adjustment = list[i];
				var sites = adjustment.count > 0 ? (adjustment.builds || []) : [];
				var d;
				for (d = 0; d < sites.length; d++) ids.push(DiplomacyBoard.canonProvince(graph, sites[d].province));
				if (adjustment.count < 0) {
					var cuts = adjustment.disbands || [];
					for (d = 0; d < cuts.length; d++) ids.push(DiplomacyBoard.canonProvince(graph, cuts[d]));
				}
			}
		}
		return ids;
	}

	function highlightPicks() {
		var ids = offeredProvinces();
		var shapes = [];
		for (var i = 0; i < ids.length; i++) {
			var parts = DiplomacyBoard.shapeIds(graph, ids[i]);
			for (var p = 0; p < parts.length; p++) shapes.push(parts[p]);
		}
		DiplomacyBoard.markPickProvinces(svg, cam, shapes);
	}

	function showPrompt() {
		var text = "";
		if (mode === "orders") text = DiplomacyBoard.orderPrompt(pending);
		else if (!readOnly && mode === "retreat" && openProvince) {
			var retreatEntry = DiplomacyBoard.findRetreat(graph, retreats, openProvince);
			if (retreatEntry) text = retreatEntry.disband ? "Choose a retreat, or disband." : "Choose a retreat.";
		}
		else if (!readOnly && mode === "build") {
			var list = editableAdjustments();
			var parts = [];
			var seen = {};
			for (var i = 0; i < list.length; i++) {
				var line = "";
				if (list[i].count > 0) line = "Choose " + list[i].count + " build" + (list[i].count === 1 ? "" : "s") + ".";
				else if (list[i].count < 0) {
					var n = -list[i].count;
					line = "Choose " + n + " disband" + (n === 1 ? "" : "s") + ".";
				}
				if (line && !seen[line]) {
					seen[line] = true;
					parts.push(line);
				}
			}
			text = parts.join(" ");
		}
		prompt.textContent = text;
		prompt.hidden = !text;
	}

	function cancelPending() {
		pending = null;
		host.classList.remove("is-picking");
		showPrompt();
		highlightPicks();
	}

	function refreshCoastPopup() {
		if (!pending) return;
		var options = DiplomacyBoard.coastOptions(graph, position, pending);
		if (!options.length) {
			if (popup.hidden === false && popup.querySelector("[data-pick-coast]")) {
				popup.hidden = true;
				popup.innerHTML = "";
			}
			return;
		}
		popup.innerHTML = DiplomacyBoard.coastOptionsHtml(graph, pending.unit, options);
		popup.hidden = false;
		placePopup();
	}

	function startPending(unit, action) {
		pending = { unit: unit, action: action, clicks: [] };
		openProvince = unit.province;
		popup.hidden = true;
		popup.innerHTML = "";
		host.classList.add("is-picking");
		showPrompt();
		highlightPicks();
		refreshCoastPopup();
		swallowClick = true;
		setTimeout(function () {
			swallowClick = false;
		}, 0);
	}

	function finishPending() {
		if (!pending) return;
		var draft = DiplomacyBoard.orderDraft(pending);
		if (!DiplomacyBoard.isLegalOrder(graph, position, draft)) return;
		writeOrder(draft);
	}

	function pushPick(provinceId, coastId) {
		pending.clicks.push(coastId ? { province: provinceId, coast: coastId } : provinceId);
		var done = false;
		if (pending.action === "convoy" && pending.unit.unit === "army") {
			var land = DiplomacyBoard.province(graph, provinceId);
			done = !!(land && land.kind !== "sea");
		} else {
			done = pending.clicks.length >= DiplomacyBoard.clicksFor(pending.action, pending.unit);
		}
		if (done) finishPending();
		else {
			showPrompt();
			highlightPicks();
			refreshCoastPopup();
		}
	}

	function coastChoicesFor(provinceId) {
		var options = DiplomacyBoard.coastOptions(graph, position, pending);
		var found = [];
		for (var i = 0; i < options.length; i++) {
			if (options[i].province === provinceId) found.push(options[i]);
		}
		return found;
	}

	function tryPick(provinceId) {
		if (!pending) return false;
		if (pickList().indexOf(provinceId) === -1) return false;
		var action = DiplomacyBoard.normalizeAction(pending.action);
		var choosingDest = pending.clicks.length === 0 && (action === "move" || action === "support-move");
		if (choosingDest) {
			var choices = coastChoicesFor(provinceId);
			if (choices.length > 1) {
				refreshCoastPopup();
				return true;
			}
			if (choices.length === 1) {
				pushPick(provinceId, choices[0].coast);
				return true;
			}
		}
		pushPick(provinceId, "");
		return true;
	}

	function popupStillAllowed() {
		if (!openProvince || orderScope !== "mine") return true;
		if (mode === "retreat") {
			return retreatClickable(DiplomacyBoard.findRetreat(graph, retreats, openProvince));
		}
		if (mode === "build") return !!adjustmentAt(openProvince);
		var standing = DiplomacyBoard.unitAt(position.units, openProvince);
		return !!(standing && standing.power === playingAs);
	}

	function closePopup() {
		openProvince = null;
		popup.hidden = true;
		popup.innerHTML = "";
		drawUnits();
	}

	function showPopup(unit) {
		popup.innerHTML = DiplomacyBoard.orderPopupHtml(graph, unit, orderFrom(unit.province));
		popup.hidden = false;
		openProvince = unit.province;
		placePopup();
		drawUnits();
	}

	function tokenSize() {
		return DiplomacyBoard.tokenSize(stage);
	}

	function hitRadiusMap() {
		return DiplomacyBoard.hitRadiusMap(stage, cam);
	}

	function mapToStage(point) {
		return DiplomacyBoard.mapToStage(stage, cam, point);
	}

	function eventToMap(event) {
		return DiplomacyBoard.eventToMap(svg, event);
	}

	function unitNear(mapPt) {
		return DiplomacyBoard.unitNear(graph, position.units, mapPt, hitRadiusMap());
	}

	function provinceFromEvent(event) {
		return DiplomacyBoard.provinceFromEvent(svg, graph, event);
	}

	function fitStage() {
		var vw = viewport.clientWidth;
		var vh = viewport.clientHeight;
		if (!vw || !vh || !viewBox.w || !viewBox.h) return;
		var aspect = viewBox.w / viewBox.h;
		var stageW = vw;
		var stageH = vw / aspect;
		if (stageH > vh) {
			stageH = vh;
			stageW = vh * aspect;
		}
		var nextW = Math.max(1, Math.round(stageW));
		var nextH = Math.max(1, Math.round(stageH));
		if (stage.style.width === nextW + "px" && stage.style.height === nextH + "px") return;
		stage.style.width = nextW + "px";
		stage.style.height = nextH + "px";
	}

	function drawUnits() {
		fitStage();
		if (!stage.clientWidth) return;
		var ctx = DiplomacyBoard.syncUnitsCanvas(unitsCanvas, stage);
		DiplomacyBoard.paintUnitsAndOrders(ctx, {
			tokenSize: tokenSize(),
			project: mapToStage,
			graph: graph,
			position: position,
			orders: orders,
			ghostOrders: ghostOrders,
			showResolved: showResolved,
			resolution: resolution,
			openProvince: openProvince,
			playingAs: playingAs,
			orderScope: orderScope,
			readOnly: readOnly,
			mode: mode,
			retreats: retreats,
			adjustments: adjustments
		});
	}

	function relayout() {
		if (destroyed) return;
		drawUnits();
		if (!popup.hidden) placePopup();
	}

	function paintPlayerEdge() {
		var markPower = !readOnly && orderScope === "mine" && playingAs ? playingAs : "";
		DiplomacyBoard.markOwnedProvinces(svg, cam, graph, position, markPower);
	}

	function render() {
		if (destroyed) return;
		if (showResolved) {
			if (suppliedResolution) {
				resolution = suppliedResolution;
			} else {
				try {
					resolution = DiplomacyBoard.adjudicate(graph, position, orders);
				} catch (error) {
					showResolved = false;
					resolution = null;
					if (typeof options.onError === "function") options.onError(error);
				}
			}
		} else {
			resolution = null;
		}
		host.classList.toggle("is-position", mode === "position");
		host.classList.toggle("is-orders", mode === "orders");
		host.classList.toggle("is-retreat", mode === "retreat");
		host.classList.toggle("is-build", mode === "build");
		host.classList.toggle("is-readonly", readOnly);
		host.classList.toggle("is-resolved", showResolved);
		paintOwnership();
		paintPlayerEdge();
		showPrompt();
		highlightPicks();
		drawUnits();
		if (mode === "orders" && openProvince && !DiplomacyBoard.unitAt(position.units, openProvince) && !pending) closePopup();
	}

	function showPlaceCoastPopup(provinceId) {
		var province = DiplomacyBoard.province(graph, provinceId);
		var coasts = DiplomacyBoard.coastList(province);
		var html = "<h2>Fleet in " + DiplomacyBoard.esc(province ? province.name : provinceId) + "</h2>";
		html += "<div class=\"move-options\">";
		for (var i = 0; i < coasts.length; i++) {
			html += "<button type=\"button\" data-place-coast=\"" + DiplomacyBoard.esc(coasts[i].id) + "\">";
			html += DiplomacyBoard.esc(DiplomacyBoard.placeLabel(graph, provinceId, coasts[i].id)) + "</button>";
		}
		html += "</div>";
		popup.innerHTML = html;
		popup.hidden = false;
		openProvince = provinceId;
		placePopup();
		drawUnits();
	}

	function placeUnit(provinceId, unitType, coastId) {
		if (readOnly) return;
		if (!playingAs) return;
		if (!DiplomacyBoard.powerById(position.powers, playingAs)) return;
		if (!DiplomacyBoard.canPlace(graph, provinceId, unitType)) return;
		var province = DiplomacyBoard.province(graph, provinceId);
		if (unitType === "fleet" && DiplomacyBoard.isMultiCoast(province) && !coastId) {
			showPlaceCoastPopup(provinceId);
			return;
		}
		position.units = position.units.filter(function (unit) {
			return unit.province !== provinceId;
		});
		var placed = {
			province: provinceId,
			unit: unitType,
			power: playingAs
		};
		if (coastId) placed.coast = coastId;
		position.units.push(placed);
		closePopup();
		keepOrdersThatMatch();
		render();
		emit();
	}

	function removeUnit(provinceId) {
		if (readOnly) return;
		var before = position.units.length;
		position.units = position.units.filter(function (unit) {
			return unit.province !== provinceId;
		});
		if (position.units.length === before) return;
		keepOrdersThatMatch();
		render();
		emit();
	}

	function paintOwner(provinceId, clear) {
		if (readOnly) return;
		var province = DiplomacyBoard.province(graph, provinceId);
		if (!province || province.kind === "sea" || !DiplomacyBoard.isOpen(province)) return;
		if (clear) {
			delete position.ownership[provinceId];
		} else {
			if (!playingAs) return;
			if (!DiplomacyBoard.powerById(position.powers, playingAs)) return;
			position.ownership[provinceId] = playingAs;
		}
		render();
		emit();
	}

	function rememberPhaseOrder(order) {
		order.province = DiplomacyBoard.canonProvince(graph, order.province);
		if (order.to) order.to = DiplomacyBoard.canonProvince(graph, order.to);
		writeOrder(order);
	}

	function withinAdjustmentCount(adjustment, action, provinceId) {
		var limit = adjustment.count > 0 ? adjustment.count : -adjustment.count;
		var kind = adjustment.count > 0 ? "build" : "disband";
		if (action !== kind) return false;
		return countPhaseOrders(adjustment.power, kind, provinceId) < limit;
	}

	function showRetreatPopup(entry) {
		if (!retreatClickable(entry)) return;
		var standing = DiplomacyBoard.unitAt(position.units, DiplomacyBoard.canonProvince(graph, entry.province));
		var view = {
			province: entry.province,
			unit: entry.unit,
			power: entry.power,
			choices: entry.choices,
			disband: entry.disband,
			coast: standing && standing.coast || entry.coast || ""
		};
		popup.innerHTML = DiplomacyBoard.retreatPopupHtml(graph, view, orderFrom(DiplomacyBoard.canonProvince(graph, entry.province)));
		popup.hidden = false;
		openProvince = DiplomacyBoard.canonProvince(graph, entry.province);
		placePopup();
		showPrompt();
		highlightPicks();
		drawUnits();
	}

	function showAdjustPopup(provinceId) {
		var adjustment = adjustmentAt(provinceId);
		if (readOnly || !adjustment) return;
		var id = DiplomacyBoard.canonProvince(graph, provinceId);
		var units = adjustment.count > 0 ? DiplomacyBoard.adjustmentBuildsAt(graph, adjustment, id) : [];
		if (!withinAdjustmentCount(adjustment, "build", id)) units = [];
		var canDisband = DiplomacyBoard.adjustmentCanDisband(graph, adjustment, id) && withinAdjustmentCount(adjustment, "disband", id);
		if (!units.length && !canDisband && !orderFrom(id)) {
			if (openProvince === id) closePopup();
			return;
		}
		popup.innerHTML = DiplomacyBoard.adjustPopupHtml(graph, {
			province: id,
			units: units,
			canDisband: canDisband,
			current: orderFrom(id)
		});
		popup.hidden = false;
		openProvince = id;
		placePopup();
		showPrompt();
		highlightPicks();
		drawUnits();
	}

	function chooseRetreatUnit(unit) {
		var entry = DiplomacyBoard.findRetreat(graph, retreats, unit.province);
		if (!retreatClickable(entry)) return;
		var provinceId = DiplomacyBoard.canonProvince(graph, unit.province);
		if (openProvince === provinceId && popup.hidden === false) {
			closePopup();
			highlightPicks();
			return;
		}
		cancelPending();
		showRetreatPopup(entry);
	}

	function chooseAdjustUnit(unit) {
		if (!adjustmentAt(unit.province)) return;
		var provinceId = DiplomacyBoard.canonProvince(graph, unit.province);
		if (openProvince === provinceId && popup.hidden === false) {
			closePopup();
			highlightPicks();
			return;
		}
		showAdjustPopup(provinceId);
	}

	function chooseUnit(unit) {
		if (readOnly) return;
		var provinceId = unit.province;
		if (mode === "retreat") {
			chooseRetreatUnit(unit);
			return;
		}
		if (mode === "build") {
			chooseAdjustUnit(unit);
			return;
		}
		if (mode === "position") {
			if (positionTool === "remove-unit") removeUnit(provinceId);
			else if (positionTool === "army") placeUnit(provinceId, "army");
			else if (positionTool === "fleet") placeUnit(provinceId, "fleet");
			else if (positionTool === "own") paintOwner(provinceId, false);
			else if (positionTool === "clear-own") paintOwner(provinceId, true);
			return;
		}
		if (pending) {
			if (pending.unit.province === provinceId) {
				cancelPending();
				var again = DiplomacyBoard.unitAt(position.units, provinceId);
				if (again && unitClickable(again)) showPopup(again);
				drawUnits();
				return;
			}
			if (tryPick(provinceId)) return;
		}
		if (!unitClickable(unit)) return;
		if (openProvince === provinceId && popup.hidden === false) {
			closePopup();
			return;
		}
		cancelPending();
		showPopup(unit);
	}

	function chooseProvince(provinceId) {
		if (readOnly) return;
		if (mode === "retreat") {
			var entry = openProvince ? DiplomacyBoard.findRetreat(graph, retreats, openProvince) : null;
			if (!retreatClickable(entry)) {
				closePopup();
				return;
			}
			var choices = entry.choices || [];
			var target = DiplomacyBoard.canonProvince(graph, provinceId);
			for (var i = 0; i < choices.length; i++) {
				if (DiplomacyBoard.canonProvince(graph, choices[i]) === target) {
					var standing = DiplomacyBoard.unitAt(position.units, DiplomacyBoard.canonProvince(graph, entry.province));
					var coasts = entry.unit === "fleet" ? DiplomacyBoard.reachableCoasts(graph, entry.province, standing && standing.coast, target) : [];
					if (entry.unit === "fleet" && DiplomacyBoard.isMultiCoast(DiplomacyBoard.province(graph, target))) {
						if (coasts.length !== 1) return;
					}
					var retreatOrder = {
						province: DiplomacyBoard.canonProvince(graph, entry.province),
						unit: entry.unit,
						power: entry.power,
						action: "retreat",
						to: target
					};
					if (coasts.length === 1) retreatOrder.coast = coasts[0].id;
					rememberPhaseOrder(retreatOrder);
					return;
				}
			}
			closePopup();
			return;
		}
		if (mode === "build") {
			if (adjustmentAt(provinceId)) showAdjustPopup(provinceId);
			else closePopup();
			return;
		}
		if (mode === "orders") {
			if (pending) tryPick(provinceId);
			else closePopup();
			return;
		}
		if (positionTool === "own") paintOwner(provinceId, false);
		else if (positionTool === "clear-own") paintOwner(provinceId, true);
		else if (positionTool === "army") placeUnit(provinceId, "army");
		else if (positionTool === "fleet") placeUnit(provinceId, "fleet");
		else if (positionTool === "remove-unit") removeUnit(provinceId);
	}

	function handleMapPointer(event) {
		var node = provinceFromEvent(event);
		var provinceId = node ? mapId(node.id) : "";
		if (mode === "retreat" && openProvince && provinceId && offeredProvinces().indexOf(provinceId) !== -1) {
			chooseProvince(provinceId);
			return;
		}
		if (pending && provinceId && pickList().indexOf(provinceId) !== -1) {
			chooseProvince(provinceId);
			return;
		}
		var hit = unitNear(eventToMap(event));
		var province = provinceId ? DiplomacyBoard.province(graph, provinceId) : null;
		if (!hit && province && province.parts && province.parts.length > 1) {
			hit = DiplomacyBoard.unitAt(position.units, provinceId);
		}
		if (hit) {
			chooseUnit(hit);
			return;
		}
		if (provinceId) chooseProvince(provinceId);
	}

	function onMapClick(event) {
		if (readOnly || skipClick || swallowClick) return;
		if (event.target.closest(".move-popup, .map-zoom, .order-prompt")) return;
		handleMapPointer(event);
	}

	function onPopupClick(event) {
		event.stopPropagation();
		event.preventDefault();
		if (readOnly) return;
		var button = event.target.closest("button");
		if (!button || !openProvince) return;
		if (button.dataset.clear) {
			clearOrder(openProvince);
			return;
		}
		if (button.dataset.placeCoast) {
			placeUnit(openProvince, "fleet", button.dataset.placeCoast);
			return;
		}
		if (button.dataset.pickCoast && pending) {
			pushPick(button.dataset.province, button.dataset.pickCoast);
			return;
		}
		if (mode === "retreat") {
			var entry = DiplomacyBoard.findRetreat(graph, retreats, openProvince);
			if (!retreatClickable(entry)) return;
			if (button.dataset.retreatTo) {
				var retreatOrder = {
					province: DiplomacyBoard.canonProvince(graph, entry.province),
					unit: entry.unit,
					power: entry.power,
					action: "retreat",
					to: button.dataset.retreatTo
				};
				if (button.dataset.coast) retreatOrder.coast = button.dataset.coast;
				rememberPhaseOrder(retreatOrder);
				return;
			}
			if (button.dataset.action === "disband" && entry.disband) {
				rememberPhaseOrder({
					province: DiplomacyBoard.canonProvince(graph, entry.province),
					unit: entry.unit,
					power: entry.power,
					action: "disband"
				});
			}
			return;
		}
		if (mode === "build") {
			var adjustment = adjustmentAt(openProvince);
			if (!adjustment) return;
			if (button.dataset.buildUnit) {
				if (!withinAdjustmentCount(adjustment, "build", openProvince)) return;
				var offered = DiplomacyBoard.adjustmentBuildsAt(graph, adjustment, openProvince);
				if (offered.indexOf(button.dataset.buildUnit) === -1) return;
				var buildOrder = {
					province: openProvince,
					unit: button.dataset.buildUnit,
					power: adjustment.power,
					action: "build"
				};
				if (button.dataset.coast) buildOrder.coast = button.dataset.coast;
				rememberPhaseOrder(buildOrder);
				return;
			}
			if (button.dataset.action === "disband" && DiplomacyBoard.adjustmentCanDisband(graph, adjustment, openProvince)) {
				if (!withinAdjustmentCount(adjustment, "disband", openProvince)) return;
				rememberPhaseOrder({
					province: openProvince,
					power: adjustment.power,
					action: "disband"
				});
			}
			return;
		}
		var action = button.dataset.action;
		var unit = DiplomacyBoard.unitAt(position.units, openProvince);
		if (!unit || !action) return;
		if (action === "hold") {
			writeOrder({
				province: unit.province,
				unit: unit.unit,
				power: unit.power,
				action: "hold"
			});
			return;
		}
		startPending(unit, action);
		drawUnits();
	}

	function onDocumentClick(event) {
		if (swallowClick) return;
		if (host.contains(event.target)) return;
		if (event.target && !document.contains(event.target)) return;
		cancelPending();
		closePopup();
		highlightPicks();
		drawUnits();
	}

	function onKey(event) {
		if (event.key !== "Escape") return;
		cancelPending();
		closePopup();
		highlightPicks();
		drawUnits();
	}

	function setCaption(event) {
		if (!event || event.target.closest(".map-zoom, .move-popup, .order-prompt")) {
			caption.textContent = "";
			return;
		}
		var node = provinceFromEvent(event);
		var province = node ? DiplomacyBoard.province(graph, node.id) : null;
		caption.textContent = DiplomacyBoard.hoverName(province);
	}

	function ensureAccessPattern() {
		DiplomacyBoard.ensureAccessPattern(svg, viewBox);
	}

	function attachMap() {
		var territories = svg.querySelector("#territories");
		if (territories) territories.setAttribute("pointer-events", "visiblePainted");
		var borders = svg.querySelector("#borders");
		if (borders) borders.setAttribute("pointer-events", "none");
		var dots = svg.querySelector("#dots");
		if (dots) dots.setAttribute("pointer-events", "none");
		rememberFills();
		ensureAccessPattern();
	}

	function installSvg(svgText) {
		// HTML comments may contain --sea-fill; the XML parser will not.
		stage.innerHTML = svgText;
		svg = stage.querySelector("svg");
		if (!svg) DiplomacyBoard.fail("The map SVG did not parse");
		svg.classList.add("map-svg");
		viewBox = viewBoxOf(svg);
		cam = copyBox(viewBox);
		scale = 1;
		overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		overlay.classList.add("orders-svg");
		overlay.setAttribute("viewBox", viewBoxAttr(cam));
		overlay.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") || "xMidYMid meet");
		stage.appendChild(overlay);
		stage.appendChild(unitsCanvas);
		attachMap();
		camera.applyView();
		caption.textContent = "";
		if (resizeObserver) resizeObserver.disconnect();
		if (window.ResizeObserver) {
			resizeObserver = new ResizeObserver(function () {
				if (!destroyed) relayout();
			});
			resizeObserver.observe(viewport);
		}
	}

	function applyPosition(doc) {
		position = {
			kind: "diplomacy-position",
			map: graph.source,
			powers: DiplomacyBoard.clone(doc.powers),
			ownership: DiplomacyBoard.clone(doc.ownership),
			units: DiplomacyBoard.clone(doc.units)
		};
		DiplomacyBoard.canonicalizePosition(graph, position);
		DiplomacyBoard.validatePosition(graph, position);
		keepOrdersThatMatch();
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function applyOrders(doc, expectedPower) {
		var incoming = DiplomacyBoard.clone(doc.orders);
		for (var c = 0; c < incoming.length; c++) DiplomacyBoard.canonicalizeOrder(graph, incoming[c]);
		var snapshot = {
			kind: "diplomacy-position",
			map: graph.source,
			powers: position.powers,
			ownership: position.ownership,
			units: position.units
		};
		DiplomacyBoard.validateOrders(graph, snapshot, {
			kind: doc.kind,
			map: doc.map,
			power: doc.power,
			orders: incoming
		}, expectedPower);
		if (mode === "retreat" || mode === "build") mode = "orders";
		var keepPower = doc.kind === "diplomacy-orders" ? doc.power : null;
		if (keepPower) {
			orders = orders.filter(function (order) {
				return order.power !== keepPower;
			});
		} else {
			orders = [];
		}
		for (var i = 0; i < incoming.length; i++) {
			var standing = DiplomacyBoard.unitAt(position.units, incoming[i].province);
			orders.push(DiplomacyBoard.copyOrder(incoming[i], standing));
		}
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function applyBoard(doc) {
		position = {
			kind: "diplomacy-position",
			map: graph.source,
			powers: DiplomacyBoard.clone(doc.powers),
			ownership: DiplomacyBoard.clone(doc.ownership),
			units: DiplomacyBoard.clone(doc.units)
		};
		DiplomacyBoard.canonicalizePosition(graph, position);
		DiplomacyBoard.validatePosition(graph, position);
		orders = [];
		var incoming = Array.isArray(doc.orders) ? DiplomacyBoard.clone(doc.orders) : [];
		for (var c = 0; c < incoming.length; c++) DiplomacyBoard.canonicalizeOrder(graph, incoming[c]);
		DiplomacyBoard.validateOrders(graph, position, { kind: doc.kind, map: doc.map, power: doc.power, orders: incoming }, doc.power);
		if (mode === "retreat" || mode === "build") mode = "orders";
		for (var i = 0; i < incoming.length; i++) {
			var standing = DiplomacyBoard.unitAt(position.units, incoming[i].province);
			orders.push(DiplomacyBoard.copyOrder(incoming[i], standing));
		}
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function phaseOrderKind(order) {
		if (order.action === "retreat") return "retreat";
		if (order.action === "build") return "build";
		if (order.action === "disband") return order.unit ? "retreat" : "build";
		return "";
	}

	function replacePhaseOrders(powerId, incoming) {
		orders = orders.filter(function (order) {
			if (phaseOrderKind(order) !== mode) return false;
			if (powerId && order.power === powerId) return false;
			return true;
		});
		for (var i = 0; i < incoming.length; i++) orders.push(incoming[i]);
	}

	function applyRetreats(doc, expectedPower) {
		var incoming = DiplomacyBoard.clone(doc.orders || []);
		for (var c = 0; c < incoming.length; c++) DiplomacyBoard.canonicalizeOrder(graph, incoming[c]);
		DiplomacyBoard.validateRetreats(graph, {
			kind: doc.kind,
			map: doc.map,
			power: doc.power,
			orders: incoming
		}, retreats, expectedPower);
		mode = "retreat";
		var stored = [];
		for (var i = 0; i < incoming.length; i++) {
			var entry = DiplomacyBoard.findRetreat(graph, retreats, incoming[i].province);
			var storedOrder = {
				province: DiplomacyBoard.canonProvince(graph, incoming[i].province),
				unit: incoming[i].unit,
				power: entry.power,
				action: incoming[i].action,
				to: incoming[i].action === "retreat" ? DiplomacyBoard.canonProvince(graph, incoming[i].to) : undefined
			};
			if (incoming[i].coast) storedOrder.coast = incoming[i].coast;
			stored.push(storedOrder);
			if (stored[i].action !== "retreat") delete stored[i].to;
		}
		replacePhaseOrders(doc.power || "", stored);
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function applyAdjustments(doc, expectedPower) {
		var incoming = DiplomacyBoard.clone(doc.orders || []);
		for (var c = 0; c < incoming.length; c++) DiplomacyBoard.canonicalizeOrder(graph, incoming[c]);
		DiplomacyBoard.validateAdjustments(graph, {
			kind: doc.kind,
			map: doc.map,
			power: doc.power,
			orders: incoming
		}, adjustments, expectedPower);
		mode = "build";
		var stored = [];
		for (var i = 0; i < incoming.length; i++) {
			var order = {
				province: DiplomacyBoard.canonProvince(graph, incoming[i].province),
				power: doc.power,
				action: incoming[i].action
			};
			if (incoming[i].action === "build") {
				order.unit = incoming[i].unit;
				if (incoming[i].coast) order.coast = incoming[i].coast;
			}
			stored.push(order);
		}
		replacePhaseOrders(doc.power || "", stored);
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function acceptOrders(doc, expectedPower) {
		if (doc && doc.kind === "diplomacy-retreats") applyRetreats(doc, expectedPower);
		else if (doc && doc.kind === "diplomacy-adjustments") applyAdjustments(doc, expectedPower);
		else applyOrders(doc, expectedPower);
	}

	function applyDocument(doc) {
		if (!doc || typeof doc !== "object") DiplomacyBoard.fail("Not a Diplomacy document");
		if (doc.kind === "diplomacy-position") applyPosition(doc);
		else if (doc.kind === "diplomacy-orders") applyOrders(doc);
		else if (doc.kind === "diplomacy-board") applyBoard(doc);
		else if (doc.kind === "diplomacy-retreats") applyRetreats(doc);
		else if (doc.kind === "diplomacy-adjustments") applyAdjustments(doc);
		else DiplomacyBoard.fail("Unknown document kind");
	}

	var camera = {
		viewport: viewport,
		popup: popup,
		get svg() { return svg; },
		get overlay() { return overlay; },
		get viewBox() { return viewBox; },
		get cam() { return cam; },
		set cam(value) { cam = value; },
		get scale() { return scale; },
		set scale(value) { scale = value; },
		get drag() { return drag; },
		set drag(value) { drag = value; },
		get skipClick() { return skipClick; },
		set skipClick(value) { skipClick = value; },
		drawUnits: drawUnits,
		placePopup: placePopup,
		eventToMap: eventToMap,
		setCaption: setCaption,
		unitNear: unitNear,
		viewBoxAttr: viewBoxAttr,
		copyBox: copyBox
	};
	DiplomacyBoard.attachCamera(camera);

	popup.addEventListener("click", onPopupClick);
	document.addEventListener("click", onDocumentClick);
	document.addEventListener("keydown", onKey);
	viewport.addEventListener("wheel", camera.onWheel, { passive: false });
	viewport.addEventListener("pointerdown", camera.onPointerDown);
	viewport.addEventListener("pointermove", camera.onPointerMove);
	viewport.addEventListener("pointerleave", function () {
		caption.textContent = "";
		viewport.style.cursor = "";
	});
	viewport.addEventListener("click", onMapClick);
	window.addEventListener("pointerup", camera.onPointerUp);
	window.addEventListener("pointercancel", camera.onPointerCancel);
	zoomBar.addEventListener("click", camera.onZoomClick);

	var api = {
		getPosition: function () {
			return {
				kind: "diplomacy-position",
				map: graph.source,
				powers: DiplomacyBoard.clone(position.powers),
				ownership: DiplomacyBoard.clone(position.ownership),
				units: DiplomacyBoard.clone(position.units)
			};
		},
		getOrders: function () {
			return DiplomacyBoard.clone(orders);
		},
		exportOrders: function (powerId) {
			if (mode === "retreat") return api.exportRetreats(powerId);
			if (mode === "build") return api.exportAdjustments(powerId);
			var id = powerId || playingAs;
			var list = [];
			for (var i = 0; i < orders.length; i++) {
				if (!id || orders[i].power === id) {
					list.push(DiplomacyBoard.exportableOrder(orders[i]));
				}
			}
			return {
				kind: "diplomacy-orders",
				map: graph.source,
				power: id || "",
				orders: list
			};
		},
		exportRetreats: function (powerId) {
			var id = powerId || playingAs;
			var list = [];
			for (var i = 0; i < orders.length; i++) {
				if (phaseOrderKind(orders[i]) !== "retreat") continue;
				if (id && orders[i].power !== id) continue;
				list.push(DiplomacyBoard.exportRetreatOrder(orders[i]));
			}
			return {
				kind: "diplomacy-retreats",
				map: graph.source,
				power: id || "",
				orders: list
			};
		},
		exportAdjustments: function (powerId) {
			var id = powerId || playingAs;
			var list = [];
			for (var i = 0; i < orders.length; i++) {
				if (phaseOrderKind(orders[i]) !== "build") continue;
				if (id && orders[i].power !== id) continue;
				list.push(DiplomacyBoard.exportAdjustmentOrder(orders[i]));
			}
			return {
				kind: "diplomacy-adjustments",
				map: graph.source,
				power: id || "",
				orders: list
			};
		},
		exportBoard: function () {
			var pos = api.getPosition();
			pos.kind = "diplomacy-board";
			pos.orders = mode === "retreat" || mode === "build" ? [] : DiplomacyBoard.clone(orders);
			return pos;
		},
		setPosition: applyPosition,
		setOrders: acceptOrders,
		importDocument: applyDocument,
		setMode: function (next) {
			var previous = mode;
			mode = DiplomacyBoard.knownMode(next);
			var cleared = orderPhase(previous) !== orderPhase(mode);
			if (cleared) orders = [];
			if (mode !== "orders") {
				cancelPending();
				closePopup();
			}
			render();
			if (cleared) emit();
		},
		setRetreats: function (list) {
			retreats = Array.isArray(list) ? list : [];
			if (mode === "retreat") {
				keepOrdersThatMatch();
				if (openProvince && !retreatClickable(DiplomacyBoard.findRetreat(graph, retreats, openProvince))) closePopup();
			}
			render();
		},
		setAdjustments: function (list) {
			adjustments = Array.isArray(list) ? list : [];
			if (mode === "build") {
				keepOrdersThatMatch();
				if (openProvince && !adjustmentAt(openProvince)) closePopup();
				else if (openProvince) showAdjustPopup(openProvince);
			}
			render();
		},
		setReadOnly: function (on) {
			readOnly = !!on;
			if (readOnly) {
				cancelPending();
				closePopup();
			}
			render();
		},
		setPositionTool: function (next) {
			positionTool = next || "own";
		},
		setPlayingAs: function (id) {
			playingAs = id || "";
			if (!popupStillAllowed()) closePopup();
			if (mode === "retreat" || mode === "build") highlightPicks();
			paintPlayerEdge();
			drawUnits();
		},
		getShowResolved: function () {
			return showResolved;
		},
		setShowResolved: function (on) {
			showResolved = !!on;
			render();
		},
		setResolution: function (result) {
			suppliedResolution = result ? DiplomacyBoard.clone(result) : null;
			if (suppliedResolution) showResolved = true;
			render();
		},
		getResolution: function () {
			if (suppliedResolution) return DiplomacyBoard.clone(suppliedResolution);
			return DiplomacyBoard.adjudicate(graph, position, orders);
		},
		setGhostOrders: function (list) {
			ghostOrders = Array.isArray(list) ? DiplomacyBoard.clone(list) : [];
			for (var i = 0; i < ghostOrders.length; i++) DiplomacyBoard.canonicalizeOrder(graph, ghostOrders[i]);
			drawUnits();
		},
		relayout: relayout,
		setOrderScope: function (scope) {
			orderScope = scope === "mine" ? "mine" : "all";
			if (!popupStillAllowed()) closePopup();
			if (mode === "retreat" || mode === "build") {
				highlightPicks();
				showPrompt();
			}
			paintPlayerEdge();
			drawUnits();
		},
		setPowers: function (powers) {
			position.powers = DiplomacyBoard.clone(powers || []);
			keepOrdersThatMatch();
			render();
			emit();
		},
		graph: graph,
		destroy: function () {
			destroyed = true;
			if (resizeObserver) resizeObserver.disconnect();
			window.removeEventListener("pointerup", camera.onPointerUp);
			window.removeEventListener("pointercancel", camera.onPointerCancel);
			document.removeEventListener("click", onDocumentClick);
			document.removeEventListener("keydown", onKey);
			cancelPending();
			closePopup();
			host.innerHTML = "";
			host.classList.remove("diplomacy-board", "is-position", "is-orders", "is-retreat", "is-build", "is-readonly", "is-picking", "is-resolved");
		}
	};

	function ready() {
		if (options.position) applyPosition(options.position);
		else render();
		if (options.orders) acceptOrders(options.orders);
		if (options.board) applyBoard(options.board);
		if (typeof options.onReady === "function") options.onReady(api);
	}

	if (options.svg) {
		installSvg(options.svg);
		ready();
		return api;
	}
	if (!options.mapUrl) DiplomacyBoard.fail("mount needs svg or mapUrl");
	fetch(options.mapUrl).then(function (response) {
		if (!response.ok) throw new Error("Could not load map");
		return response.text();
	}).then(function (text) {
		if (destroyed) return;
		installSvg(text);
		ready();
	}).catch(function (error) {
		if (typeof options.onError === "function") options.onError(error);
		else throw error;
	});
	return api;
};
