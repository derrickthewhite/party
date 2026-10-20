const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mapsRoot = __dirname;
const boardJs = path.join(__dirname, '..', 'board', 'js', 'board.js');
const sandbox = {
	DiplomacyBoard: {},
	console: console,
	Math: Math,
	JSON: JSON,
	Object: Object,
	Array: Array,
	Infinity: Infinity,
	parseInt: parseInt,
	Number: Number,
	String: String,
	Boolean: Boolean,
	Error: Error,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(boardJs, 'utf8'), sandbox, { filename: boardJs });
const DiplomacyBoard = sandbox.DiplomacyBoard;
if (!DiplomacyBoard || typeof DiplomacyBoard.buildTokenPositions !== 'function') {
	throw new Error('Unable to load DiplomacyBoard.buildTokenPositions from ' + boardJs);
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mapDirs() {
	return fs.readdirSync(mapsRoot, { withFileTypes: true })
		.filter(function each(entry) {
			return entry.isDirectory();
		})
		.map(function each(entry) {
			return entry.name;
		});
}

function writeTokens(mapKey) {
	const dir = path.join(mapsRoot, mapKey);
	const graphPath = path.join(dir, mapKey + '.graph.json');
	if (!fs.existsSync(graphPath)) {
		return false;
	}
	const graph = readJson(graphPath);
	const unionsPath = path.join(dir, mapKey + '.unions.json');
	graph.unions = fs.existsSync(unionsPath) ? readJson(unionsPath) : [];
	graph.tokenSlots = {};
	DiplomacyBoard.buildTokenPositions(graph);
	const doc = {
		kind: 'diplomacy-token-positions',
		map: mapKey,
		slots: DiplomacyBoard.clone(graph.tokenSlots),
	};
	const outPath = path.join(dir, mapKey + '.tokens.json');
	fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
	return outPath;
}

const written = [];
mapDirs().forEach(function each(mapKey) {
	const outPath = writeTokens(mapKey);
	if (outPath) {
		written.push(outPath);
	}
});
if (!written.length) {
	throw new Error('No map graphs found under ' + mapsRoot);
}
written.forEach(function each(filePath) {
	console.log(filePath);
});
