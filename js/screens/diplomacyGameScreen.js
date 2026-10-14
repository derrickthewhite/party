import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';
import { createGameActionButtonMarkup, setGameActionButtonLabel } from './gameActionButtons.js';
import { loadDiplomacyBoard, loadDiplomacyGraph } from './diplomacyBoardLoader.js';

function phaseKey(year, phase) {
	return String(year || '') + ':' + String(phase || '');
}

function actionTypeForMode(mode) {
	if (mode === 'retreat') {
		return 'retreat';
	}
	if (mode === 'build') {
		return 'adjust';
	}
	return 'order';
}

export function createDiplomacyGameScreen(deps) {
	const panel = createNodeFromHtml(`
		<div class="card diplomacy-panel">
			<div class="card diplomacy-setup-card" data-ref="setupCard">
				<div class="row">
					<h3>Diplomacy Setup</h3>
					<div data-ref="setupSpacer"></div>
					${createGameActionButtonMarkup('refresh', 'refreshSetupBtn', '')}
				</div>
				<div class="row mobile-stack">
					<label>Map
						<select data-ref="mapSelect"></select>
					</label>
					<label>Nation assignment
						<select data-ref="nationModeSelect">
							<option value="pick">Players pick</option>
							<option value="random">Random</option>
						</select>
					</label>
					<button data-ref="saveSetupBtn">Save setup</button>
				</div>
				<div class="row mobile-stack" data-ref="nationPickRow">
					<label>Your nation
						<select data-ref="nationSelect"></select>
					</label>
					<button data-ref="saveNationBtn">Save nation</button>
				</div>
				<p class="top-user-label" data-ref="setupNote"></p>
				<div class="list" data-ref="claimsList"></div>
			</div>
			<div class="card diplomacy-play-card" data-ref="playCard">
				<div class="row">
					<h3 data-ref="phaseTitle">Diplomacy</h3>
					<div data-ref="playSpacer"></div>
					${createGameActionButtonMarkup('refresh', 'refreshPlayBtn', '')}
				</div>
				<p class="top-user-label" data-ref="progressText">Orders submitted: 0/0</p>
				<p data-ref="powerText"></p>
				<div class="row mobile-stack">
					<div class="diplomacy-turn-nav" data-ref="turnNav">
						<span class="diplomacy-turn-nav-caption">History</span>
						<div class="diplomacy-turn-nav-controls">
							<button type="button" class="diplomacy-turn-nav-btn" data-ref="historyPrevBtn" title="Previous turn" aria-label="Previous turn">
								<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
									<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"></path>
								</svg>
							</button>
							<select data-ref="historySelect">
								<option value="live">Live board</option>
							</select>
							<button type="button" class="diplomacy-turn-nav-btn" data-ref="historyNextBtn" title="Next turn" aria-label="Next turn">
								<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
									<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
								</svg>
							</button>
						</div>
					</div>
					<button class="primary" data-ref="submitBtn">Submit orders</button>
					<button data-ref="endTurnBtn">End turn</button>
				</div>
				<div class="diplomacy-board-host" data-ref="boardHost"></div>
				<pre class="diplomacy-resolution" data-ref="resolutionText"></pre>
			</div>
		</div>
	`);
	const refs = collectRefs(panel);
	const claimTemplate = createTemplate(`
		<div class="message-item">
			<small data-ref="meta"></small>
			<div data-ref="text"></div>
		</div>
	`);

	refs.setupSpacer.style.flex = '1';
	refs.playSpacer.style.flex = '1';

	const serverSnapshot = {
		status: 'open',
		permissions: {},
		diplomacy: null,
	};
	const localDraft = {
		dirty: false,
		doc: null,
		phaseKey: '',
	};

	const claimRowsById = new Map();

	let lastGameId = null;
	let setStatusNode = function noop() {};
	let refreshBusy = false;
	let autoRefreshId = null;
	let boardApi = null;
	let boardMapKey = '';
	let applyingBoard = false;
	let historyView = 'live';
	let historyBusy = false;
	let mountPromise = null;

	function dip() {
		return serverSnapshot.diplomacy || {};
	}

	function isOpen() {
		return String(serverSnapshot.status || '') === 'open';
	}

	function isLiveView() {
		return historyView === 'live';
	}

	function reconcileClaims() {
		const powers = Array.isArray(dip().powers) ? dip().powers : [];
		const active = new Set();
		powers.forEach(function eachPower(power) {
			const key = String(power.id || '');
			active.add(key);
			let row = claimRowsById.get(key);
			if (!row) {
				const node = cloneTemplateNode(claimTemplate);
				row = collectRefs(node);
				row.root = node;
				claimRowsById.set(key, row);
			}
			const rowRefs = row;
			rowRefs.meta.textContent = power.name || power.id;
			const assigned = power.assigned_to && power.assigned_to.username ? power.assigned_to.username : '';
			const chosen = power.chosen_by && power.chosen_by.username ? power.chosen_by.username : '';
			rowRefs.text.textContent = assigned
				? ('Playing as ' + assigned)
				: (chosen ? ('Claimed by ' + chosen) : (power.civil_disorder ? 'Civil disorder' : 'Open'));
			if (rowRefs.root.parentNode !== refs.claimsList) {
				refs.claimsList.appendChild(rowRefs.root);
			}
		});
		claimRowsById.forEach(function eachRow(rowRefs, key) {
			if (!active.has(key)) {
				if (rowRefs.root.parentNode) {
					rowRefs.root.parentNode.removeChild(rowRefs.root);
				}
				claimRowsById.delete(key);
			}
		});
	}

	function fillSelect(select, options, value) {
		const wanted = options.map(function each(opt) {
			return String(opt.value);
		});
		const existing = Array.from(select.options).map(function each(opt) {
			return opt.value;
		});
		if (existing.join('\0') !== wanted.join('\0')) {
			while (select.firstChild) {
				select.removeChild(select.firstChild);
			}
			options.forEach(function eachOpt(opt) {
				const node = document.createElement('option');
				node.value = opt.value;
				node.textContent = opt.label;
				select.appendChild(node);
			});
		}
		if (select.value !== String(value || '') && wanted.indexOf(String(value || '')) !== -1) {
			select.value = String(value || '');
		}
	}

	function historyEntries() {
		const history = Array.isArray(dip().history) ? dip().history : [];
		return history.map(function eachItem(item) {
			const value = phaseKey(item.year, item.phase);
			return { value: value, label: item.label || value };
		});
	}

	function chronologicalNavValues() {
		return historyEntries().map(function each(item) {
			return item.value;
		}).concat(['live']);
	}

	function reconcileHistorySelect() {
		const items = [{ value: 'live', label: 'Live board' }].concat(historyEntries());
		fillSelect(refs.historySelect, items, historyView);
		if (!items.some(function has(item) { return item.value === historyView; })) {
			historyView = 'live';
			refs.historySelect.value = 'live';
		}
		const nav = chronologicalNavValues();
		const index = nav.indexOf(historyView);
		refs.historyPrevBtn.disabled = index <= 0;
		refs.historyNextBtn.disabled = index < 0 || index >= nav.length - 1;
	}

	function reconcileSetup() {
		const data = dip();
		const maps = Array.isArray(data.maps) ? data.maps : [];
		fillSelect(refs.mapSelect, maps.map(function eachMap(map) {
			return { value: map.key, label: map.label || map.key };
		}), data.map_key);
		refs.nationModeSelect.value = data.nation_mode === 'random' ? 'random' : 'pick';
		const perms = serverSnapshot.permissions || {};
		const canEditSetup = isOpen() && !!perms.can_start;
		refs.mapSelect.disabled = !canEditSetup;
		refs.nationModeSelect.disabled = !canEditSetup;
		refs.saveSetupBtn.disabled = !canEditSetup;
		refs.saveSetupBtn.style.display = canEditSetup ? '' : 'none';

		const pickMode = data.nation_mode !== 'random';
		refs.nationPickRow.style.display = isOpen() && pickMode ? '' : 'none';
		const nationOptions = [{ value: 'random', label: 'Random' }];
		(data.powers || []).forEach(function eachPower(power) {
			nationOptions.push({ value: power.id, label: power.name || power.id });
		});
		fillSelect(refs.nationSelect, nationOptions, data.my_chosen_power || 'random');
		refs.nationSelect.disabled = !isOpen() || !pickMode || !perms.can_chat;
		refs.saveNationBtn.disabled = refs.nationSelect.disabled;
		refs.setupNote.textContent = pickMode
			? 'Choose a nation or random. The owner can still start with unclaimed seats left in civil disorder.'
			: 'The owner will assign nations at random when the game starts.';
		reconcileClaims();
	}

	function reconcilePlayChrome() {
		const data = dip();
		const perms = serverSnapshot.permissions || {};
		const progress = data.progress || {};
		refs.phaseTitle.textContent = data.phase_label || 'Diplomacy';
		refs.progressText.textContent = (data.phase_label || 'Phase') + ' submitted: '
			+ Number(progress.submitted_count || 0) + '/' + Number(progress.required_count || 0);
		refs.powerText.textContent = data.my_power ? ('You are ' + data.my_power + '.') : 'You do not have a nation.';
		const canAct = isLiveView() && !!perms.can_act && !!data.my_power && String(serverSnapshot.status || '') === 'in_progress';
		refs.submitBtn.disabled = !canAct;
		refs.submitBtn.style.display = perms.can_act ? '' : 'none';
		refs.endTurnBtn.style.display = perms.can_end_turn ? '' : 'none';
		refs.endTurnBtn.disabled = !perms.can_end_turn;
		reconcileHistorySelect();
	}

	function currentMode() {
		return dip().mode || 'orders';
	}

	function applyBoardFromLive() {
		if (!boardApi || !isLiveView()) {
			return;
		}
		const data = dip();
		const perms = serverSnapshot.permissions || {};
		const live = isLiveView();
		const canWrite = live && !!perms.can_act && !!data.my_power && String(serverSnapshot.status || '') === 'in_progress';
		applyingBoard = true;
		try {
			boardApi.setPlayingAs(data.my_power || '');
			boardApi.setOrderScope('mine');
			boardApi.setRetreats(Array.isArray(data.retreats) ? data.retreats : []);
			boardApi.setAdjustments(Array.isArray(data.adjustments) ? data.adjustments : []);
			boardApi.setMode(currentMode());
			boardApi.setReadOnly(!canWrite);
			if (data.position) {
				boardApi.setPosition(data.position);
			}
			const key = phaseKey(data.year, data.phase);
			const phaseChanged = localDraft.phaseKey !== key;
			if (phaseChanged) {
				localDraft.phaseKey = key;
				localDraft.dirty = false;
				localDraft.doc = data.my_orders || null;
			}
			if (!live) {
				return;
			}
			if (localDraft.dirty && localDraft.doc) {
				boardApi.importDocument(localDraft.doc);
			} else if (data.my_orders) {
				boardApi.importDocument(data.my_orders);
			}
			if (data.display_resolution) {
				boardApi.setResolution(data.display_resolution);
			} else {
				boardApi.setShowResolved(false);
			}
			refs.resolutionText.textContent = data.display_resolution && data.display_resolution.text
				? data.display_resolution.text
				: '';
		} finally {
			applyingBoard = false;
		}
	}

	async function ensureBoardMounted() {
		const data = dip();
		if (!data.map || !data.position || !refs.boardHost) {
			return;
		}
		if (boardApi && boardMapKey === data.map_key) {
			applyBoardFromLive();
			return;
		}
		if (mountPromise) {
			await mountPromise;
			return;
		}
		mountPromise = (async function mount() {
			const DiplomacyBoard = await loadDiplomacyBoard();
			const graph = await loadDiplomacyGraph(data.map);
			if (boardApi) {
				boardApi.destroy();
				boardApi = null;
			}
			boardApi = DiplomacyBoard.mount(refs.boardHost, {
				graph: graph,
				mapUrl: data.map.svg_url,
				mode: currentMode(),
				playingAs: data.my_power || '',
				orderScope: 'mine',
				retreats: Array.isArray(data.retreats) ? data.retreats : [],
				adjustments: Array.isArray(data.adjustments) ? data.adjustments : [],
				readOnly: true,
				position: data.position,
				onChange: function onChange() {
					if (applyingBoard || !isLiveView()) {
						return;
					}
					localDraft.dirty = true;
					localDraft.doc = boardApi ? boardApi.exportOrders() : null;
				},
			});
			boardMapKey = data.map_key;
			applyBoardFromLive();
		})();
		try {
			await mountPromise;
		} finally {
			mountPromise = null;
		}
	}

	function reconcileUi() {
		refs.setupCard.style.display = isOpen() ? '' : 'none';
		refs.playCard.style.display = isOpen() ? 'none' : '';
		if (isOpen()) {
			reconcileSetup();
			return;
		}
		reconcilePlayChrome();
		ensureBoardMounted().catch(function onErr(err) {
			setStatusNode(err.message || 'Unable to load the diplomacy board.', 'error');
		});
	}

	function applyServerSnapshot(game) {
		serverSnapshot.status = game && game.status ? game.status : 'open';
		serverSnapshot.permissions = game && game.permissions ? game.permissions : {};
		serverSnapshot.diplomacy = game && game.diplomacy ? game.diplomacy : null;
		reconcileUi();
	}

	async function refreshDiplomacyState(options) {
		if (!lastGameId || refreshBusy) {
			return;
		}
		const config = options || {};
		refreshBusy = true;
		[refs.refreshSetupBtn, refs.refreshPlayBtn].forEach(function each(btn) {
			btn.disabled = true;
			setGameActionButtonLabel(btn, 'Refreshing...');
		});
		try {
			const detail = await deps.api.gameDetail(lastGameId);
			deps.state.patch({ activeGame: detail.game });
			screen.setGame(detail.game);
			if (!config.silent) {
				setStatusNode('Diplomacy updates refreshed.', 'ok');
			}
		} catch (err) {
			setStatusNode(err.message || 'Unable to refresh diplomacy updates.', 'error');
		} finally {
			refreshBusy = false;
			[refs.refreshSetupBtn, refs.refreshPlayBtn].forEach(function each(btn) {
				btn.disabled = false;
				setGameActionButtonLabel(btn, 'Refresh');
			});
		}
	}

	function stopAutoRefresh() {
		if (autoRefreshId === null) {
			return;
		}
		clearInterval(autoRefreshId);
		autoRefreshId = null;
	}

	function startAutoRefresh() {
		if (autoRefreshId !== null) {
			return;
		}
		autoRefreshId = setInterval(function autoRefreshTick() {
			const current = deps.state.state;
			const isDiplomacyScreen = current.screen === 'game'
				&& current.activeGame
				&& String(current.activeGame.game_type || '').toLowerCase() === 'diplomacy';
			if (!isDiplomacyScreen) {
				stopAutoRefresh();
				return;
			}
			refreshDiplomacyState({ silent: true });
		}, 60000);
	}

	const screen = createBaseGameScreen(deps, {
		title: 'Diplomacy Game',
		titleSuffix: 'Diplomacy',
		showActionComposer: false,
		showParticipantsPanel: true,
		onSetGame: function onSetGame(context) {
			lastGameId = context.game.id;
			setStatusNode = context.setStatusNode;
			applyServerSnapshot(context.game);
			context.nodes.composerRow.style.display = '';
			context.nodes.actionRow.style.display = 'none';
			screen.setTypePanel(panel);
			startAutoRefresh();
		},
	});

	deps.state.subscribe(function onStateChanged(current) {
		const isDiplomacyScreen = current.screen === 'game'
			&& current.activeGame
			&& String(current.activeGame.game_type || '').toLowerCase() === 'diplomacy';
		if (!isDiplomacyScreen) {
			stopAutoRefresh();
		}
	});

	refs.saveSetupBtn.addEventListener('click', async function onSaveSetup() {
		if (!lastGameId) {
			return;
		}
		try {
			const detail = await deps.api.setGameSettings(lastGameId, {
				diplomacy_map_key: refs.mapSelect.value,
				diplomacy_nation_mode: refs.nationModeSelect.value,
			});
			if (detail && detail.game) {
				deps.state.patch({ activeGame: detail.game });
				screen.setGame(detail.game);
			}
			setStatusNode('Setup saved.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to save setup.', 'error');
		}
	});

	refs.saveNationBtn.addEventListener('click', async function onSaveNation() {
		if (!lastGameId) {
			return;
		}
		try {
			const detail = await deps.api.setDiplomacyPower(lastGameId, refs.nationSelect.value);
			if (detail && detail.game) {
				deps.state.patch({ activeGame: detail.game });
				screen.setGame(detail.game);
			}
			setStatusNode('Nation saved.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to save nation.', 'error');
		}
	});

	refs.submitBtn.addEventListener('click', async function onSubmit() {
		if (!lastGameId || !boardApi) {
			return;
		}
		try {
			const doc = boardApi.exportOrders();
			await deps.api.submitDiplomacyOrder(lastGameId, actionTypeForMode(currentMode()), doc);
			localDraft.dirty = false;
			localDraft.doc = doc;
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Orders submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit orders.', 'error');
		}
	});

	refs.endTurnBtn.addEventListener('click', async function onEndTurn() {
		if (!lastGameId) {
			return;
		}
		try {
			await deps.api.revealActions(lastGameId);
			localDraft.dirty = false;
			localDraft.doc = null;
			localDraft.phaseKey = '';
			historyView = 'live';
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Turn resolved.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to end the turn.', 'error');
		}
	});

	async function applyHistoryView(nextView) {
		const target = nextView || 'live';
		if (historyBusy) {
			return;
		}
		if (target === historyView && refs.historySelect.value === target) {
			reconcilePlayChrome();
			return;
		}
		historyBusy = true;
		refs.historyPrevBtn.disabled = true;
		refs.historyNextBtn.disabled = true;
		historyView = target;
		if (refs.historySelect.value !== target) {
			refs.historySelect.value = target;
		}
		try {
			if (historyView === 'live') {
				applyBoardFromLive();
				return;
			}
			if (!lastGameId || !boardApi) {
				return;
			}
			const parts = historyView.split(':');
			const year = Number(parts[0] || 0);
			const phase = parts.slice(1).join(':');
			try {
				const result = await deps.api.diplomacySnapshot(lastGameId, year, phase);
				const snapshot = result.snapshot || {};
				applyingBoard = true;
				boardApi.setReadOnly(true);
				const resolution = snapshot.resolution || {};
				boardApi.setRetreats(Array.isArray(resolution.retreats) ? resolution.retreats : []);
				boardApi.setAdjustments(Array.isArray(resolution.adjustments) ? resolution.adjustments : []);
				boardApi.setMode(snapshot.mode || 'orders');
				if (snapshot.position) {
					boardApi.setPosition(snapshot.position);
				}
				if (snapshot.orders) {
					boardApi.importDocument(snapshot.orders);
				}
				if (snapshot.resolution) {
					boardApi.setResolution(snapshot.resolution);
					refs.resolutionText.textContent = snapshot.resolution.text || '';
				} else {
					boardApi.setShowResolved(false);
					refs.resolutionText.textContent = '';
				}
				applyingBoard = false;
			} catch (err) {
				applyingBoard = false;
				historyView = 'live';
				setStatusNode(err.message || 'Unable to load history.', 'error');
				applyBoardFromLive();
			}
		} finally {
			historyBusy = false;
			reconcilePlayChrome();
		}
	}

	function stepHistory(delta) {
		const nav = chronologicalNavValues();
		const index = nav.indexOf(historyView);
		const next = nav[index + delta];
		if (!next) {
			return;
		}
		applyHistoryView(next);
	}

	refs.historySelect.addEventListener('change', function onHistory() {
		applyHistoryView(refs.historySelect.value || 'live');
	});
	refs.historyPrevBtn.addEventListener('click', function onPrevTurn() {
		stepHistory(-1);
	});
	refs.historyNextBtn.addEventListener('click', function onNextTurn() {
		stepHistory(1);
	});

	[refs.refreshSetupBtn, refs.refreshPlayBtn].forEach(function each(btn) {
		btn.addEventListener('click', function onRefresh() {
			refreshDiplomacyState({ silent: false });
		});
	});

	return screen;
}
