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

function emptyOrdersDoc(mode, map, power) {
	const kind = mode === 'retreat'
		? 'diplomacy-retreats'
		: (mode === 'build' ? 'diplomacy-adjustments' : 'diplomacy-orders');
	return {
		kind: kind,
		map: map || '',
		power: power || '',
		orders: [],
	};
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
							<option value="assign_all">Assign all</option>
							<option value="one_each">Assign one each</option>
							<option value="even">Assign evenly</option>
						</select>
					</label>
					<button data-ref="saveSetupBtn">Save setup</button>
				</div>
				<div class="row mobile-stack">
					<label>Phase timer (minutes)
						<input data-ref="timerMinutes" type="number" min="1" max="10080" inputmode="numeric" placeholder="Off">
					</label>
					<label class="diplomacy-check">
						<input data-ref="timerShortcut" type="checkbox">
						Timer can end the phase
					</label>
				</div>
				<div class="row mobile-stack" data-ref="nationPickRow">
					<label>Your nation
						<select data-ref="nationSelect"></select>
					</label>
					<button data-ref="saveNationBtn">Save nation</button>
				</div>
				<p class="top-user-label" data-ref="setupNote"></p>
				<div class="list" data-ref="claimsList"></div>
				<div data-ref="assignAllList"></div>
				<div data-ref="oneEachList"></div>
				<div data-ref="evenPanel">
					<div class="diplomacy-assign-tools">
						<label>Faction
							<span class="diplomacy-inline-control">
								<span class="diplomacy-swatch" data-ref="evenSwatch"></span>
								<select data-ref="evenFactionSelect"></select>
							</span>
						</label>
						<label>Player
							<select data-ref="evenPlayerSelect"></select>
						</label>
						<button type="button" data-ref="evenAddBtn">Add</button>
					</div>
					<div class="list" data-ref="evenList"></div>
				</div>
			</div>
			<div class="card diplomacy-play-card" data-ref="playCard">
				<div class="row">
					<h3 data-ref="phaseTitle">Diplomacy</h3>
					<div data-ref="playSpacer"></div>
					${createGameActionButtonMarkup('refresh', 'refreshPlayBtn', '')}
				</div>
				<p class="top-user-label" data-ref="progressText">Submitted 0/0 · Ready 0/0</p>
				<p data-ref="timerText" class="diplomacy-timer-text"></p>
				<p data-ref="powerText"></p>
				<div class="row mobile-stack" data-ref="activePowerRow">
					<label>Ordering for
						<select data-ref="activePowerSelect"></select>
					</label>
				</div>
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
					<div data-ref="playActionsSlot"></div>
				</div>
				<div data-ref="orderActions" class="row mobile-stack">
					<button class="primary" data-ref="submitBtn">Submit orders</button>
					<button data-ref="readyBtn">Ready</button>
					<button data-ref="endTurnBtn">End turn</button>
					<button type="button" data-ref="focusBtn">Focus board</button>
				</div>
				<div data-ref="boardSlot">
					<div class="diplomacy-board-host" data-ref="boardHost"></div>
				</div>
				<div class="list" data-ref="powersList"></div>
				<pre class="diplomacy-resolution" data-ref="resolutionText"></pre>
			</div>
			<div class="diplomacy-focus-layer" data-ref="focusLayer" hidden>
				<div class="row">
					<strong data-ref="focusTitle">Board</strong>
					<div data-ref="focusSpacer"></div>
					<div data-ref="focusActionsSlot"></div>
					<button type="button" data-ref="focusCloseBtn">Close</button>
				</div>
				<div class="diplomacy-focus-board" data-ref="focusBoardSlot"></div>
			</div>
		</div>
	`);
	const refs = collectRefs(panel);
	const claimTemplate = createTemplate(`
		<div class="diplomacy-power-row">
			<span class="diplomacy-swatch" data-ref="swatch"></span>
			<div class="diplomacy-power-copy">
				<small data-ref="meta"></small>
				<div data-ref="text"></div>
			</div>
		</div>
	`);
	const assignAllTemplate = createTemplate(`
		<div class="diplomacy-assign-row">
			<span class="diplomacy-swatch" data-ref="swatch"></span>
			<span data-ref="name"></span>
			<label>Player
				<select data-ref="playerSelect"></select>
			</label>
		</div>
	`);
	const oneEachTemplate = createTemplate(`
		<div class="diplomacy-assign-row">
			<span data-ref="name"></span>
			<span class="diplomacy-swatch" data-ref="swatch"></span>
			<label>Faction
				<select data-ref="factionSelect"></select>
			</label>
		</div>
	`);
	const evenTemplate = createTemplate(`
		<div class="diplomacy-assign-row">
			<span class="diplomacy-swatch" data-ref="swatch"></span>
			<span data-ref="name"></span>
			<span data-ref="playerName"></span>
			<button type="button" data-ref="removeBtn">Remove</button>
		</div>
	`);

	refs.setupSpacer.style.flex = '1';
	refs.playSpacer.style.flex = '1';
	refs.focusSpacer.style.flex = '1';
	refs.playActionsSlot.appendChild(refs.orderActions);

	const serverSnapshot = {
		status: 'open',
		permissions: {},
		diplomacy: null,
		members: [],
	};
	const localDraft = {
		docs: {},
		dirtyPowers: {},
		phaseKey: '',
		activePower: '',
		setupDirty: false,
		assignments: null,
	};

	const claimRowsById = new Map();
	const assignAllRows = new Map();
	const oneEachRows = new Map();
	const evenRows = new Map();
	const playRowsById = new Map();

	let lastGameId = null;
	let setStatusNode = function noop() {};
	let refreshBusy = false;
	let autoRefreshId = null;
	let timerTickId = null;
	let boardApi = null;
	let boardMapKey = '';
	let applyingBoard = false;
	let boardReady = false;
	let historyView = 'live';
	let historyBusy = false;
	let mountPromise = null;
	let focusOpen = false;

	function dip() {
		return serverSnapshot.diplomacy || {};
	}

	function isOpen() {
		return String(serverSnapshot.status || '') === 'open';
	}

	function isLiveView() {
		return historyView === 'live';
	}

	function playerMembers() {
		return (serverSnapshot.members || []).filter(function each(member) {
			return String(member.role || '') !== 'observer';
		});
	}

	function powerById(powerId) {
		const powers = Array.isArray(dip().powers) ? dip().powers : [];
		for (let i = 0; i < powers.length; i += 1) {
			if (String(powers[i].id) === String(powerId)) {
				return powers[i];
			}
		}
		return null;
	}

	function powerName(powerId) {
		const power = powerById(powerId);
		return power ? (power.name || power.id) : String(powerId || '');
	}

	function paintSwatch(node, color) {
		if (!node) {
			return;
		}
		node.style.backgroundColor = color || 'transparent';
	}

	function centerLabel(count) {
		const centers = Number(count || 0);
		return centers === 1 ? '1 supply center' : (centers + ' supply centers');
	}

	function viewerPowers() {
		const listed = Array.isArray(dip().my_powers) ? dip().my_powers.map(String) : [];
		if (listed.length) {
			return listed;
		}
		if (dip().my_power && dip().my_power !== 'random') {
			return [String(dip().my_power)];
		}
		return [];
	}

	function serverAssignmentMap() {
		const raw = dip().assignments || {};
		const out = {};
		Object.keys(raw).forEach(function eachKey(key) {
			const value = raw[key];
			out[String(key)] = value == null || value === '' ? '' : String(value);
		});
		(dip().powers || []).forEach(function eachPower(power) {
			if (!Object.prototype.hasOwnProperty.call(out, power.id)) {
				out[power.id] = '';
			}
		});
		return out;
	}

	function assignmentMap() {
		if (localDraft.setupDirty && localDraft.assignments) {
			return localDraft.assignments;
		}
		return serverAssignmentMap();
	}

	function markSetupDirty() {
		if (!localDraft.assignments) {
			localDraft.assignments = serverAssignmentMap();
		}
		localDraft.setupDirty = true;
	}

	function setupMode() {
		if (localDraft.setupDirty) {
			return refs.nationModeSelect.value || 'pick';
		}
		return dip().nation_mode || 'pick';
	}

	function playerOptions(includeDisorder) {
		const options = [];
		if (includeDisorder) {
			options.push({ value: '', label: 'Civil disorder' });
		}
		playerMembers().forEach(function each(member) {
			options.push({ value: String(member.id), label: member.username || ('Player ' + member.id) });
		});
		return options;
	}

	function factionOptions(includeEmpty) {
		const options = [];
		if (includeEmpty) {
			options.push({ value: '', label: 'Unassigned' });
		}
		(dip().powers || []).forEach(function eachPower(power) {
			options.push({ value: power.id, label: power.name || power.id });
		});
		return options;
	}

	function fillSelect(select, options, value) {
		const wanted = options.map(function each(opt) {
			return String(opt.value);
		});
		const existing = Array.from(select.options).map(function each(opt) {
			return opt.value;
		});
		const labels = options.map(function each(opt) {
			return opt.label;
		});
		const existingLabels = Array.from(select.options).map(function each(opt) {
			return opt.textContent;
		});
		if (existing.join('\0') !== wanted.join('\0') || existingLabels.join('\0') !== labels.join('\0')) {
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
		if (wanted.indexOf(String(value || '')) !== -1 && select.value !== String(value || '')) {
			select.value = String(value || '');
		}
	}

	function dropRows(rows, active, container) {
		rows.forEach(function eachRow(row, key) {
			if (!active.has(key)) {
				if (row.root.parentNode) {
					row.root.parentNode.removeChild(row.root);
				}
				rows.delete(key);
			}
		});
		active.forEach(function eachKey(key) {
			const row = rows.get(key);
			if (row && row.root.parentNode !== container) {
				container.appendChild(row.root);
			}
		});
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
			paintSwatch(row.swatch, power.color);
			row.meta.textContent = power.name || power.id;
			const assigned = power.assigned_to && power.assigned_to.username ? power.assigned_to.username : '';
			const chosen = power.chosen_by && power.chosen_by.username ? power.chosen_by.username : '';
			const owner = assigned
				? ('Playing as ' + assigned)
				: (chosen ? ('Claimed by ' + chosen) : (power.civil_disorder ? 'Civil disorder' : 'Open'));
			row.text.textContent = owner + ' · ' + centerLabel(power.center_count);
		});
		dropRows(claimRowsById, active, refs.claimsList);
	}

	function reconcilePlayRoster() {
		const powers = Array.isArray(dip().powers) ? dip().powers : [];
		const active = new Set();
		const inProgress = String(serverSnapshot.status || '') === 'in_progress';
		powers.forEach(function eachPower(power) {
			const key = String(power.id || '');
			active.add(key);
			let row = playRowsById.get(key);
			if (!row) {
				const node = cloneTemplateNode(claimTemplate);
				row = collectRefs(node);
				row.root = node;
				playRowsById.set(key, row);
			}
			paintSwatch(row.swatch, power.color);
			row.meta.textContent = power.name || power.id;
			const who = power.assigned_to && power.assigned_to.username
				? power.assigned_to.username
				: (power.civil_disorder ? 'Civil disorder' : 'Unassigned');
			let detail = who + ' · ' + centerLabel(power.center_count);
			if (inProgress && power.assigned_to) {
				detail += ' · ' + (power.orders_submitted ? 'Submitted' : 'No orders');
				detail += ' · ' + (power.ready ? 'Ready' : 'Not ready');
			}
			row.text.textContent = detail;
		});
		dropRows(playRowsById, active, refs.powersList);
	}

	function bindSelect(select, handler) {
		if (select.dataset.bound === '1') {
			return;
		}
		select.dataset.bound = '1';
		select.addEventListener('change', handler);
	}

	function reconcileAssignAll(canEdit) {
		const powers = Array.isArray(dip().powers) ? dip().powers : [];
		const assignments = assignmentMap();
		const options = playerOptions(true);
		const active = new Set();
		powers.forEach(function eachPower(power) {
			const key = String(power.id);
			active.add(key);
			let row = assignAllRows.get(key);
			if (!row) {
				const node = cloneTemplateNode(assignAllTemplate);
				row = collectRefs(node);
				row.root = node;
				assignAllRows.set(key, row);
				bindSelect(row.playerSelect, function onPlayer() {
					markSetupDirty();
					localDraft.assignments[key] = row.playerSelect.value;
				});
			}
			paintSwatch(row.swatch, power.color);
			row.name.textContent = power.name || power.id;
			fillSelect(row.playerSelect, options, assignments[key] || '');
			row.playerSelect.disabled = !canEdit;
		});
		dropRows(assignAllRows, active, refs.assignAllList);
	}

	function reconcileOneEach(canEdit) {
		const assignments = assignmentMap();
		const options = factionOptions(true);
		const active = new Set();
		playerMembers().forEach(function each(member) {
			const key = String(member.id);
			active.add(key);
			let row = oneEachRows.get(key);
			if (!row) {
				const node = cloneTemplateNode(oneEachTemplate);
				row = collectRefs(node);
				row.root = node;
				oneEachRows.set(key, row);
				bindSelect(row.factionSelect, function onFaction() {
					markSetupDirty();
					Object.keys(localDraft.assignments).forEach(function eachPower(powerId) {
						if (String(localDraft.assignments[powerId]) === key) {
							localDraft.assignments[powerId] = '';
						}
					});
					if (row.factionSelect.value) {
						localDraft.assignments[row.factionSelect.value] = key;
					}
					const selected = powerById(row.factionSelect.value);
					paintSwatch(row.swatch, selected ? selected.color : '');
				});
			}
			row.name.textContent = member.username || ('Player ' + member.id);
			let selectedPower = '';
			Object.keys(assignments).forEach(function eachPower(powerId) {
				if (!selectedPower && String(assignments[powerId]) === key) {
					selectedPower = powerId;
				}
			});
			fillSelect(row.factionSelect, options, selectedPower);
			const selected = powerById(row.factionSelect.value);
			paintSwatch(row.swatch, selected ? selected.color : '');
			row.factionSelect.disabled = !canEdit;
		});
		dropRows(oneEachRows, active, refs.oneEachList);
	}

	function reconcileEven(canEdit) {
		const assignments = assignmentMap();
		const factionValue = refs.evenFactionSelect.value;
		fillSelect(refs.evenFactionSelect, factionOptions(false), factionValue || ((dip().powers || [])[0] || {}).id || '');
		fillSelect(refs.evenPlayerSelect, playerOptions(false), refs.evenPlayerSelect.value || ((playerMembers()[0] || {}).id || ''));
		const selected = powerById(refs.evenFactionSelect.value);
		paintSwatch(refs.evenSwatch, selected ? selected.color : '');
		refs.evenFactionSelect.disabled = !canEdit;
		refs.evenPlayerSelect.disabled = !canEdit;
		refs.evenAddBtn.disabled = !canEdit;
		const active = new Set();
		Object.keys(assignments).forEach(function eachPower(powerId) {
			const userId = assignments[powerId];
			if (!userId) {
				return;
			}
			active.add(powerId);
			let row = evenRows.get(powerId);
			if (!row) {
				const node = cloneTemplateNode(evenTemplate);
				row = collectRefs(node);
				row.root = node;
				evenRows.set(powerId, row);
				row.removeBtn.addEventListener('click', function onRemove() {
					markSetupDirty();
					localDraft.assignments[powerId] = '';
					reconcileEven(canEditSetup());
				});
			}
			const power = powerById(powerId);
			paintSwatch(row.swatch, power ? power.color : '');
			row.name.textContent = power ? (power.name || power.id) : powerId;
			const member = playerMembers().find(function findMember(item) {
				return String(item.id) === String(userId);
			});
			row.playerName.textContent = member ? member.username : ('Player ' + userId);
			row.removeBtn.disabled = !canEdit;
		});
		dropRows(evenRows, active, refs.evenList);
	}

	function canEditSetup() {
		return isOpen() && !!(serverSnapshot.permissions || {}).can_start;
	}

	function reconcileAssignment() {
		const mode = setupMode();
		const canEdit = canEditSetup();
		refs.assignAllList.style.display = mode === 'assign_all' ? '' : 'none';
		refs.oneEachList.style.display = mode === 'one_each' ? '' : 'none';
		refs.evenPanel.style.display = mode === 'even' ? '' : 'none';
		if (mode === 'assign_all') {
			reconcileAssignAll(canEdit);
		}
		if (mode === 'one_each') {
			reconcileOneEach(canEdit);
		}
		if (mode === 'even') {
			reconcileEven(canEdit);
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
		}), localDraft.setupDirty ? refs.mapSelect.value : data.map_key);
		if (!localDraft.setupDirty) {
			refs.nationModeSelect.value = data.nation_mode || 'pick';
			const timer = data.timer || {};
			refs.timerMinutes.value = timer.minutes ? String(timer.minutes) : '';
			refs.timerShortcut.checked = !!timer.shortcut;
		}
		const canEdit = canEditSetup();
		refs.mapSelect.disabled = !canEdit;
		refs.nationModeSelect.disabled = !canEdit;
		refs.timerMinutes.disabled = !canEdit;
		refs.timerShortcut.disabled = !canEdit;
		refs.saveSetupBtn.disabled = !canEdit;
		refs.saveSetupBtn.style.display = canEdit ? '' : 'none';

		const mode = setupMode();
		const pickMode = mode === 'pick';
		refs.nationPickRow.style.display = isOpen() && pickMode ? '' : 'none';
		const nationOptions = [{ value: 'random', label: 'Random' }];
		(data.powers || []).forEach(function eachPower(power) {
			nationOptions.push({ value: power.id, label: power.name || power.id });
		});
		fillSelect(refs.nationSelect, nationOptions, data.my_chosen_power || 'random');
		const perms = serverSnapshot.permissions || {};
		refs.nationSelect.disabled = !isOpen() || !pickMode || !perms.can_chat;
		refs.saveNationBtn.disabled = refs.nationSelect.disabled;
		if (mode === 'assign_all') {
			refs.setupNote.textContent = 'Assign every nation to a player, or leave it in civil disorder. A player can take more than one nation.';
		} else if (mode === 'one_each') {
			refs.setupNote.textContent = 'Give each player one faction. The color swatch matches that faction. Leftover factions are civil disorder.';
		} else if (mode === 'even') {
			refs.setupNote.textContent = 'Pair each faction with a player. Add more than one faction to a player when the nations need to be spread evenly.';
		} else if (pickMode) {
			refs.setupNote.textContent = 'Choose a nation or random. The owner can still start with unclaimed seats left in civil disorder.';
		} else {
			refs.setupNote.textContent = 'The owner will assign nations at random when the game starts.';
		}
		reconcileClaims();
		reconcileAssignment();
	}

	function paintTimer() {
		const timer = dip().timer || {};
		if (!timer.minutes || isOpen()) {
			refs.timerText.textContent = '';
			return;
		}
		if (!timer.deadline) {
			refs.timerText.textContent = timer.shortcut
				? 'A phase timer is set and can end the phase.'
				: 'A phase timer is set. It does not end the phase.';
			return;
		}
		const end = Date.parse(timer.deadline);
		const remain = Number.isFinite(end) ? Math.max(0, Math.floor((end - Date.now()) / 1000)) : 0;
		const clock = Math.floor(remain / 60) + ':' + String(remain % 60).padStart(2, '0');
		if (remain > 0) {
			refs.timerText.textContent = timer.shortcut
				? ('Phase ends in ' + clock + '.')
				: ('Timer ' + clock + '. It does not end the phase.');
			return;
		}
		refs.timerText.textContent = timer.shortcut
			? 'The phase timer has run out.'
			: 'The timer has run out. It does not end the phase.';
	}

	function reconcilePlayChrome() {
		const data = dip();
		const perms = serverSnapshot.permissions || {};
		const progress = data.progress || {};
		refs.phaseTitle.textContent = data.phase_label || 'Diplomacy';
		refs.focusTitle.textContent = data.phase_label || 'Diplomacy';
		refs.progressText.textContent = (data.phase_label || 'Phase')
			+ ' · Submitted ' + Number(progress.submitted_count || 0) + '/' + Number(progress.required_count || 0)
			+ ' · Ready ' + Number(progress.ready_count || 0) + '/' + Number(progress.required_count || 0);
		const names = viewerPowers().map(powerName);
		refs.powerText.textContent = names.length ? ('You are ' + names.join(', ') + '.') : 'You do not have a nation.';
		const powers = viewerPowers();
		refs.activePowerRow.style.display = powers.length > 1 ? '' : 'none';
		if (!localDraft.activePower || powers.indexOf(localDraft.activePower) === -1) {
			localDraft.activePower = powers[0] || '';
		}
		fillSelect(refs.activePowerSelect, powers.map(function each(powerId) {
			return { value: powerId, label: powerName(powerId) };
		}), localDraft.activePower);
		const canAct = isLiveView() && !!perms.can_act && powers.length > 0 && String(serverSnapshot.status || '') === 'in_progress';
		refs.submitBtn.disabled = !canAct;
		refs.submitBtn.style.display = perms.can_act ? '' : 'none';
		const showReady = canAct && !!data.viewer_required;
		refs.readyBtn.style.display = showReady ? '' : 'none';
		refs.readyBtn.disabled = !showReady;
		refs.readyBtn.textContent = data.viewer_ready ? 'Cancel ready' : 'Ready';
		refs.endTurnBtn.style.display = perms.can_end_turn ? '' : 'none';
		refs.endTurnBtn.disabled = !perms.can_end_turn;
		refs.focusBtn.style.display = '';
		paintTimer();
		reconcileHistorySelect();
		reconcilePlayRoster();
	}

	function currentMode() {
		return dip().mode || 'orders';
	}

	function positionMap() {
		return (dip().position && dip().position.map) || '';
	}

	function ordersDocFor(power) {
		if (power && localDraft.dirtyPowers[power] && localDraft.docs[power]) {
			return localDraft.docs[power];
		}
		const byPower = dip().my_orders_by_power || {};
		if (power && byPower[power]) {
			return byPower[power];
		}
		if (power && power === dip().my_power && dip().my_orders) {
			return dip().my_orders;
		}
		return emptyOrdersDoc(currentMode(), positionMap(), power);
	}

	function clearMountedOrders(targetMode) {
		if (!boardApi) {
			return;
		}
		const target = targetMode || 'orders';
		boardApi.setMode(target === 'orders' ? 'retreat' : 'orders');
		boardApi.setMode(target);
	}

	function relayoutBoard() {
		if (boardApi && typeof boardApi.relayout === 'function') {
			boardApi.relayout();
		}
	}

	function setFocus(open) {
		focusOpen = !!open;
		if (focusOpen) {
			refs.focusLayer.hidden = false;
			refs.focusBoardSlot.appendChild(refs.boardHost);
			refs.focusActionsSlot.appendChild(refs.orderActions);
		} else {
			refs.boardSlot.appendChild(refs.boardHost);
			refs.playActionsSlot.appendChild(refs.orderActions);
			refs.focusLayer.hidden = true;
		}
		requestAnimationFrame(relayoutBoard);
	}

	function applyBoardFromLive() {
		if (!boardApi || !isLiveView()) {
			return;
		}
		const data = dip();
		const perms = serverSnapshot.permissions || {};
		const powers = viewerPowers();
		if (!localDraft.activePower || powers.indexOf(localDraft.activePower) === -1) {
			localDraft.activePower = powers[0] || data.my_power || '';
		}
		const canWrite = !!perms.can_act && !!localDraft.activePower && String(serverSnapshot.status || '') === 'in_progress';
		applyingBoard = true;
		try {
			const key = phaseKey(data.year, data.phase);
			if (localDraft.phaseKey !== key) {
				localDraft.phaseKey = key;
				localDraft.docs = {};
				localDraft.dirtyPowers = {};
			}
			clearMountedOrders(currentMode());
			boardApi.setPlayingAs(localDraft.activePower || '');
			boardApi.setOrderScope('mine');
			boardApi.setRetreats(Array.isArray(data.retreats) ? data.retreats : []);
			boardApi.setAdjustments(Array.isArray(data.adjustments) ? data.adjustments : []);
			boardApi.setMode(currentMode());
			boardApi.setReadOnly(!canWrite);
			if (data.position) {
				boardApi.setPosition(data.position);
			}
			const doc = ordersDocFor(localDraft.activePower);
			if (doc) {
				boardApi.importDocument(doc);
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
			boardReady = false;
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
				onReady: function onReady() {
					applyBoardFromLive();
					boardReady = true;
				},
				onChange: function onChange() {
					if (!boardReady || applyingBoard || !isLiveView()) {
						return;
					}
					const power = localDraft.activePower || dip().my_power || '';
					if (!power || !boardApi) {
						return;
					}
					localDraft.dirtyPowers[power] = true;
					localDraft.docs[power] = boardApi.exportOrders();
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
			setFocus(false);
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
		serverSnapshot.members = game && Array.isArray(game.members) ? game.members : [];
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

	function stopTimerTick() {
		if (timerTickId === null) {
			return;
		}
		clearInterval(timerTickId);
		timerTickId = null;
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

	function startTimerTick() {
		if (timerTickId !== null) {
			return;
		}
		timerTickId = setInterval(paintTimer, 1000);
	}

	function collectAssignments(mode) {
		const out = {};
		(dip().powers || []).forEach(function eachPower(power) {
			out[power.id] = null;
		});
		if (mode === 'assign_all') {
			assignAllRows.forEach(function eachRow(row, powerId) {
				out[powerId] = row.playerSelect.value ? Number(row.playerSelect.value) : null;
			});
		} else if (mode === 'one_each') {
			oneEachRows.forEach(function eachRow(row, userId) {
				if (row.factionSelect.value) {
					out[row.factionSelect.value] = Number(userId);
				}
			});
		} else if (mode === 'even') {
			const current = assignmentMap();
			Object.keys(current).forEach(function eachPower(powerId) {
				if (current[powerId]) {
					out[powerId] = Number(current[powerId]);
				}
			});
		}
		return out;
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
			startTimerTick();
		},
	});

	deps.state.subscribe(function onStateChanged(current) {
		const isDiplomacyScreen = current.screen === 'game'
			&& current.activeGame
			&& String(current.activeGame.game_type || '').toLowerCase() === 'diplomacy';
		if (!isDiplomacyScreen) {
			stopAutoRefresh();
			stopTimerTick();
		}
	});

	refs.nationModeSelect.addEventListener('change', function onMode() {
		markSetupDirty();
		reconcileSetup();
	});
	refs.mapSelect.addEventListener('change', function onMap() {
		markSetupDirty();
	});
	refs.timerMinutes.addEventListener('input', function onTimer() {
		markSetupDirty();
	});
	refs.timerShortcut.addEventListener('change', function onShortcut() {
		markSetupDirty();
	});
	refs.evenFactionSelect.addEventListener('change', function onEvenFaction() {
		const selected = powerById(refs.evenFactionSelect.value);
		paintSwatch(refs.evenSwatch, selected ? selected.color : '');
	});
	refs.evenAddBtn.addEventListener('click', function onEvenAdd() {
		const powerId = refs.evenFactionSelect.value;
		const userId = refs.evenPlayerSelect.value;
		if (!powerId || !userId) {
			return;
		}
		markSetupDirty();
		localDraft.assignments[powerId] = userId;
		reconcileEven(canEditSetup());
	});

	refs.saveSetupBtn.addEventListener('click', async function onSaveSetup() {
		if (!lastGameId) {
			return;
		}
		const mode = refs.nationModeSelect.value;
		const minutesRaw = refs.timerMinutes.value.trim();
		const payload = {
			diplomacy_map_key: refs.mapSelect.value,
			diplomacy_nation_mode: mode,
			diplomacy_timer_minutes: minutesRaw === '' ? null : Number(minutesRaw),
			diplomacy_timer_shortcut: !!refs.timerShortcut.checked,
		};
		if (mode === 'assign_all' || mode === 'one_each' || mode === 'even') {
			payload.diplomacy_assignments = refs.mapSelect.value === (dip().map_key || '')
				? collectAssignments(mode)
				: {};
		}
		try {
			const detail = await deps.api.setGameSettings(lastGameId, payload);
			localDraft.setupDirty = false;
			localDraft.assignments = null;
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

	refs.activePowerSelect.addEventListener('change', function onActivePower() {
		const next = refs.activePowerSelect.value;
		if (!next || next === localDraft.activePower) {
			return;
		}
		if (boardApi && localDraft.activePower) {
			localDraft.docs[localDraft.activePower] = boardApi.exportOrders();
			localDraft.dirtyPowers[localDraft.activePower] = true;
		}
		localDraft.activePower = next;
		applyBoardFromLive();
	});

	refs.submitBtn.addEventListener('click', async function onSubmit() {
		if (!lastGameId || !boardApi) {
			return;
		}
		try {
			const doc = boardApi.exportOrders();
			await deps.api.submitDiplomacyOrder(lastGameId, actionTypeForMode(currentMode()), doc);
			if (doc && doc.power) {
				localDraft.dirtyPowers[doc.power] = false;
				localDraft.docs[doc.power] = doc;
			}
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Orders submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit orders.', 'error');
		}
	});

	refs.readyBtn.addEventListener('click', async function onReady() {
		if (!lastGameId) {
			return;
		}
		const markingReady = !dip().viewer_ready;
		try {
			await deps.api.setDiplomacyReady(lastGameId, markingReady);
			await refreshDiplomacyState({ silent: true });
			setStatusNode(markingReady ? 'Marked ready.' : 'Ready canceled.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to update ready.', 'error');
		}
	});

	refs.endTurnBtn.addEventListener('click', async function onEndTurn() {
		if (!lastGameId) {
			return;
		}
		try {
			await deps.api.revealActions(lastGameId);
			localDraft.docs = {};
			localDraft.dirtyPowers = {};
			localDraft.phaseKey = '';
			historyView = 'live';
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Turn resolved.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to end the turn.', 'error');
		}
	});

	refs.focusBtn.addEventListener('click', function onFocus() {
		setFocus(true);
	});
	refs.focusCloseBtn.addEventListener('click', function onCloseFocus() {
		setFocus(false);
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
				clearMountedOrders(snapshot.mode || 'orders');
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
