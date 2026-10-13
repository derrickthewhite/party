// Draws ownership, unit tokens, and order arrows on a mounted board.
var DiplomacyBoard = DiplomacyBoard || {};

DiplomacyBoard.territoryNodes = function (svg) {
	if (!svg) return [];
	var group = svg.querySelector("#territories");
	if (!group) return [];
	return group.querySelectorAll("path, polygon, polyline");
};

DiplomacyBoard.captureFills = function (svg) {
	var originalFill = {};
	var nodes = DiplomacyBoard.territoryNodes(svg);
	for (var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		originalFill[node.id] = node.getAttribute("fill") || "";
	}
	return originalFill;
};

DiplomacyBoard.paintOwnership = function (svg, graph, position, originalFill) {
	var nodes = DiplomacyBoard.territoryNodes(svg);
	for (var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		var province = DiplomacyBoard.province(graph, node.id);
		if (!province) continue;
		var waterPart = province.waterParts && province.waterParts.indexOf(node.id) !== -1;
		node.classList.toggle("is-impassable", province.access === "impassable");
		node.classList.toggle("is-unnamed", province.access === "unnamed");
		node.classList.toggle("is-neutral-water", province.access === "neutral-water" || !!waterPart);
		if (province.access === "impassable") {
			node.setAttribute("fill", "url(#diplo-impassable)");
			continue;
		}
		if (waterPart || province.access === "neutral-water") {
			node.setAttribute("fill", DiplomacyBoard.NEUTRAL_WATER_FILL);
			continue;
		}
		if (province.access === "unnamed") {
			node.setAttribute("fill", province.kind === "sea"
				? (originalFill[node.id] || "#b6dcf4")
				: "#c4beb4");
			continue;
		}
		if (province.kind === "sea") {
			if (originalFill[node.id]) node.setAttribute("fill", originalFill[node.id]);
			continue;
		}
		var ownerId = position.ownership[DiplomacyBoard.provinceId(graph, node.id)];
		var owner = ownerId ? DiplomacyBoard.powerById(position.powers, ownerId) : null;
		node.setAttribute("fill", owner ? owner.color : DiplomacyBoard.NEUTRAL_FILL);
	}
};

DiplomacyBoard.ensureAccessPattern = function (svg, viewBox) {
	if (!svg || svg.querySelector("#diplo-impassable")) return;
	var step = Math.max(10, Math.round(viewBox.w / 90));
	var ns = "http://www.w3.org/2000/svg";
	var defs = svg.querySelector("defs");
	if (!defs) {
		defs = document.createElementNS(ns, "defs");
		svg.insertBefore(defs, svg.firstChild);
	}
	var pattern = document.createElementNS(ns, "pattern");
	pattern.setAttribute("id", "diplo-impassable");
	pattern.setAttribute("patternUnits", "userSpaceOnUse");
	pattern.setAttribute("width", String(step));
	pattern.setAttribute("height", String(step));
	var ground = document.createElementNS(ns, "rect");
	ground.setAttribute("width", String(step));
	ground.setAttribute("height", String(step));
	ground.setAttribute("fill", "#d2cbbf");
	var hatch = document.createElementNS(ns, "path");
	hatch.setAttribute("d", "M0 " + step + " L" + step + " 0");
	hatch.setAttribute("stroke", "#6d6458");
	hatch.setAttribute("stroke-width", String(Math.max(1.2, step / 8)));
	pattern.appendChild(ground);
	pattern.appendChild(hatch);
	defs.appendChild(pattern);
};

DiplomacyBoard.pickStrokeWidth = function (svg, cam) {
	var borders = svg.querySelector("#borders");
	var borderWidth = borders ? parseFloat(borders.getAttribute("stroke-width")) : NaN;
	if (!borderWidth || borderWidth !== borderWidth) {
		borderWidth = Math.max(cam.w, cam.h) * 0.0016;
	}
	var span = Math.max(cam.w, cam.h);
	return Math.max(borderWidth * 4.5, span * 0.006);
};

