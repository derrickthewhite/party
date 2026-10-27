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
	var w = stage.clientWidth || 1;
	var h = stage.clientHeight || 1;
	var short = Math.min(w, h);
	return Math.max(22, Math.min(64, short * 0.08));
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
		var at = DiplomacyBoard.unitPoint(graph, unit);
		if (!at) continue;
		var dx = mapPt.x - at.x;
		var dy = mapPt.y - at.y;
		var d = dx * dx + dy * dy;
		if (d <= bestD) {
			bestD = d;
			best = unit;
		}
	}
	return best;
};

DiplomacyBoard.parseHexColor = function (value) {
	var raw = String(value || "").trim();
	if (raw.charAt(0) === "#") raw = raw.slice(1);
	if (raw.length === 3) {
		raw = raw.charAt(0) + raw.charAt(0) + raw.charAt(1) + raw.charAt(1) + raw.charAt(2) + raw.charAt(2);
	}
	if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
	return {
		r: parseInt(raw.slice(0, 2), 16),
		g: parseInt(raw.slice(2, 4), 16),
		b: parseInt(raw.slice(4, 6), 16)
	};
};

DiplomacyBoard.hexColor = function (rgb) {
	function byte(n) {
		var v = Math.max(0, Math.min(255, Math.round(n)));
		return (v < 16 ? "0" : "") + v.toString(16);
	}
	return "#" + byte(rgb.r) + byte(rgb.g) + byte(rgb.b);
};

// ~20% darker on light fills, ~20% lighter on dark fills, so owned borders read.
DiplomacyBoard.contrastStroke = function (hex) {
	var rgb = DiplomacyBoard.parseHexColor(hex);
	if (!rgb) return "#1c1c1c";
	var luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
	var amount = 0.2;
	if (luminance >= 0.55) {
		return DiplomacyBoard.hexColor({
			r: rgb.r * (1 - amount),
			g: rgb.g * (1 - amount),
			b: rgb.b * (1 - amount)
		});
	}
	return DiplomacyBoard.hexColor({
		r: rgb.r + (255 - rgb.r) * amount,
		g: rgb.g + (255 - rgb.g) * amount,
		b: rgb.b + (255 - rgb.b) * amount
	});
};

DiplomacyBoard.ownedPowerIds = function (powerIds) {
	if (Array.isArray(powerIds)) {
		var out = [];
		for (var i = 0; i < powerIds.length; i++) {
			if (powerIds[i]) out.push(String(powerIds[i]));
		}
		return out;
	}
	if (powerIds) return [String(powerIds)];
	return [];
};

DiplomacyBoard.markOwnedProvinces = function (svg, cam, graph, position, powerIds) {
	if (!svg) return;
	var overlay = svg.querySelector("#owned-highlight");
	if (!overlay) {
		var ns = "http://www.w3.org/2000/svg";
		overlay = document.createElementNS(ns, "g");
		overlay.setAttribute("id", "owned-highlight");
		overlay.setAttribute("fill", "none");
		overlay.setAttribute("stroke-linejoin", "round");
		overlay.setAttribute("stroke-linecap", "round");
		overlay.setAttribute("pointer-events", "none");
		var pick = svg.querySelector("#pick-highlight");
		if (pick) svg.insertBefore(overlay, pick);
		else {
			var dots = svg.querySelector("#dots");
			if (dots) svg.insertBefore(overlay, dots);
			else svg.appendChild(overlay);
		}
	}
	while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
	overlay.removeAttribute("stroke");
	var ids = DiplomacyBoard.ownedPowerIds(powerIds);
	if (!ids.length || !position) return;
	var borders = svg.querySelector("#borders");
	var borderWidth = borders ? parseFloat(borders.getAttribute("stroke-width")) : NaN;
	if (!borderWidth || borderWidth !== borderWidth) borderWidth = Math.max(cam.w, cam.h) * 0.0016;
	var span = Math.max(cam.w, cam.h);
	overlay.setAttribute("stroke-width", String(Math.max(borderWidth * 3.2, span * 0.0045)));
	var wanted = {};
	for (var w = 0; w < ids.length; w++) wanted[ids[w]] = true;
	var ns = "http://www.w3.org/2000/svg";
	var nodes = DiplomacyBoard.territoryNodes(svg);
	for (var n = 0; n < nodes.length; n++) {
		var node = nodes[n];
		var province = DiplomacyBoard.province(graph, node.id);
		if (!province || province.kind === "sea") continue;
		if (province.waterParts && province.waterParts.indexOf(node.id) !== -1) continue;
		var id = DiplomacyBoard.provinceId(graph, node.id);
		var ownerId = position.ownership[id];
		if (!wanted[ownerId]) continue;
		var power = DiplomacyBoard.powerById(position.powers || [], ownerId);
		var d = node.getAttribute("d");
		if (!d) continue;
		var outline = document.createElementNS(ns, "path");
		outline.setAttribute("d", d);
		outline.setAttribute("stroke", DiplomacyBoard.contrastStroke(power && power.color));
		overlay.appendChild(outline);
	}
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
	if (canvas.width !== nextW || canvas.height !== nextH) {
		canvas.width = nextW;
		canvas.height = nextH;
	}
	var ctx = canvas.getContext("2d");
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, cssW, cssH);
	return ctx;
};

