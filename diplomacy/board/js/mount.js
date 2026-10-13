// Interactive board: pan, zoom, place units, and write orders.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.mount = function (host, options) {
	options = options || {};
	if (!host) DiplomacyBoard.fail("mount needs a host element");
	if (!options.graph) DiplomacyBoard.fail("mount needs a graph");

	var graph = options.graph;
	DiplomacyBoard.uniteProvinces(graph);
	var mode = options.mode || "orders";
	var positionTool = options.positionTool || "own";
	var playingAs = options.playingAs || "";
	var orderScope = options.orderScope || "all";
	var position = DiplomacyBoard.emptyPosition(graph.source);
	var orders = [];
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

	function keepOrdersThatMatch() {
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

	function orderFrom(provinceId) {
		for (var i = 0; i < orders.length; i++) {
			if (orders[i].province === provinceId) return orders[i];
		}
		return null;
	}

	function writeOrder(order) {
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
		orders = orders.filter(function (order) {
			return order.province !== provinceId;
		});
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function unitClickable(unit) {
		if (mode !== "orders") return false;
		if (orderScope === "all") return true;
		return !!playingAs && unit.power === playingAs;
	}

	function placePopup() {
		if (popup.hidden || !openProvince || !svg) return;
		var province = DiplomacyBoard.province(graph, openProvince);
		if (!province) return;
		var ctm = svg.getScreenCTM();
		var rect = viewport.getBoundingClientRect();
		if (!ctm) {
			var fallback = pct(province.center);
			popup.style.left = fallback.left;
			popup.style.top = fallback.top;
			return;
		}
		var pt = svg.createSVGPoint();
		pt.x = province.center.x;
		pt.y = province.center.y;
		var screen = pt.matrixTransform(ctm);
		popup.style.left = Math.max(8, Math.min(rect.width - 180, screen.x - rect.left + 18)) + "px";
		popup.style.top = Math.max(8, Math.min(rect.height - 80, screen.y - rect.top + 18)) + "px";
	}

	function pickList() {
		return DiplomacyBoard.orderPickList(graph, position, pending);
	}

	function mapId(id) {
		return DiplomacyBoard.provinceId(graph, id);
	}

	function highlightPicks() {
		var ids = pickList();
		var shapes = [];
		for (var i = 0; i < ids.length; i++) {
			var parts = DiplomacyBoard.shapeIds(graph, ids[i]);
			for (var p = 0; p < parts.length; p++) shapes.push(parts[p]);
		}
		DiplomacyBoard.markPickProvinces(svg, cam, shapes);
	}

	function showPrompt() {
		var text = DiplomacyBoard.orderPrompt(pending);
		prompt.textContent = text;
		prompt.hidden = !text;
	}

	function cancelPending() {
		pending = null;
		host.classList.remove("is-picking");
		showPrompt();
		highlightPicks();
	}

	function startPending(unit, action) {
		pending = { unit: unit, action: action, clicks: [] };
		openProvince = unit.province;
		popup.hidden = true;
		host.classList.add("is-picking");
		showPrompt();
		highlightPicks();
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

	function tryPick(provinceId) {
		if (!pending) return false;
		if (pickList().indexOf(provinceId) === -1) return false;
		pending.clicks.push(provinceId);
		var done = false;
		if (pending.action === "convoy" && pending.unit.unit === "army") {
			var land = DiplomacyBoard.province(graph, provinceId);
			done = !!(land && land.kind !== "sea");
		} else {
			done = pending.clicks.length >= DiplomacyBoard.clicksFor(pending.action, pending.unit);
		}
		if (done) {
			finishPending();
		} else {
			showPrompt();
			highlightPicks();
		}
		return true;
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

	function drawUnits() {
		if (!stage.clientWidth) return;
		var ctx = DiplomacyBoard.syncUnitsCanvas(unitsCanvas, stage);
		DiplomacyBoard.paintUnitsAndOrders(ctx, {
			tokenSize: tokenSize(),
			project: mapToStage,
			graph: graph,
			position: position,
			orders: orders,
			showResolved: showResolved,
			resolution: resolution,
			openProvince: openProvince
		});
	}

	function render() {
		if (destroyed) return;
		if (showResolved) {
			try {
				resolution = DiplomacyBoard.adjudicate(graph, position, orders);
			} catch (error) {
				showResolved = false;
				resolution = null;
				if (typeof options.onError === "function") options.onError(error);
			}
		} else {
			resolution = null;
		}
		host.classList.toggle("is-position", mode === "position");
		host.classList.toggle("is-orders", mode === "orders");
		host.classList.toggle("is-resolved", showResolved);
		paintOwnership();
		highlightPicks();
		drawUnits();
		if (openProvince && !DiplomacyBoard.unitAt(position.units, openProvince) && !pending) closePopup();
	}

	function placeUnit(provinceId, unitType) {
		if (!playingAs) return;
		if (!DiplomacyBoard.powerById(position.powers, playingAs)) return;
		if (!DiplomacyBoard.canPlace(graph, provinceId, unitType)) return;
		position.units = position.units.filter(function (unit) {
			return unit.province !== provinceId;
		});
		position.units.push({
			province: provinceId,
			unit: unitType,
			power: playingAs
		});
		keepOrdersThatMatch();
		render();
		emit();
	}

	function removeUnit(provinceId) {
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

	function chooseUnit(unit) {
		var provinceId = unit.province;
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
		if (skipClick || swallowClick) return;
		if (event.target.closest(".move-popup, .map-zoom, .order-prompt")) return;
		handleMapPointer(event);
	}

	function onPopupClick(event) {
		event.stopPropagation();
		event.preventDefault();
		var button = event.target.closest("button");
		if (!button || !openProvince) return;
		if (button.dataset.clear) {
			clearOrder(openProvince);
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
				if (!destroyed) drawUnits();
			});
			resizeObserver.observe(stage);
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
		for (var i = 0; i < incoming.length; i++) {
			var standing = DiplomacyBoard.unitAt(position.units, incoming[i].province);
			orders.push(DiplomacyBoard.copyOrder(incoming[i], standing));
		}
		cancelPending();
		closePopup();
		render();
		emit();
	}

	function applyDocument(doc) {
		if (!doc || typeof doc !== "object") DiplomacyBoard.fail("Not a Diplomacy document");
		if (doc.kind === "diplomacy-position") applyPosition(doc);
		else if (doc.kind === "diplomacy-orders") applyOrders(doc);
		else if (doc.kind === "diplomacy-board") applyBoard(doc);
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
		exportBoard: function () {
			var pos = api.getPosition();
			pos.kind = "diplomacy-board";
			pos.orders = DiplomacyBoard.clone(orders);
			return pos;
		},
		setPosition: applyPosition,
		setOrders: applyOrders,
		importDocument: applyDocument,
		setMode: function (next) {
			mode = next === "position" ? "position" : "orders";
			if (mode !== "orders") {
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
			if (orderScope === "mine" && openProvince) {
				var standing = DiplomacyBoard.unitAt(position.units, openProvince);
				if (!standing || standing.power !== playingAs) closePopup();
			}
			drawUnits();
		},
		getShowResolved: function () {
			return showResolved;
		},
		setShowResolved: function (on) {
			showResolved = !!on;
			render();
		},
		getResolution: function () {
			return DiplomacyBoard.adjudicate(graph, position, orders);
		},
		setOrderScope: function (scope) {
			orderScope = scope === "mine" ? "mine" : "all";
			if (orderScope === "mine" && openProvince) {
				var standing = DiplomacyBoard.unitAt(position.units, openProvince);
				if (!standing || standing.power !== playingAs) closePopup();
			}
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
			host.classList.remove("diplomacy-board", "is-position", "is-orders", "is-picking", "is-resolved");
		}
	};

	function ready() {
		if (options.position) applyPosition(options.position);
		else render();
		if (options.orders) applyOrders(options.orders);
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
