// Pan and zoom for a mounted board. State lives on the object mount passes in.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.attachCamera = function (b) {
	b.pointers = {};
	b.pinch = null;
	b.sawPinch = false;
	b.skipToken = 0;

	b.applyView = function () {
		if (!b.svg) return;
		b.svg.setAttribute("viewBox", b.viewBoxAttr(b.cam));
		if (b.overlay) b.overlay.setAttribute("viewBox", b.viewBoxAttr(b.cam));
		b.drawUnits();
		if (!b.popup.hidden) b.placePopup();
	};

	b.resetView = function () {
		b.scale = 1;
		b.cam = b.copyBox(b.viewBox);
		b.applyView();
	};

	b.setScale = function (next, clientX, clientY) {
		next = Math.max(0.5, Math.min(8, next));
		var rect = b.viewport.getBoundingClientRect();
		if (clientX == null) clientX = rect.left + rect.width / 2;
		if (clientY == null) clientY = rect.top + rect.height / 2;
		var focus = b.eventToMap({ clientX: clientX, clientY: clientY });
		var rx = focus ? (focus.x - b.cam.x) / b.cam.w : 0.5;
		var ry = focus ? (focus.y - b.cam.y) / b.cam.h : 0.5;
		b.scale = next;
		b.cam.w = b.viewBox.w / b.scale;
		b.cam.h = b.viewBox.h / b.scale;
		if (focus) {
			b.cam.x = focus.x - rx * b.cam.w;
			b.cam.y = focus.y - ry * b.cam.h;
		}
		b.applyView();
	};

	b.onWheel = function (event) {
		event.preventDefault();
		var factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
		b.setScale(b.scale * factor, event.clientX, event.clientY);
	};

	function pointerList() {
		var out = [];
		for (var id in b.pointers) {
			if (Object.prototype.hasOwnProperty.call(b.pointers, id)) out.push(b.pointers[id]);
		}
		return out;
	}

	function pinchMeasure(pts) {
		var a = pts[0];
		var c = pts[1];
		return {
			dist: Math.hypot(a.x - c.x, a.y - c.y) || 1,
			midX: (a.x + c.x) / 2,
			midY: (a.y + c.y) / 2
		};
	}

	function armSkipClick() {
		b.skipClick = true;
		var token = ++b.skipToken;
		setTimeout(function () {
			if (b.skipToken === token) b.skipClick = false;
		}, 0);
	}

	function capturePointer(id) {
		try {
			b.viewport.setPointerCapture(id);
		} catch (err) {}
	}

	b.onPointerDown = function (event) {
		if (event.button !== 0) return;
		if (event.target.closest(".move-popup, .map-zoom, .order-prompt")) return;
		b.pointers[event.pointerId] = { id: event.pointerId, x: event.clientX, y: event.clientY };
		var pts = pointerList();
		if (pts.length >= 2) {
			b.drag = null;
			b.viewport.classList.remove("is-panning");
			b.pinch = pinchMeasure(pts);
			b.sawPinch = true;
			capturePointer(pts[0].id);
			capturePointer(pts[1].id);
			return;
		}
		b.pinch = null;
		b.drag = {
			x: event.clientX,
			y: event.clientY,
			camX: b.cam.x,
			camY: b.cam.y,
			camW: b.cam.w,
			camH: b.cam.h,
			moved: false,
			pointerId: event.pointerId
		};
	};

	b.onPointerMove = function (event) {
		if (b.pointers[event.pointerId]) {
			b.pointers[event.pointerId].x = event.clientX;
			b.pointers[event.pointerId].y = event.clientY;
		}
		var pts = pointerList();
		if (b.pinch && pts.length >= 2) {
			var next = pinchMeasure(pts);
			var factor = next.dist / (b.pinch.dist || 1);
			var dx = next.midX - b.pinch.midX;
			var dy = next.midY - b.pinch.midY;
			if (b.svg && (dx || dy)) {
				var rect = b.svg.getBoundingClientRect();
				b.cam.x -= dx * (b.cam.w / (rect.width || 1));
				b.cam.y -= dy * (b.cam.h / (rect.height || 1));
			}
			b.pinch = next;
			b.setScale(b.scale * factor, next.midX, next.midY);
			return;
		}
		if (!b.drag) {
			b.setCaption(event);
			if (b.unitNear(b.eventToMap(event))) b.viewport.style.cursor = "pointer";
			else b.viewport.style.cursor = "";
			return;
		}
		var dragDx = event.clientX - b.drag.x;
		var dragDy = event.clientY - b.drag.y;
		if (!b.drag.moved && Math.hypot(dragDx, dragDy) > 12) {
			b.drag.moved = true;
			b.viewport.classList.add("is-panning");
			capturePointer(event.pointerId);
		}
		if (!b.drag.moved || !b.svg) return;
		var dragRect = b.svg.getBoundingClientRect();
		b.cam.x = b.drag.camX - dragDx * (b.drag.camW / (dragRect.width || 1));
		b.cam.y = b.drag.camY - dragDy * (b.drag.camH / (dragRect.height || 1));
		b.applyView();
	};

	b.onPointerUp = function (event) {
		var id = event && event.pointerId;
		if (id != null) delete b.pointers[id];
		var left = pointerList().length;
		if (b.pinch || b.sawPinch) {
			if (left < 2) {
				b.pinch = null;
				b.drag = null;
				b.viewport.classList.remove("is-panning");
			} else {
				b.pinch = pinchMeasure(pointerList());
			}
			if (left === 0) b.sawPinch = false;
			armSkipClick();
			return;
		}
		if (!b.drag) return;
		var moved = b.drag.moved;
		b.drag = null;
		b.viewport.classList.remove("is-panning");
		if (!moved) return;
		armSkipClick();
	};

	b.onPointerCancel = function (event) {
		b.onPointerUp(event);
	};

	b.onZoomClick = function (event) {
		var button = event.target.closest("button");
		if (!button) return;
		event.stopPropagation();
		if (button.dataset.zoom === "in") b.setScale(b.scale * 1.25);
		else if (button.dataset.zoom === "out") b.setScale(b.scale / 1.25);
		else if (button.dataset.zoom === "reset") b.resetView();
	};
};
