// Pan and zoom for a mounted board. State lives on the object mount passes in.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.attachCamera = function (b) {
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
		next = Math.max(1, Math.min(8, next));
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

	b.onPointerDown = function (event) {
		if (event.button !== 0) return;
		if (event.target.closest(".move-popup, .map-zoom, .order-prompt")) return;
		b.drag = {
			x: event.clientX,
			y: event.clientY,
			camX: b.cam.x,
			camY: b.cam.y,
			camW: b.cam.w,
			camH: b.cam.h,
			moved: false
		};
	};

	b.onPointerMove = function (event) {
		if (!b.drag) {
			b.setCaption(event);
			if (b.unitNear(b.eventToMap(event))) b.viewport.style.cursor = "pointer";
			else b.viewport.style.cursor = "";
			return;
		}
		var dx = event.clientX - b.drag.x;
		var dy = event.clientY - b.drag.y;
		if (!b.drag.moved && Math.hypot(dx, dy) > 12) {
			b.drag.moved = true;
			b.viewport.classList.add("is-panning");
			try {
				b.viewport.setPointerCapture(event.pointerId);
			} catch (err) {}
		}
		if (!b.drag.moved || !b.svg) return;
		var rect = b.svg.getBoundingClientRect();
		b.cam.x = b.drag.camX - dx * (b.drag.camW / (rect.width || 1));
		b.cam.y = b.drag.camY - dy * (b.drag.camH / (rect.height || 1));
		b.applyView();
	};

	b.onPointerUp = function () {
		if (!b.drag) return;
		var moved = b.drag.moved;
		b.drag = null;
		b.viewport.classList.remove("is-panning");
		if (!moved) return;
		b.skipClick = true;
		setTimeout(function () {
			b.skipClick = false;
		}, 0);
	};

	b.onPointerCancel = function () {
		b.drag = null;
		b.viewport.classList.remove("is-panning");
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
