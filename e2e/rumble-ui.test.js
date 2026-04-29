const {
  assertNoHorizontalOverflow,
  getContainedOverflowState,
  openAuthenticatedPage,
  reloadPage,
  waitForActiveHeading,
} = require('./support/app-driver');
const {
  createGame,
  createSession,
  endGame,
  endRumbleBidding,
  getGameDetail,
  grantRumbleAbilities,
  joinGame,
  revealActions,
  startGame,
  uniqueLabel,
} = require('./support/game-fixtures');
const { phaseHeadingForGame } = require('./support/surface-expectations');
const { readRumbleSnapshot } = require('./support/surface-snapshots');

describe('rumble presentation coverage', () => {
  test('rumble screen covers bidding, battle, and admin cheat overflow with server-matched player data', async () => {
    const owner = await createSession('rumble-owner', { admin: true });
    const player = await createSession('rumble-player');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-game'));

    await joinGame(player, game.id);
    await startGame(owner, game.id);

    let detail = await getGameDetail(owner, game.id);
    await grantRumbleAbilities(owner, game.id, player.user.id, ['turbo_generator', 'cloaking_field']);
    await grantRumbleAbilities(owner, game.id, owner.user.id, ['loitering_munitions']);
    detail = await getGameDetail(owner, game.id);

    const page = await openAuthenticatedPage(owner, { screen: 'game', game: game.id, admin_ui: 1 }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await assertNoHorizontalOverflow(page);

      let snapshot = await readRumbleSnapshot(page);
      expect(snapshot.subtitle).toContain(`Phase: ${detail.phase}`);
      expect(snapshot.progressText).toBe(
        `Bidding submissions: ${detail.rumble_turn_progress.submitted_count}/${detail.rumble_turn_progress.participant_count}`
      );
      expect(snapshot.bidHelpVisible).toBe(true);
      expect(snapshot.biddingCount).toBe(detail.rumble_turn_progress.offered_abilities.length);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').text).toBe('Submit Bids');
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').text).toBe('End Bidding');
      expect(snapshot.adminCheatToggleVisible).toBe(true);

      await page.click('[data-ref="adminCheatToggleBtn"]');
      snapshot = await readRumbleSnapshot(page);
      expect(snapshot.adminCheatPanelVisible).toBe(true);
      expect(snapshot.adminTargetOptions).toEqual(
        expect.arrayContaining(detail.rumble_turn_progress.players.map((entry) => entry.ship_name || entry.username))
      );
      expect(snapshot.adminAbilityRows).toBe(detail.rumble_turn_progress.ability_catalog.length);

      const overflow = await getContainedOverflowState(page, '[data-ref="adminCheatAbilityList"]');
      expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
      expect(['auto', 'scroll']).toContain(overflow.overflowY);

      await endRumbleBidding(owner, game.id);
      const ownerOrderResponse = await owner.client.post(`/api/games/${game.id}/actions/rumble-order`, {
        json: {
          attacks: {},
          ability_activations: [
            {
              ability_id: 'loitering_munitions',
              target_user_id: player.user.id,
              x_cost: 15,
            },
          ],
        },
      });
      expect(ownerOrderResponse.status).toBe(201);
      const playerOrderResponse = await player.client.post(`/api/games/${game.id}/actions/rumble-order`, {
        json: {
          attacks: {},
          ability_activations: [],
        },
      });
      expect(playerOrderResponse.status).toBe(201);
      await revealActions(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(page, phaseHeadingForGame(detail, 'Rumble'));
      snapshot = await readRumbleSnapshot(page);

      expect(detail.rumble_turn_progress.phase_mode).toBe('battle');
      expect(snapshot.subtitle).toContain(`Phase: ${detail.phase}`);
      expect(snapshot.attackHelpVisible).toBe(true);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').text).toBe('Submit Orders');
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').text).toBe('End Turn');
      expect(snapshot.playerRows.map((entry) => entry.name)).toEqual(
        detail.rumble_turn_progress.players.map((entry) => `${entry.ship_name || entry.username} | Health: ${Math.max(0, Number(entry.health || 0))}`)
      );
      expect(snapshot.playerRows.find((entry) => entry.name.includes(player.user.username) || entry.name.includes(detail.rumble_turn_progress.players.find((item) => item.user_id === player.user.id).ship_name)).abilities).toContain('Turbo Generator');
      const ownerRow = snapshot.playerRows.find((entry) => entry.name.includes(owner.user.username));
      const playerRow = snapshot.playerRows.find((entry) => entry.name.includes(player.user.username));
      expect(ownerRow.conditions).toContain('Loitering Munitions');
      expect(playerRow.conditions).toContain('Loitering Munitions');
    } finally {
      await page.close();
    }
  });

  test('rumble screen covers open-lobby and closed read-only presentation states', async () => {
    const owner = await createSession('rumble-state-owner');
    const player = await createSession('rumble-state-player');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-state-game'));

    await joinGame(player, game.id);

    let detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(owner, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await assertNoHorizontalOverflow(page);

      let snapshot = await readRumbleSnapshot(page);
      expect(snapshot.subtitle).toContain('Status: open');
      expect(snapshot.modeInfo).toBe('Game has not started yet: chat is enabled, game actions are disabled.');
      expect(snapshot.bidHelpVisible).toBe(true);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').visible).toBe(false);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').disabled).toBe(true);
      expect(snapshot.adminCheatToggleVisible).toBe(false);

      await startGame(owner, game.id);
      await endGame(owner, game.id);
      detail = await getGameDetail(owner, game.id);
      await reloadPage(page, phaseHeadingForGame(detail, 'Rumble'));
      snapshot = await readRumbleSnapshot(page);

      expect(snapshot.subtitle).toContain('Status: closed');
      expect(snapshot.modeInfo).toBe('Game has ended. Everything is read-only.');
      expect(snapshot.phaseButtons.find((button) => button.ref === 'submitBtn').visible).toBe(false);
      expect(snapshot.phaseButtons.find((button) => button.ref === 'phaseActionBtn').disabled).toBe(true);
      expect(snapshot.adminCheatToggleVisible).toBe(false);
    } finally {
      await page.close();
    }
  });
  
  async function readActivationCostLabels(page) {
    return page.evaluate(() => {
      const activeScreen = document.querySelector('.screen:not(.hidden)');
      if (!activeScreen) {
        return {};
      }
  
      const rows = Array.from(activeScreen.querySelectorAll('[data-ref="abilityActivationList"] .row.mobile-stack'));
      return rows.reduce((labels, node) => {
        const nameNode = node.querySelector('[data-ref="name"]');
        const labelNode = node.querySelector('[data-ref="toggleLabel"]');
        const name = nameNode ? nameNode.textContent.trim() : '';
        const label = labelNode ? labelNode.textContent.trim() : '';
        if (name) {
          labels[name] = label;
        }
        return labels;
      }, {});
    });
  }

  async function readActivationControls(page) {
    return page.evaluate(() => {
      const activeScreen = document.querySelector('.screen:not(.hidden)');
      if (!activeScreen) {
        return {};
      }

      const rows = Array.from(activeScreen.querySelectorAll('[data-ref="abilityActivationList"] .row.mobile-stack'));
      return rows.reduce((controls, node) => {
        const nameNode = node.querySelector('[data-ref="name"]');
        const toggleNode = node.querySelector('[data-ref="toggleInput"]');
        const targetNode = node.querySelector('[data-ref="targetSelect"]');
        const name = nameNode ? nameNode.textContent.trim() : '';
        if (!name) {
          return controls;
        }

        controls[name] = {
          enabled: !!(toggleNode && toggleNode.checked),
          targetValue: targetNode ? targetNode.value : '',
          targetDisabled: !!(targetNode && targetNode.disabled),
          targetOptions: targetNode
            ? Array.from(targetNode.options).map((option) => ({
                value: option.value,
                label: option.textContent.trim(),
              }))
            : [],
        };
        return controls;
      }, {});
    });
  }

  async function readCombatEnergyText(page) {
    return page.evaluate(() => {
      const activeScreen = document.querySelector('.screen:not(.hidden)');
      if (!activeScreen) {
        return '';
      }

      const energyNode = activeScreen.querySelector('[data-ref="energyText"]');
      return energyNode ? energyNode.textContent.trim() : '';
    });
  }

  async function waitForCurrentOrder(session, gameId, predicate, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    let lastDetail = null;

    while (Date.now() < deadline) {
      lastDetail = await getGameDetail(session, gameId);
      if (predicate(lastDetail)) {
        return lastDetail;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timed out waiting for current order in game ${gameId}`);
  }
  
  test('rumble battle activation labels show normalized ability costs for db-backed abilities', async () => {
    const owner = await createSession('rumble-cost-owner', { admin: true });
    const player = await createSession('rumble-cost-player');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-cost-game'));
  
    await joinGame(player, game.id);
    await startGame(owner, game.id);
    await grantRumbleAbilities(owner, game.id, player.user.id, [
      'cloaking_field',
      'energy_absorption',
      'hyperdrive',
      'nimble_dodge',
      'scheming',
      'shield_capacitors',
    ]);
    await endRumbleBidding(owner, game.id);
  
    const detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(player, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });
  
    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await page.waitForFunction(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        if (!activeScreen) {
          return false;
        }
  
        const labels = Array.from(activeScreen.querySelectorAll('[data-ref="abilityActivationList"] [data-ref="toggleLabel"]'));
        return labels.length >= 6;
      });
  
      const activationLabels = await readActivationCostLabels(page);
      expect(activationLabels).toMatchObject({
        'Cloaking Field': 'Activate (cost: 25)',
        'Energy Absorption': 'Activate (cost: 10)',
        'Hyperdrive': 'Activate (cost: 5)',
        'Nimble Dodge': 'Activate (cost: 10)',
        'Scheming': 'Activate (cost: 10)',
        'Shield Capacitors': 'Activate (cost: 10)',
      });
    } finally {
      await page.close();
    }
  });

  test('rumble enabling a targeted ability auto-selects a valid non-self opponent', async () => {
    const owner = await createSession('rumble-target-owner', { admin: true });
    const player = await createSession('rumble-target-player');
    const other = await createSession('rumble-target-other');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-target-game'));

    await joinGame(player, game.id);
    await joinGame(other, game.id);
    await startGame(owner, game.id);
    await grantRumbleAbilities(owner, game.id, player.user.id, ['focused_defense']);
    await endRumbleBidding(owner, game.id);

    const detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(player, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await page.waitForFunction(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        if (!activeScreen) {
          return false;
        }

        return Array.from(activeScreen.querySelectorAll('[data-ref="abilityActivationList"] [data-ref="name"]'))
          .some((node) => node.textContent.trim() === 'Focused Defense');
      });

      await page.evaluate(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        const rows = Array.from(activeScreen.querySelectorAll('[data-ref="abilityActivationList"] .row.mobile-stack'));
        const row = rows.find((node) => {
          const nameNode = node.querySelector('[data-ref="name"]');
          return nameNode && nameNode.textContent.trim() === 'Focused Defense';
        });
        if (!row) {
          throw new Error('Focused Defense row not found');
        }

        const toggle = row.querySelector('[data-ref="toggleInput"]');
        if (!toggle) {
          throw new Error('Focused Defense toggle not found');
        }

        toggle.click();
      });

      const controls = await readActivationControls(page);
      const focusedDefense = controls['Focused Defense'];
      const validTargetValues = focusedDefense.targetOptions
        .map((option) => option.value)
        .filter((value) => value !== '');

      expect(focusedDefense.enabled).toBe(true);
      expect(focusedDefense.targetDisabled).toBe(false);
      expect(validTargetValues.length).toBeGreaterThan(0);
      expect(validTargetValues).toContain(focusedDefense.targetValue);

      await page.click('[data-ref="submitBtn"]');
      const updatedDetail = await waitForCurrentOrder(player, game.id, (nextDetail) => {
        const currentOrder = nextDetail.rumble_turn_progress && nextDetail.rumble_turn_progress.current_order
          ? nextDetail.rumble_turn_progress.current_order
          : null;
        const activations = currentOrder && Array.isArray(currentOrder.ability_activations)
          ? currentOrder.ability_activations
          : [];
        return activations.some((entry) => entry && entry.ability_id === 'focused_defense');
      });
      const activation = (updatedDetail.rumble_turn_progress && updatedDetail.rumble_turn_progress.current_order && updatedDetail.rumble_turn_progress.current_order.ability_activations || [])[0];
      const expectedTargetIds = updatedDetail.rumble_turn_progress.players
        .filter((entry) => entry.user_id !== player.user.id)
        .filter((entry) => !entry.is_defeated && Number(entry.health || 0) > 0 && entry.is_opponent_targetable !== false)
        .map((entry) => entry.user_id);

      expect(activation).toEqual(expect.objectContaining({
        ability_id: 'focused_defense',
      }));
      expect(expectedTargetIds).toContain(activation.target_user_id);
    } finally {
      await page.close();
    }
  });

  test('rumble live combat energy shows energy absorption bonus on the next round', async () => {
    const owner = await createSession('rumble-energy-owner', { admin: true });
    const player = await createSession('rumble-energy-player');
    const game = await createGame(owner, 'rumble', uniqueLabel('rumble-energy-game'));

    await joinGame(player, game.id);
    await startGame(owner, game.id);
    await grantRumbleAbilities(owner, game.id, player.user.id, ['energy_absorption']);
    await endRumbleBidding(owner, game.id);

    const playerOrderResponse = await player.client.post(`/api/games/${game.id}/actions/rumble-order`, {
      json: {
        attacks: {},
        ability_activations: [
          {
            ability_id: 'energy_absorption',
          },
        ],
      },
    });
    expect(playerOrderResponse.status).toBe(201);

    const ownerOrderResponse = await owner.client.post(`/api/games/${game.id}/actions/rumble-order`, {
      json: {
        attacks: {
          [player.user.id]: 40,
        },
        ability_activations: [],
      },
    });
    expect(ownerOrderResponse.status).toBe(201);

    await revealActions(owner, game.id);

    const detail = await getGameDetail(owner, game.id);
    const page = await openAuthenticatedPage(player, { screen: 'game', game: game.id }, { viewport: { width: 390, height: 900 } });

    try {
      await waitForActiveHeading(page, phaseHeadingForGame(detail, 'Rumble'));
      await page.waitForFunction(() => {
        const activeScreen = document.querySelector('.screen:not(.hidden)');
        if (!activeScreen) {
          return false;
        }

        const energyNode = activeScreen.querySelector('[data-ref="energyText"]');
        return !!energyNode && energyNode.textContent.includes('Energy: 120');
      });

      const energyText = await readCombatEnergyText(page);
      expect(energyText).toContain('Energy: 120');
      expect(energyText).toContain('Remaining: 120');
    } finally {
      await page.close();
    }
  });
});