DiplomacyBoard.ensurePickOverlay = function (svg) {
	var overlay = svg.querySelector("#pick-highlight");
	if (overlay) return overlay;
	var ns = "http://www.w3.org/2000/svg";
	overlay = document.createElementNS(ns, "g");
	overlay.setAttribute("id", "pick-highlight");
	overlay.setAttribute("fill", "none");
	overlay.setAttribute("stroke", "#e21818");
	overlay.setAttribute("stroke-linejoin", "round");
	overlay.setAttribute("stroke-linecap", "round");
	overlay.setAttribute("pointer-events", "none");
	var dots = svg.querySelector("#dots");
	if (dots) svg.insertBefore(overlay, dots);
	else svg.appendChild(overlay);
	return overlay;
};

DiplomacyBoard.markPickProvinces = function (svg, cam, ids) {
	if (!svg) return;
	var allowed = {};
	for (var i = 0; i < ids.length; i++) allowed[ids[i]] = true;
	var nodes = DiplomacyBoard.territoryNodes(svg);
	var overlay = DiplomacyBoard.ensurePickOverlay(svg);
	while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
	overlay.setAttribute("stroke-width", String(DiplomacyBoard.pickStrokeWidth(svg, cam)));
	var ns = "http://www.w3.org/2000/svg";
	for (var n = 0; n < nodes.length; n++) {
		var node = nodes[n];
		node.classList.remove("is-pick");
		node.removeAttribute("stroke");
		node.removeAttribute("stroke-width");
		if (!allowed[node.id]) continue;
		var d = node.getAttribute("d");
		if (!d) continue;
		node.classList.add("is-pick");
		var outline = document.createElementNS(ns, "path");
		outline.setAttribute("d", d);
		overlay.appendChild(outline);
	}
};

DiplomacyBoard.tokenSize = function (stage) {
	return Math.max(30, Math.min(39, (stage.clientWidth || 1) * 0.06));
};

DiplomacyBoard.hitRadiusMap = function (stage, cam) {
	var w = stage.clientWidth || 1;
	return (DiplomacyBoard.tokenSize(stage) / w) * cam.w * 1.45;
};

DiplomacyBoard.mapToStage = function (stage, cam, point) {
	return {
		x: ((point.x - cam.x) / cam.w) * (stage.clientWidth || 1),
		y: ((point.y - cam.y) / cam.h) * (stage.clientHeight || 1)
	};
};

DiplomacyBoard.eventToMap = function (svg, event) {
	if (!svg) return null;
	var ctm = svg.getScreenCTM();
	if (!ctm) return null;
	var pt = svg.createSVGPoint();
	pt.x = event.clientX;
	pt.y = event.clientY;
	try {
		var mapped = pt.matrixTransform(ctm.inverse());
		return { x: mapped.x, y: mapped.y };
	} catch (err) {
		return null;
	}
};

DiplomacyBoard.unitNear = function (graph, units, mapPt, radius) {
	if (!mapPt) return null;
	var best = null;
	var bestD = radius * radius;
	for (var i = 0; i < units.length; i++) {
		var unit = units[i];
		var province = DiplomacyBoard.province(graph, unit.province);
		if (!province) continue;
		var dx = mapPt.x - province.center.x;
		var dy = mapPt.y - province.center.y;
		var d = dx * dx + dy * dy;
		if (d <= bestD) {
			bestD = d;
			best = unit;
		}
	}
	return best;
};

DiplomacyBoard.provinceFromEvent = function (svg, graph, event) {
	var stack = document.elementsFromPoint(event.clientX, event.clientY);
	for (var i = 0; i < stack.length; i++) {
		var node = stack[i];
		if (!svg || !svg.contains(node) || !node.id) continue;
		if (DiplomacyBoard.province(graph, node.id)) return node;
	}
	return null;
};

DiplomacyBoard.syncUnitsCanvas = function (canvas, stage) {
	var cssW = stage.clientWidth || 1;
	var cssH = stage.clientHeight || 1;
	var dpr = window.devicePixelRatio || 1;
	var nextW = Math.max(1, Math.round(cssW * dpr));
	var nextH = Math.max(1, Math.round(cssH * dpr));
	if (canvas.width !== nextW) canvas.width = nextW;
	if (canvas.height !== nextH) canvas.height = nextH;
	var ctx = canvas.getContext("2d");
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);
	return ctx;
};