(function () {
if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
	DiplomacyBoard.unitAssetBase = document.currentScript.src.replace(/\/js\/[^/?#]+(?:[?#].*)?$/, "/assets/");
}
if (!DiplomacyBoard.unitAssetVersion) DiplomacyBoard.unitAssetVersion = String(Date.now());

var fleetArtUrl = "";
var fleetWaiters = [];

function unitAssetRoot(base) {
	var root = base || DiplomacyBoard.unitAssetBase || "assets/";
	if (root.charAt(root.length - 1) !== "/") root += "/";
	return root;
}

function viewBoxOf(svg) {
	var raw = svg.getAttribute("viewBox");
	if (raw) {
		var parts = raw.trim().split(/[\s,]+/);
		if (parts.length === 4) {
			var x = parseFloat(parts[0]);
			var y = parseFloat(parts[1]);
			var w = parseFloat(parts[2]);
			var h = parseFloat(parts[3]);
			if (w > 0 && h > 0) return { x: x, y: y, w: w, h: h };
		}
	}
	var width = parseFloat(svg.getAttribute("width")) || 24;
	var height = parseFloat(svg.getAttribute("height")) || 24;
	return { x: 0, y: 0, w: width, h: height };
}

function pointsToPath(points, close) {
	var nums = points.trim().split(/[\s,]+/);
	var d = "";
	var started = false;
	for (var i = 0; i + 1 < nums.length; i += 2) {
		var x = parseFloat(nums[i]);
		var y = parseFloat(nums[i + 1]);
		if (x !== x || y !== y) continue;
		d += (started ? "L" : "M") + x + " " + y + " ";
		started = true;
	}
	if (close && started) d += "Z";
	return d;
}

function readFleetArt(svgText) {
	if (typeof DOMParser === "undefined" || typeof Path2D === "undefined") return null;
	var doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
	var svg = doc.querySelector("svg");
	if (!svg) return null;
	var box = viewBoxOf(svg);
	var chunks = [];
	var nodes = svg.querySelectorAll("path, polygon, polyline");
	for (var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		if (node.closest && node.closest("defs")) continue;
		if (node.localName === "path") {
			var pathData = node.getAttribute("d");
			if (pathData) chunks.push(pathData);
		} else {
			var points = node.getAttribute("points");
			if (points) chunks.push(pointsToPath(points, node.localName === "polygon"));
		}
	}
	if (!chunks.length) return null;
	var d = chunks.join(" ");
	return {
		path: new Path2D(d),
		samples: sampleFleetPath(d),
		cx: box.x + box.w / 2,
		cy: box.y + box.h / 2,
		w: box.w,
		h: box.h
	};
}

function sampleFleetPath(d) {
	if (typeof document === "undefined" || !document.body) return [];
	var ns = "http://www.w3.org/2000/svg";
	var svg = document.createElementNS(ns, "svg");
	var path = document.createElementNS(ns, "path");
	path.setAttribute("d", d);
	svg.appendChild(path);
	svg.setAttribute("width", "0");
	svg.setAttribute("height", "0");
	svg.style.position = "absolute";
	svg.style.left = "-9999px";
	document.body.appendChild(svg);
	var len = path.getTotalLength();
	var count = Math.max(64, Math.ceil(len * 3));
	var pts = [];
	for (var i = 0; i <= count; i++) {
		var point = path.getPointAtLength((len * i) / count);
		pts.push([point.x, point.y]);
	}
	svg.remove();
	return pts;
}

function finishFleetArt() {
	var waiters = fleetWaiters.splice(0, fleetWaiters.length);
	for (var i = 0; i < waiters.length; i++) waiters[i]();
}

DiplomacyBoard.whenFleetArt = function (fn) {
	if (typeof fn !== "function") return;
	if (DiplomacyBoard.fleetArt) fn();
	else fleetWaiters.push(fn);
};

DiplomacyBoard.loadFleetArt = function (base) {
	if (typeof fetch !== "function") return;
	var version = DiplomacyBoard.unitAssetVersion || String(Date.now());
	var url = unitAssetRoot(base) + "fleet.svg?v=" + encodeURIComponent(version);
	if (url === fleetArtUrl) return;
	fleetArtUrl = url;
	DiplomacyBoard.fleetArt = null;
	fetch(url, { cache: "no-store" }).then(function (response) {
		if (!response.ok) throw new Error("Could not load fleet.svg");
		return response.text();
	}).then(function (text) {
		if (url !== fleetArtUrl) return;
		DiplomacyBoard.fleetArt = readFleetArt(text);
		finishFleetArt();
	}).catch(function () {
		if (url !== fleetArtUrl) return;
	});
};

function fleetMatrix(x, y, r, facing, art) {
	var fx = facing && typeof facing.x === "number" ? facing.x : 0;
	var fy = facing && typeof facing.y === "number" ? facing.y : -1;
	var len = Math.hypot(fx, fy) || 1;
	var ux = fx / len;
	var uy = fy / len;
	var scale = (2 * r) / Math.max(art.w, art.h);
	var matrix = new DOMMatrix();
	matrix.translateSelf(x, y);
	matrix.multiplySelf(new DOMMatrix([-uy, ux, -ux, -uy, 0, 0]));
	matrix.scaleSelf(scale, scale);
	matrix.translateSelf(-art.cx, -art.cy);
	return matrix;
}

function traceFleet(ctx, art, x, y, r, facing) {
	var pts = art.samples || [];
	if (!pts.length) return;
	var scale = (2 * r) / Math.max(art.w, art.h);
	for (var i = 0; i < pts.length; i++) {
		var lx = (pts[i][0] - art.cx) * scale;
		var ly = (pts[i][1] - art.cy) * scale;
		var off = DiplomacyBoard.hullOffset(facing, lx, ly);
		var px = x + off.x;
		var py = y + off.y;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

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

function hullPath(ctx, x, y, r, facing) {
	var art = DiplomacyBoard.fleetArt;
	ctx.beginPath();
	if (!art) return;
	if (art.path && typeof ctx.addPath === "function" && typeof DOMMatrix === "function") {
		ctx.addPath(art.path, fleetMatrix(x, y, r, facing, art));
		return;
	}
	traceFleet(ctx, art, x, y, r, facing);
}

function paintRing(ctx, x, y, radius, color) {
	ctx.save();
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = Math.max(3.5, radius * 0.14);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.strokeStyle = color;
	ctx.lineWidth = Math.max(2.25, radius * 0.09);
	ctx.stroke();
	ctx.restore();
}

function paintBuild(ctx, project, token, center, unit, color, facing) {
	var at = project(center);
	var r = token / 2;
	function outline(width, stroke) {
		if (unit === "fleet") hullPath(ctx, at.x, at.y, r, facing);
		else starPath(ctx, at.x, at.y, r);
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

function orderUnit(position, order) {
	var standing = DiplomacyBoard.unitAt(position.units || [], order.province);
	if (standing) return standing;
	return { province: order.province, unit: order.unit, power: order.power, coast: order.coast };
}

function pointFor(graph, spec) {
	return DiplomacyBoard.unitPoint(graph, spec) || { x: 0, y: 0 };
}

function paintOrders(ctx, view) {
	var project = view.project;
	var token = view.tokenSize;
	var graph = view.graph;
	var position = view.position;
	var orders = view.orders;
	var ghost = !!view.ghost;
	for (var i = 0; i < orders.length; i++) {
		var order = orders[i];
		var here = DiplomacyBoard.province(graph, order.province);
		if (!here) continue;
		var actor = orderUnit(position, order);
		var from = pointFor(graph, actor);
		var power = DiplomacyBoard.powerById(position.powers, order.power || actor.power);
		var color = power ? power.color : "#1c1c1c";
		var action = DiplomacyBoard.normalizeAction(order.action);
		if (action === "hold") {
			paintHold(ctx, project, token, from, color);
			continue;
		}
		if (action === "move") {
			var dest = pointFor(graph, { province: order.to, unit: actor.unit, coast: order.coast });
			if (DiplomacyBoard.province(graph, order.to)) paintArrow(ctx, project, token, from, dest, color, ghost, true);
			continue;
		}
		if (action === "support-defense") {
			var heldUnit = DiplomacyBoard.unitAt(position.units || [], order.target);
			var held = pointFor(graph, heldUnit || { province: order.target, unit: "army" });
			if (DiplomacyBoard.province(graph, order.target)) paintArrow(ctx, project, token, from, held, color, true, true);
			continue;
		}
		if (action === "support-move") {
			var ally = DiplomacyBoard.unitAt(position.units || [], order.target);
			var allyAt = pointFor(graph, ally || { province: order.target, unit: "army" });
			var attackTo = pointFor(graph, { province: order.to, unit: ally && ally.unit || "fleet", coast: order.coast });
			if (DiplomacyBoard.province(graph, order.target) && DiplomacyBoard.province(graph, order.to)) {
				paintArrow(ctx, project, token, from, attackTo, color, true, true, allyAt);
			} else if (DiplomacyBoard.province(graph, order.to)) {
				paintArrow(ctx, project, token, from, attackTo, color, true, true);
			}
			continue;
		}
		if (action === "retreat") {
			var retreatTo = pointFor(graph, { province: order.to, unit: order.unit, coast: order.coast });
			if (DiplomacyBoard.province(graph, order.to)) paintArrow(ctx, project, token, from, retreatTo, color, true, true);
			continue;
		}
		if (action === "disband") {
			paintPendingDisband(ctx, project, token, from, color);
			continue;
		}
		if (action === "build") {
			var buildAt = pointFor(graph, { province: order.province, unit: order.unit, coast: order.coast });
			var facing = order.unit === "fleet" ? DiplomacyBoard.fleetFacing(graph, { province: order.province, unit: "fleet", coast: order.coast }, buildAt) : null;
			paintBuild(ctx, project, token, buildAt, order.unit, color, facing);
			continue;
		}
		if (action === "convoy") {
			var origin = DiplomacyBoard.province(graph, order.from || order.province);
			var landAt = DiplomacyBoard.province(graph, order.to);
			if (order.unit === "fleet") {
				if (origin && landAt) {
					paintArrow(ctx, project, token, origin.center, landAt.center, color, ghost, true);
					paintArrow(ctx, project, token, from, {
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
				paintSnake(ctx, project, token, points, color, ghost, true);
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
			coast: unit.coast,
			dislodged: false
		});
	}
	return list;
}

function playingAsSet(view) {
	if (Array.isArray(view.playingAsPowers) && view.playingAsPowers.length) return view.playingAsPowers;
	if (view.playingAs) return [view.playingAs];
	return [];
}

function controlsPower(view, powerId) {
	var ids = playingAsSet(view);
	return ids.indexOf(powerId) !== -1;
}

function unitNeedsOrder(view, unit) {
	if (view.readOnly || view.orderScope !== "mine" || !controlsPower(view, unit.power)) return false;
	var home = unit.origin || unit.province;
	var orders = view.orders || [];
	var ordered = false;
	for (var i = 0; i < orders.length; i++) {
		if (orders[i].province === home) ordered = true;
	}
	if (ordered) return false;
	if (view.mode === "retreat") {
		var entry = DiplomacyBoard.findRetreat(view.graph, view.retreats || [], home);
		return !!(entry && controlsPower(view, entry.power));
	}
	if (view.mode === "build") {
		var adjustment = DiplomacyBoard.findAdjustment(view.adjustments || [], unit.power);
		return DiplomacyBoard.adjustmentCanDisband(view.graph, adjustment, home);
	}
	return view.mode === "orders";
}

function paintTokens(ctx, view) {
	var r = view.tokenSize / 2;
	var ring = r * 1.6;
	var list = tokensToDraw(view);
	var groups = {};
	var keys = [];
	var i;
	for (i = 0; i < list.length; i++) {
		var atPoint = DiplomacyBoard.unitPoint(view.graph, list[i]);
		if (!atPoint) continue;
		list[i].at = atPoint;
		var key = Math.round(atPoint.x) + "," + Math.round(atPoint.y);
		if (!groups[key]) {
			groups[key] = [];
			keys.push(key);
		}
		groups[key].push(list[i]);
	}
	for (var g = 0; g < keys.length; g++) {
		var group = groups[keys[g]];
		for (i = 0; i < group.length; i++) {
			var unit = group[i];
			var at = view.project(unit.at);
			var dx = group.length === 1 ? 0 : (i - (group.length - 1) / 2) * r * 1.8;
			var x = at.x + dx;
			var y = at.y;
			var power = DiplomacyBoard.powerById(view.position.powers, unit.power);
			var color = power ? power.color : "#1c1c1c";
			var selected = view.openProvince === unit.origin || view.openProvince === unit.province;
			if (!selected && unitNeedsOrder(view, unit)) paintRing(ctx, x, y, ring, color);
			if (unit.unit === "fleet") {
				hullPath(ctx, x, y, r, DiplomacyBoard.fleetFacing(view.graph, unit, unit.at));
			} else {
				starPath(ctx, x, y, r);
			}
			paintToken(ctx, color, selected);
			if (selected) paintRing(ctx, x, y, ring, "#111111");
			if (unit.dislodged) paintDislodged(ctx, x, y, r);
		}
	}
}

DiplomacyBoard.paintTokenSlots = function (ctx, view) {
	if (!view.tokenEdit || !ctx) return;
	var slots = DiplomacyBoard.listTokenSlots(view.graph);
	var r = view.tokenSize / 2;
	for (var i = 0; i < slots.length; i++) {
		var slot = slots[i];
		var at = view.project({ x: slot.x, y: slot.y });
		var selected = view.tokenEditKey === slot.key && view.tokenEditKind === slot.kind;
		ctx.save();
		ctx.beginPath();
		ctx.arc(at.x, at.y, r * 0.95, 0, Math.PI * 2);
		ctx.strokeStyle = selected ? "#111111" : (slot.kind === "fleet" ? "#1c4b73" : "#5a3a1c");
		ctx.lineWidth = selected ? 3 : 2;
		ctx.setLineDash(selected ? [] : [4, 3]);
		ctx.stroke();
		if (slot.kind === "fleet" && slot.facing) {
			var fx = slot.facing.x;
			var fy = slot.facing.y;
			var len = Math.hypot(fx, fy) || 1;
			ctx.beginPath();
			ctx.moveTo(at.x, at.y);
			ctx.lineTo(at.x + (fx / len) * r * 1.6, at.y + (fy / len) * r * 1.6);
			ctx.setLineDash([]);
			ctx.stroke();
		}
		ctx.fillStyle = "#1c1c1c";
		ctx.font = Math.max(9, Math.round(r * 0.42)) + "px Segoe UI, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillText(slot.key + " " + slot.kind, at.x, at.y + r + 2);
		ctx.restore();
	}
};

DiplomacyBoard.paintUnitsAndOrders = function (ctx, view) {
	paintTokens(ctx, view);
	paintOrders(ctx, view);
	if (view.ghostOrders && view.ghostOrders.length) {
		paintOrders(ctx, {
			project: view.project,
			tokenSize: view.tokenSize,
			graph: view.graph,
			position: view.position,
			orders: view.ghostOrders,
			ghost: true
		});
	}
	DiplomacyBoard.paintTokenSlots(ctx, view);
};

if (DiplomacyBoard.unitAssetBase) DiplomacyBoard.loadFleetArt(DiplomacyBoard.unitAssetBase);
})();
