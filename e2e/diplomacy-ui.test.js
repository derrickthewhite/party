const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getServerInfo } = require('../api-tests/support/server-runtime');
const {
  assertNoHorizontalOverflow,
  openAuthenticatedPage,
  reloadPage,
  waitForActiveHeading,
} = require('./support/app-driver');
const {
  createGame,
  createSession,
  endGame,
  getGameDetail,
  joinGame,
  observeGame,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readDiplomacySnapshot } = require('./support/surface-snapshots');

async function submitEmptyOrders(session, game) {
  const detail = await getGameDetail(session, game.id);
  const power = detail.diplomacy && detail.diplomacy.my_power;
  const map = detail.diplomacy && detail.diplomacy.position && detail.diplomacy.position.map;
  const response = await session.client.post(`/api/games/${game.id}/actions/diplomacy-order`, {
    json: {
      action_type: 'order',
      payload: {
        kind: 'diplomacy-orders',
        map,
        power,
        orders: [],
      },
    },
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
}

async function waitForDiplomacyBoard(page) {
  await page.waitForFunction(() => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const host = activeScreen && activeScreen.querySelector('[data-ref="boardHost"]');
    return !!(host && host.querySelector('.diplomacy-board, svg, canvas'));
  }, { timeout: 15000 });
}

describe('diplomacy presentation coverage', () => {
  test('diplomacy screen reflects setup, then live board progress after start', async () => {
    const owner = await createSession('dip-owner');
    const player = await createSession('dip-player');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-game'));

    await joinGame(player, game.id);

    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
    try {
      let detail = await getGameDetail(owner, game.id);
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await assertNoHorizontalOverflow(ownerPage);

      let snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.setupVisible).toBe(true);
      expect(snapshot.playVisible).toBe(false);

      await startGame(owner, game.id);
      await submitEmptyOrders(owner, game);
      detail = await getGameDetail(player, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await waitForDiplomacyBoard(ownerPage);
      snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.playVisible).toBe(true);
      expect(snapshot.setupVisible).toBe(false);
      expect(snapshot.boardPresent).toBe(true);
      expect(snapshot.historyPrevVisible).toBe(true);
      expect(snapshot.historyNextVisible).toBe(true);
      expect(snapshot.progressText).toContain(`${detail.diplomacy.progress.submitted_count}/${detail.diplomacy.progress.required_count}`);
      expect(snapshot.endTurnVisible).toBe(true);
      expect(snapshot.endTurnDisabled).toBe(false);
    } finally {
      await ownerPage.close();
    }
  });

  test('diplomacy screen covers open-owner, observer, and closed read-only states', async () => {
    const owner = await createSession('dip-state-owner');
    const observer = await createSession('dip-state-observer');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-state-game'));

    await observeGame(observer, game.id);

    let detail = await getGameDetail(owner, game.id);
    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      await assertNoHorizontalOverflow(ownerPage);

      let snapshot = await readDiplomacySnapshot(ownerPage);
      expect(snapshot.subtitle).toContain('Status: open');
      expect(snapshot.modeInfo).toBe('Game has not started yet: chat is enabled, game actions are disabled.');
      expect(snapshot.setupVisible).toBe(true);

      await startGame(owner, game.id);
      const observerDetail = await getGameDetail(observer, game.id);
      const observerPage = await openAuthenticatedPage(observer, { screen: 'game', game: game.id }, { viewport: { width: 1280, height: 900 } });
      try {
        await waitForActiveHeading(observerPage, phaseHeadingForGame(observerDetail, 'Diplomacy'));
        await waitForDiplomacyBoard(observerPage);
        snapshot = await readDiplomacySnapshot(observerPage);
        expect(snapshot.modeInfo).toBe('Observer mode: you can read chat and state, but cannot chat or submit actions.');
        expect(snapshot.playVisible).toBe(true);
        expect(snapshot.boardPresent).toBe(true);
        expect(snapshot.sendDisabled).toBe(true);
        expect(snapshot.endTurnVisible).toBe(false);
      } finally {
        await observerPage.close();
      }

      await endGame(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(detail, 'Diplomacy'));
      snapshot = await readDiplomacySnapshot(ownerPage);

      expect(snapshot.subtitle).toContain('Status: closed');
      expect(snapshot.modeInfo).toBe('Game has ended. Everything is read-only.');
      expect(snapshot.sendDisabled).toBe(true);
      expect(snapshot.endTurnVisible).toBe(false);
    } finally {
      await ownerPage.close();
    }
  });

  test('setup assignment, ready, and board focus stay on the host screen', async () => {
    const owner = await createSession('dip-host-owner');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-host'));
    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
    try {
      const detailBefore = await getGameDetail(owner, game.id);
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(detailBefore, 'Diplomacy'));
      await ownerPage.waitForSelector('[data-ref="timerMinutes"]');
      await ownerPage.select('[data-ref="nationModeSelect"]', 'assign_all');
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const list = active && active.querySelector('[data-ref="assignAllList"]');
        const swatch = list && list.querySelector('.diplomacy-swatch');
        const disorder = list && Array.from(list.querySelectorAll('option')).some((option) => option.textContent === 'Civil disorder');
        return !!(swatch && disorder && swatch.style.backgroundColor && swatch.style.backgroundColor !== 'transparent');
      });
      await assertNoHorizontalOverflow(ownerPage);

      await startGame(owner, game.id);
      const live = await getGameDetail(owner, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(live, 'Diplomacy'));
      await waitForDiplomacyBoard(ownerPage);
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const progress = active && active.querySelector('[data-ref="progressText"]');
        const roster = active && active.querySelector('[data-ref="powersList"]');
        const submit = active && active.querySelector('[data-ref="submitBtn"]');
        return !!(progress && progress.textContent.includes('Ready')
          && roster && roster.textContent.includes('supply center')
          && roster.textContent.includes('No orders')
          && submit && !submit.disabled);
      });

      await ownerPage.click('[data-ref="submitBtn"]');
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const status = active && active.querySelector('[data-ref="status"]');
        const progress = active && active.querySelector('[data-ref="progressText"]');
        const title = active && active.querySelector('[data-ref="phaseTitle"]');
        return !!(status && status.textContent.includes('Orders submitted')
          && progress && progress.textContent.includes('Submitted 1/1')
          && progress.textContent.includes('Ready 0/1')
          && title && title.textContent.includes('Spring orders'));
      });

      await ownerPage.click('[data-ref="readyBtn"]');
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const title = active && active.querySelector('[data-ref="phaseTitle"]');
        return !!(title && title.textContent.includes('Fall orders'));
      });

      await ownerPage.click('[data-ref="focusBtn"]');
      await ownerPage.waitForFunction(() => {
        const layer = document.querySelector('[data-ref="focusLayer"]');
        const host = document.querySelector('[data-ref="boardHost"]');
        return !!(layer && !layer.hidden && host && layer.contains(host) && host.querySelector('svg, canvas'));
      });
      await ownerPage.click('[data-ref="focusCloseBtn"]');
      await ownerPage.waitForFunction(() => {
        const layer = document.querySelector('[data-ref="focusLayer"]');
        const slot = document.querySelector('[data-ref="boardSlot"]');
        const host = document.querySelector('[data-ref="boardHost"]');
        return !!(layer && layer.hidden && slot && host && slot.contains(host));
      });
      await assertNoHorizontalOverflow(ownerPage);
    } finally {
      await ownerPage.close();
    }
  });

  test('a builds phase stays on the board for a nation with nothing to build', async () => {
    const owner = await createSession('dip-build-owner');
    const game = await createGame(owner, 'diplomacy', uniqueLabel('dip-build'));
    const open = await getGameDetail(owner, game.id);
    const ownerId = open.members.find((member) => member.username === owner.credentials.username).id;
    const assignments = {};
    open.diplomacy.powers.forEach((power) => {
      assignments[power.id] = null;
    });
    assignments.england = ownerId;
    assignments.france = ownerId;
    const saved = await owner.client.post(`/api/games/${game.id}/settings`, {
      json: {
        diplomacy_map_key: 'EuropeDiploMap',
        diplomacy_nation_mode: 'assign_all',
        diplomacy_assignments: assignments,
      },
    });
    expect(saved.status).toBe(200);
    await startGame(owner, game.id);

    const { rootDir } = getServerInfo();
    const bundledPhp = path.join(rootDir, 'runtime', 'php', 'windows', 'php.exe');
    const phpBin = process.env.PARTY_PHP_BIN || (fs.existsSync(bundledPhp) ? bundledPhp : 'php');
    const script = [
      'require "api/lib/diplomacy.php";',
      '$gameId = (int)$argv[1];',
      '$loaded = diplomacy_load_map("EuropeDiploMap");',
      '$graph = $loaded["graph"];',
      '$position = $loaded["start"];',
      '$homes = diplomacy_home_centers_from_start($graph, $position);',
      '$removed = false;',
      '$units = [];',
      'foreach ($position["units"] as $unit) {',
      '  if (!$removed && ($unit["power"] ?? "") === "england" && in_array($unit["province"], $homes["england"] ?? [], true)) {',
      '    $removed = true;',
      '    continue;',
      '  }',
      '  $units[] = $unit;',
      '}',
      'if (!$removed) { fwrite(STDERR, "england has no home unit\\n"); exit(1); }',
      '$position["units"] = array_values($units);',
      'diplomacy_write_snapshot($gameId, 1901, "builds", $position, null, null);',
      'db()->prepare("UPDATE game_state SET phase = :phase, current_round = 1901 WHERE game_id = :id")->execute(["phase" => "builds", "id" => $gameId]);',
      'echo "ok";',
    ].join('');
    const result = spawnSync(phpBin, ['-r', script, String(game.id)], {
      cwd: rootDir,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || `php exited ${result.status}`).trim());
    }

    const live = await getGameDetail(owner, game.id);
    const offer = live.diplomacy.adjustments.find((entry) => entry.power === 'england').builds[0];
    const ownerPage = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
    try {
      await waitForActiveHeading(ownerPage, phaseHeadingForGame(live, 'Diplomacy'));
      await waitForDiplomacyBoard(ownerPage);
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const title = active && active.querySelector('[data-ref="phaseTitle"]');
        const submit = active && active.querySelector('[data-ref="submitBtn"]');
        const status = active && active.querySelector('[data-ref="status"]');
        const bad = status && /Unable to load|No adjustment/i.test(status.textContent);
        return !!(title && title.textContent.includes('Builds') && submit && !submit.disabled && !bad);
      });

      await ownerPage.select('[data-ref="activePowerSelect"]', 'france');
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const submit = active && active.querySelector('[data-ref="submitBtn"]');
        const status = active && active.querySelector('[data-ref="status"]');
        const host = active && active.querySelector('[data-ref="boardHost"]');
        const bad = status && /Unable to load|No adjustment/i.test(status.textContent);
        return !!(submit && submit.disabled && host && host.querySelector('svg, canvas') && !bad);
      });

      const accepted = await owner.client.post(`/api/games/${game.id}/actions/diplomacy-order`, {
        json: {
          action_type: 'adjust',
          payload: {
            kind: 'diplomacy-adjustments',
            map: live.diplomacy.position.map,
            power: 'england',
            orders: [{ action: 'build', province: offer.province, unit: offer.unit }],
          },
        },
      });
      expect(accepted.status).toBe(201);
      const ready = await owner.client.post(`/api/games/${game.id}/actions/diplomacy-ready`, {
        json: { ready: true },
      });
      expect(ready.status).toBe(200);

      const advanced = await getGameDetail(owner, game.id);
      await reloadPage(ownerPage, phaseHeadingForGame(advanced, 'Diplomacy'));
      await waitForDiplomacyBoard(ownerPage);
      await ownerPage.waitForFunction(() => {
        const select = document.querySelector('[data-ref="historySelect"]');
        return !!(select && Array.from(select.options).some((option) => option.value === '1901:builds'));
      });
      await ownerPage.select('[data-ref="historySelect"]', '1901:builds');
      await ownerPage.waitForFunction(() => {
        const active = document.querySelector('.screen:not(.hidden)');
        const title = active && active.querySelector('[data-ref="phaseTitle"]');
        const progress = active && active.querySelector('[data-ref="progressText"]');
        const status = active && active.querySelector('[data-ref="status"]');
        const host = active && active.querySelector('[data-ref="boardHost"]');
        const bad = status && /Unable to load|No adjustment/i.test(status.textContent);
        return !!(title && title.textContent.includes('Builds')
          && progress && progress.textContent.includes('Resolved turn')
          && host && host.querySelector('svg, canvas')
          && !bad);
      });
    } finally {
      await ownerPage.close();
    }
  });
});