(function () {
function starPath(ctx, x, y, r) {
	var inner = r * 0.38;
	ctx.beginPath();
	for (var i = 0; i < 5; i++) {
		var a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
		var b = a + Math.PI / 5;
		if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
		else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
		ctx.lineTo(x + Math.cos(b) * inner, y + Math.sin(b) * inner);
	}
	ctx.closePath();
}

function paintToken(ctx, color, selected) {
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = selected ? 6 : 4.5;
	ctx.stroke();
	ctx.strokeStyle = "#111111";
	ctx.lineWidth = selected ? 2.8 : 2.2;
	ctx.stroke();
	ctx.fillStyle = color;
	ctx.fill();
}

function paintDislodged(ctx, x, y, r) {
	var arm = r * 0.78;
	ctx.save();
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(x - arm, y - arm);
	ctx.lineTo(x + arm, y + arm);
	ctx.moveTo(x + arm, y - arm);
	ctx.lineTo(x - arm, y + arm);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.strokeStyle = "#9a1c1c";
	ctx.lineWidth = 2.6;
	ctx.stroke();
	ctx.restore();
}

function shiftToward(from, toward, pad) {
	var dx = toward.x - from.x;
	var dy = toward.y - from.y;
	var len = Math.hypot(dx, dy) || 1;
	var d = Math.min(pad, len * 0.22);
	return { x: from.x + (dx / len) * d, y: from.y + (dy / len) * d };
}

function paintArrow(ctx, project, token, from, to, color, dashed, withHead, via) {
	var a = project(from);
	var b = project(to);
	var mid = via ? project(via) : null;
	var pad = token * 0.38;
	var start = shiftToward(a, mid || b, pad);
	var end = shiftToward(b, mid || a, pad);
	var x1 = start.x;
	var y1 = start.y;
	var x2 = end.x;
	var y2 = end.y;
	var cx = mid ? 2 * mid.x - (x1 + x2) / 2 : x1;
	var cy = mid ? 2 * mid.y - (y1 + y2) / 2 : y1;
	var hx = mid ? x2 - cx : x2 - x1;
	var hy = mid ? y2 - cy : y2 - y1;
	var hlen = Math.hypot(hx, hy) || 1;
	var ux = hx / hlen;
	var uy = hy / hlen;
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	function strokeShaft(width, stroke) {
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		if (mid) ctx.quadraticCurveTo(cx, cy, x2, y2);
		else ctx.lineTo(x2, y2);
		ctx.strokeStyle = stroke;
		ctx.lineWidth = width;
		if (dashed) ctx.setLineDash([10, 7]);
		ctx.stroke();
		ctx.setLineDash([]);
	}
	strokeShaft(8, "#ffffff");
	strokeShaft(5.5, "#111111");
	strokeShaft(3, color);
	if (withHead) {
		var head = Math.max(11, Math.min(14, token * 0.38));
		ctx.beginPath();
		ctx.moveTo(x2 + ux * 2, y2 + uy * 2);
		ctx.lineTo(x2 - ux * head - uy * head * 0.58, y2 - uy * head + ux * head * 0.58);
		ctx.lineTo(x2 - ux * head + uy * head * 0.58, y2 - uy * head - ux * head * 0.58);
		ctx.closePath();
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 4;
		ctx.stroke();
		ctx.strokeStyle = "#111111";
		ctx.lineWidth = 2.2;
		ctx.stroke();
		ctx.fillStyle = color;
		ctx.fill();
	}
	ctx.restore();
}

function paintSnake(ctx, project, token, mapPoints, color, dashed, withHead) {
	if (!mapPoints || mapPoints.length < 2) return;
	var pts = [];
	var i;
	for (i = 0; i < mapPoints.length; i++) pts.push(project(mapPoints[i]));
	var pad = token * 0.38;
	pts[0] = shiftToward(pts[0], pts[1], pad);
	pts[pts.length - 1] = shiftToward(pts[pts.length - 1], pts[pts.length - 2], pad);
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	function strokeShaft(width, stroke) {
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
		ctx.strokeStyle = stroke;
		ctx.lineWidth = width;
		if (dashed) ctx.setLineDash([10, 7]);
		ctx.stroke();
		ctx.setLineDash([]);
	}
	strokeShaft(8, "#ffffff");
	strokeShaft(5.5, "#111111");
	strokeShaft(3, color);
	if (withHead) {
		var last = pts[pts.length - 1];
		var prev = pts[pts.length - 2];
		var hx = last.x - prev.x;
		var hy = last.y - prev.y;
		var hlen = Math.hypot(hx, hy) || 1;
		var ux = hx / hlen;
		var uy = hy / hlen;
		var head = Math.max(11, Math.min(14, token * 0.38));
		ctx.beginPath();
		ctx.moveTo(last.x + ux * 2, last.y + uy * 2);
		ctx.lineTo(last.x - ux * head - uy * head * 0.58, last.y - uy * head + ux * head * 0.58);
		ctx.lineTo(last.x - ux * head + uy * head * 0.58, last.y - uy * head - ux * head * 0.58);
		ctx.closePath();
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 4;
		ctx.stroke();
		ctx.strokeStyle = "#111111";
		ctx.lineWidth = 2.2;
		ctx.stroke();
		ctx.fillStyle = color;
		ctx.fill();
	}
	ctx.restore();
}

function paintPendingDisband(ctx, project, token, center, color) {
	var at = project(center);
	var r = token * 0.46;
	ctx.save();
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
	ctx.moveTo(at.x - r * 0.62, at.y - r * 0.62);
	ctx.lineTo(at.x + r * 0.62, at.y + r * 0.62);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
	ctx.moveTo(at.x - r * 0.62, at.y - r * 0.62);
	ctx.lineTo(at.x + r * 0.62, at.y + r * 0.62);
	ctx.strokeStyle = color;
	ctx.lineWidth = 2.6;
	ctx.stroke();
	ctx.restore();
}

function paintBuild(ctx, project, token, center, unit, color) {
	var at = project(center);
	var r = token / 2;
	function outline(width, stroke) {
		if (unit === "fleet") {
			var s = r * 1.55;
			ctx.beginPath();
			ctx.rect(at.x - s / 2, at.y - s / 2, s, s);
		} else {
			starPath(ctx, at.x, at.y, r);
		}
		ctx.setLineDash([5, 4]);
		ctx.strokeStyle = stroke;
		ctx.lineWidth = width;
		ctx.stroke();
		ctx.setLineDash([]);
	}
	ctx.save();
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	outline(5, "#ffffff");
	outline(2.4, color);
	var arm = r * 0.34;
	ctx.beginPath();
	ctx.moveTo(at.x - arm, at.y);
	ctx.lineTo(at.x + arm, at.y);
	ctx.moveTo(at.x, at.y - arm);
	ctx.lineTo(at.x, at.y + arm);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 4;
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(at.x - arm, at.y);
	ctx.lineTo(at.x + arm, at.y);
	ctx.moveTo(at.x, at.y - arm);
	ctx.lineTo(at.x, at.y + arm);
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.restore();
}

function paintHold(ctx, project, token, center, color) {
	var at = project(center);
	ctx.save();
	ctx.beginPath();
	ctx.arc(at.x, at.y, token * 0.72, 0, Math.PI * 2);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 5;
	ctx.stroke();
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.stroke();
	ctx.restore();
}

function paintOrders(ctx, view) {
	var project = view.project;
	var token = view.tokenSize;
	var graph = view.graph;
	var position = view.position;
	var orders = view.orders;
	for (var i = 0; i < orders.length; i++) {
		var order = orders[i];
		var here = DiplomacyBoard.province(graph, order.province);
		if (!here) continue;
		var power = DiplomacyBoard.powerById(position.powers, order.power);
		var color = power ? power.color : "#1c1c1c";
		var action = DiplomacyBoard.normalizeAction(order.action);
		if (action === "hold") {
			paintHold(ctx, project, token, here.center, color);
			continue;
		}
		if (action === "move") {
			var dest = DiplomacyBoard.province(graph, order.to);
			if (dest) paintArrow(ctx, project, token, here.center, dest.center, color, false, true);
			continue;
		}
		if (action === "support-defense") {
			var held = DiplomacyBoard.province(graph, order.target);
			if (held) paintArrow(ctx, project, token, here.center, held.center, color, true, true);
			continue;
		}
		if (action === "support-move") {
			var allyProv = DiplomacyBoard.province(graph, order.target);
			var attackTo = DiplomacyBoard.province(graph, order.to);
			if (allyProv && attackTo) {
				paintArrow(ctx, project, token, here.center, attackTo.center, color, true, true, allyProv.center);
			} else if (attackTo) {
				paintArrow(ctx, project, token, here.center, attackTo.center, color, true, true);
			}
			continue;
		}
		if (action === "retreat") {
			var retreatTo = DiplomacyBoard.province(graph, order.to);
			if (retreatTo) paintArrow(ctx, project, token, here.center, retreatTo.center, color, true, true);
			continue;
		}
		if (action === "disband") {
			paintPendingDisband(ctx, project, token, here.center, color);
			continue;
		}
		if (action === "build") {
			paintBuild(ctx, project, token, here.center, order.unit, color);
			continue;
		}
		if (action === "convoy") {
			var origin = DiplomacyBoard.province(graph, order.from || order.province);
			var landAt = DiplomacyBoard.province(graph, order.to);
			if (order.unit === "fleet") {
				if (origin && landAt) {
					paintArrow(ctx, project, token, origin.center, landAt.center, color, false, true);
					paintArrow(ctx, project, token, here.center, {
						x: (origin.center.x + landAt.center.x) / 2,
						y: (origin.center.y + landAt.center.y) / 2
					}, color, true, true);
				}
			} else if (origin && landAt) {
				var via = Array.isArray(order.via) ? order.via : [];
				var points = [origin.center];
				for (var v = 0; v < via.length; v++) {
					var sea = DiplomacyBoard.province(graph, via[v]);
					if (sea) points.push(sea.center);
				}
				points.push(landAt.center);
				paintSnake(ctx, project, token, points, color, false, true);
			}
		}
	}
}

function tokensToDraw(view) {
	if (view.showResolved && view.resolution && Array.isArray(view.resolution.units)) return view.resolution.units;
	var list = [];
	for (var i = 0; i < view.position.units.length; i++) {
		var unit = view.position.units[i];
		list.push({
			province: unit.province,
			origin: unit.province,
			unit: unit.unit,
			power: unit.power,
			dislodged: false
		});
	}
	return list;
}

function paintTokens(ctx, view) {
	var r = view.tokenSize / 2;
	var list = tokensToDraw(view);
	var groups = {};
	var keys = [];
	var i;
	for (i = 0; i < list.length; i++) {
		var key = list[i].province;
		if (!groups[key]) {
			groups[key] = [];
			keys.push(key);
		}
		groups[key].push(list[i]);
	}
	for (var g = 0; g < keys.length; g++) {
		var group = groups[keys[g]];
		var province = DiplomacyBoard.province(view.graph, keys[g]);
		if (!province) continue;
		var at = view.project(province.center);
		for (i = 0; i < group.length; i++) {
			var unit = group[i];
			var dx = group.length === 1 ? 0 : (i - (group.length - 1) / 2) * r * 1.8;
			var x = at.x + dx;
			var y = at.y;
			var power = DiplomacyBoard.powerById(view.position.powers, unit.power);
			var color = power ? power.color : "#1c1c1c";
			var selected = view.openProvince === unit.origin;
			if (unit.unit === "fleet") {
				var s = r * 1.55;
				ctx.beginPath();
				ctx.rect(x - s / 2, y - s / 2, s, s);
			} else {
				starPath(ctx, x, y, r);
			}
			paintToken(ctx, color, selected);
			if (unit.dislodged) paintDislodged(ctx, x, y, r);
		}
	}
}

DiplomacyBoard.paintUnitsAndOrders = function (ctx, view) {
	paintTokens(ctx, view);
	paintOrders(ctx, view);
};
})();
