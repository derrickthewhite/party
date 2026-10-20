const SCRIPT_PATHS = [
	'diplomacy/board/js/board.js',
	'diplomacy/board/js/adjudicate.js',
	'diplomacy/board/js/order-ui.js',
	'diplomacy/board/js/draw.js',
	'diplomacy/board/js/camera.js',
	'diplomacy/board/js/mount.js',
];

export const ASSET_V = String(Date.now());

let boardPromise = null;
const graphCache = new Map();

export function withAssetStamp(url) {
	if (!url) {
		return url;
	}
	const join = String(url).indexOf('?') === -1 ? '?' : '&';
	return url + join + 'v=' + ASSET_V;
}

function loadScript(src) {
	return new Promise(function loadOne(resolve, reject) {
		if (document.querySelector('script[data-diplomacy-src="' + src + '"]')) {
			resolve();
			return;
		}
		const script = document.createElement('script');
		script.src = withAssetStamp(src);
		script.async = false;
		script.dataset.diplomacySrc = src;
		script.onload = function onLoad() {
			resolve();
		};
		script.onerror = function onError() {
			reject(new Error('Unable to load ' + src));
		};
		document.head.appendChild(script);
	});
}

function ensureBoardCss() {
	if (document.querySelector('link[data-diplomacy-board-css]')) {
		return;
	}
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = withAssetStamp('diplomacy/board/css/board.css');
	link.dataset.diplomacyBoardCss = '1';
	document.head.appendChild(link);
}

function fetchJson(url, missingValue) {
	return fetch(withAssetStamp(url), { cache: 'no-store' }).then(function onResponse(response) {
		if (response.status === 404 && missingValue !== undefined) {
			return missingValue;
		}
		if (!response.ok) {
			throw new Error('Unable to load ' + url);
		}
		return response.json();
	}).catch(function onErr(err) {
		if (missingValue !== undefined) {
			return missingValue;
		}
		throw err;
	});
}

export function loadDiplomacyBoard() {
	if (boardPromise) {
		return boardPromise;
	}
	ensureBoardCss();
	boardPromise = SCRIPT_PATHS.reduce(function loadNext(chain, src) {
		return chain.then(function thenLoad() {
			return loadScript(src);
		});
	}, Promise.resolve()).then(function onReady() {
		if (!window.DiplomacyBoard || typeof window.DiplomacyBoard.mount !== 'function') {
			throw new Error('Diplomacy board failed to load.');
		}
		return window.DiplomacyBoard;
	});
	return boardPromise;
}

export async function loadDiplomacyGraph(map) {
	const key = map && map.key ? String(map.key) : '';
	if (!key) {
		throw new Error('Map is missing.');
	}
	const cacheKey = key + ':' + ASSET_V;
	if (graphCache.has(cacheKey)) {
		return graphCache.get(cacheKey);
	}
	const graphUrl = map.graph_url || ('diplomacy/maps/' + key + '/' + key + '.graph.json');
	const unionsUrl = map.unions_url || ('diplomacy/maps/' + key + '/' + key + '.unions.json');
	const tokensUrl = map.tokens_url || ('diplomacy/maps/' + key + '/' + key + '.tokens.json');
	const [graph, unions, tokens] = await Promise.all([
		fetchJson(graphUrl),
		fetchJson(unionsUrl, []),
		fetchJson(tokensUrl, null),
	]);
	graph.unions = Array.isArray(unions) ? unions : [];
	const payload = {
		graph: graph,
		tokenPositions: tokens && tokens.slots ? tokens : null,
	};
	graphCache.set(cacheKey, payload);
	return payload;
}
