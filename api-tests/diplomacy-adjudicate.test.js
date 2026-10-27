const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { getServerInfo } = require('./support/server-runtime');

function resolvePhpBin(rootDir) {
  const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
  if (process.env.PARTY_PHP_BIN) {
    return process.env.PARTY_PHP_BIN;
  }
  return fs.existsSync(bundledPhp) ? bundledPhp : 'php';
}

function loadBoard(rootDir) {
  const sandbox = { DiplomacyBoard: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  ['board.js', 'adjudicate.js'].forEach(function eachFile(name) {
    const file = path.join(rootDir, 'diplomacy', 'board', 'js', name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  });
  return sandbox.DiplomacyBoard;
}

function loadMap(rootDir, mapKey) {
  const dir = path.join(rootDir, 'diplomacy', 'maps', mapKey);
  const graph = JSON.parse(fs.readFileSync(path.join(dir, `${mapKey}.graph.json`), 'utf8'));
  const unions = JSON.parse(fs.readFileSync(path.join(dir, `${mapKey}.unions.json`), 'utf8'));
  const start = JSON.parse(fs.readFileSync(path.join(dir, `${mapKey}.start.json`), 'utf8'));
  graph.unions = unions;
  return { graph, start };
}

function phpAdjudicate(rootDir, payload) {
  const phpBin = resolvePhpBin(rootDir);
  const result = spawnSync(phpBin, [path.join('api', 'tools', 'diplomacy-adjudicate.php')], {
    cwd: rootDir,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
  }
  return JSON.parse(String(result.stdout || '').trim());
}

test('PHP movement adjudication matches the vendored board for hold, move, and bounce fixtures', () => {
  const { rootDir } = getServerInfo();
  const DiplomacyBoard = loadBoard(rootDir);
  const loaded = loadMap(rootDir, 'EuropeDiploMap');
  DiplomacyBoard.uniteProvinces(loaded.graph);
  const position = DiplomacyBoard.clone(loaded.start);
  DiplomacyBoard.canonicalizePosition(loaded.graph, position);

  const london = position.units.find((unit) => unit.power === 'england' && unit.unit === 'fleet');
  expect(london).toBeTruthy();
  const dests = DiplomacyBoard.legalDestinations(loaded.graph, london.province, 'fleet');
  expect(dests.length).toBeGreaterThan(0);
  const bounceDest = dests[0];
  const otherFleet = position.units.find((unit) => unit.power !== 'england' && unit.unit === 'fleet');
  const otherDests = otherFleet
    ? DiplomacyBoard.legalDestinations(loaded.graph, otherFleet.province, 'fleet')
    : [];
  const shared = dests.find((id) => otherDests.includes(id));

  const fixtures = [
    { name: 'all hold', orders: [] },
    {
      name: 'single legal move',
      orders: [{
        province: london.province,
        unit: london.unit,
        power: london.power,
        action: 'move',
        to: bounceDest,
      }],
    },
  ];

  if (shared && otherFleet) {
    fixtures.push({
      name: 'two fleets bounce',
      orders: [
        {
          province: london.province,
          unit: london.unit,
          power: london.power,
          action: 'move',
          to: shared,
        },
        {
          province: otherFleet.province,
          unit: otherFleet.unit,
          power: otherFleet.power,
          action: 'move',
          to: shared,
        },
      ],
    });
  }

  fixtures.forEach(function eachFixture(fixture) {
    const boardResult = DiplomacyBoard.adjudicate(loaded.graph, position, fixture.orders);
    const phpResult = phpAdjudicate(rootDir, {
      graph: loaded.graph,
      position,
      orders: fixture.orders,
    });
    expect(phpResult.results).toEqual(boardResult.results);
    expect(phpResult.units).toEqual(boardResult.units);
    expect(phpResult.text).toBe(boardResult.text);
  });
});

test('a fleet that moves into St Petersburg keeps a coast', () => {
  const { rootDir } = getServerInfo();
  const DiplomacyBoard = loadBoard(rootDir);
  const loaded = loadMap(rootDir, 'EuropeDiploMap');
  DiplomacyBoard.uniteProvinces(loaded.graph);
  const position = DiplomacyBoard.clone(loaded.start);
  DiplomacyBoard.canonicalizePosition(loaded.graph, position);

  const stp = 'territory-6';
  const barents = 'territory-1';
  const bothnia = 'territory-12';
  position.units = position.units.filter((unit) => unit.province !== barents);
  position.units.push({ province: barents, unit: 'fleet', power: 'england' });

  const russianFleet = position.units.find((unit) => unit.power === 'russia' && unit.province === stp);
  expect(russianFleet).toBeTruthy();
  expect(russianFleet.coast).toBe('sc');

  const orders = [
    {
      province: barents,
      unit: 'fleet',
      power: 'england',
      action: 'move',
      to: stp,
      coast: 'nc',
    },
    {
      province: stp,
      unit: 'fleet',
      power: 'russia',
      action: 'move',
      to: bothnia,
    },
  ];

  const boardResult = DiplomacyBoard.adjudicate(loaded.graph, position, orders);
  const phpResult = phpAdjudicate(rootDir, {
    graph: loaded.graph,
    position,
    orders,
  });
  expect(phpResult.results).toEqual(boardResult.results);
  expect(phpResult.units).toEqual(boardResult.units);

  const englishInStp = phpResult.units.find((unit) => unit.power === 'england' && unit.province === stp);
  expect(englishInStp).toBeTruthy();
  expect(englishInStp.unit).toBe('fleet');
  expect(englishInStp.coast).toBe('nc');
  expect(englishInStp.dislodged).toBe(false);

  const inferred = phpAdjudicate(rootDir, {
    graph: loaded.graph,
    position,
    orders: [
      {
        province: barents,
        unit: 'fleet',
        power: 'england',
        action: 'move',
        to: stp,
      },
      orders[1],
    ],
  });
  const inferredEnglish = inferred.units.find((unit) => unit.power === 'england' && unit.province === stp);
  expect(inferredEnglish && inferredEnglish.coast).toBe('nc');
});
