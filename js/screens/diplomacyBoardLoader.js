const SCRIPT_PATHS = [
	'diplomacy/board/js/board.js',
	'diplomacy/board/js/adjudicate.js',
	'diplomacy/board/js/order-ui.js',
	'diplomacy/board/js/draw.js',
	'diplomacy/board/js/camera.js',
	'diplomacy/board/js/mount.js',
];

let boardPromise = null;
const graphCache = new Map();

function loadScript(src) {
	return new Promise(function loadOne(resolve, reject) {
		if (document.querySelector('script[data-diplomacy-src="' + src + '"]')) {
			resolve();
			return;
		}
		const script = document.createElement('script');
		script.src = src;
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
	link.href = 'diplomacy/board/css/board.css';
	link.dataset.diplomacyBoardCss = '1';
	document.head.appendChild(link);
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
	if (graphCache.has(key)) {
		return graphCache.get(key);
	}
	const graphUrl = map.graph_url || ('diplomacy/maps/' + key + '/' + key + '.graph.json');
	const unionsUrl = map.unions_url || ('diplomacy/maps/' + key + '/' + key + '.unions.json');
	const [graph, unions] = await Promise.all([
		fetch(graphUrl).then(function onGraph(response) {
			if (!response.ok) {
				throw new Error('Unable to load the map graph.');
			}
			return response.json();
		}),
		fetch(unionsUrl).then(function onUnions(response) {
			if (!response.ok) {
				return [];
			}
			return response.json();
		}).catch(function onUnionsErr() {
			return [];
		}),
	]);
	graph.unions = Array.isArray(unions) ? unions : [];
	graphCache.set(key, graph);
	return graph;
}
