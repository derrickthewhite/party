import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';
import { createGameActionButtonMarkup, setGameActionButtonLabel } from './gameActionButtons.js';
import { loadDiplomacyBoard, loadDiplomacyGraph, withAssetStamp } from './diplomacyBoardLoader.js';

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

function adjustmentEntry(adjustments, power) {
	const list = Array.isArray(adjustments) ? adjustments : [];
	const id = String(power || '');
	if (!id) {
		return null;
	}
	for (let i = 0; i < list.length; i += 1) {
		if (list[i] && String(list[i].power || '') === id) {
			return list[i];
		}
	}
	return null;
}

function orderMatchesAdjustment(entry, order) {
	if (!entry || !order) {
		return false;
	}
	const province = String(order.province || '');
	if (order.action === 'build') {
		return (entry.builds || []).some(function eachSite(site) {
			return !!(site && String(site.province || '') === province && site.unit === order.unit);
		});
	}
	if (order.action === 'disband') {
		return (entry.disbands || []).some(function eachId(id) {
			return String(id) === province;
		});
	}
	return false;
}

function documentsForBoard(doc, adjustments) {
	if (!doc) {
		return [];
	}
	if (doc.kind !== 'diplomacy-adjustments') {
		return [doc];
	}
	if (doc.power) {
		return adjustmentEntry(adjustments, doc.power) ? [doc] : [];
	}
	const orders = Array.isArray(doc.orders) ? doc.orders : [];
	const used = new Set();
	const docs = [];
	(Array.isArray(adjustments) ? adjustments : []).forEach(function eachEntry(entry) {
		if (!entry || !entry.power) {
			return;
		}
		const mine = [];
		orders.forEach(function eachOrder(order, index) {
			if (used.has(index) || !orderMatchesAdjustment(entry, order)) {
				return;
			}
			used.add(index);
			mine.push(order);
		});
		if (!mine.length) {
			return;
		}
		docs.push({
			kind: 'diplomacy-adjustments',
			map: doc.map || '',
			power: entry.power,
			orders: mine,
		});
	});
	return docs;
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
				<div class="diplomacy-setup-fields">
					<label class="diplomacy-field">Map
						<select data-ref="mapSelect"></select>
					</label>
					<label class="diplomacy-field">Who selects nations
						<select data-ref="nationModeSelect">
							<option value="pick">Players pick</option>
							<option value="random">Random</option>
							<option value="owner">Owner pick</option>
						</select>
					</label>
					<label class="diplomacy-field">How many each player gets
						<select data-ref="nationCountSelect">
							<option value="single">One each</option>
							<option value="even">Evenly</option>
							<option value="all">Assign all</option>
						</select>
					</label>
					<div class="diplomacy-timer-field">
						<label class="diplomacy-check">
							<input data-ref="timerShortcut" type="checkbox">
							Timer on
						</label>
						<label class="diplomacy-field">Minutes
							<input data-ref="timerMinutes" type="number" min="1" max="10080" inputmode="numeric">
						</label>
					</div>
					<div class="diplomacy-setup-actions">
						<button class="primary" data-ref="saveSetupBtn">Save setup</button>
						<button type="button" data-ref="resetNationsBtn">Reset nations</button>
					</div>
				</div>
				<p class="diplomacy-setup-note" data-ref="setupNote"></p>
				<div class="diplomacy-slot-list" data-ref="slotList">
					<p class="diplomacy-section-label">Your nations</p>
				</div>
				<div class="diplomacy-nation-list" data-ref="nationList"></div>
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
					<button type="button" data-ref="editTokensBtn">Edit token positions</button>
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
	const nationTemplate = createTemplate(`
		<div class="diplomacy-nation-row">
			<div class="diplomacy-nation-head">
				<span class="diplomacy-swatch" data-ref="swatch"></span>
				<span class="diplomacy-nation-name" data-ref="name"></span>
				<span class="diplomacy-nation-centers" data-ref="meta"></span>
			</div>
			<div class="diplomacy-nation-assign">
				<span class="diplomacy-nation-status" data-ref="status"></span>
				<select data-ref="assignSelect"></select>
			</div>
		</div>
	`);
	const slotTemplate = createTemplate(`
		<div class="diplomacy-slot-row">
			<span class="diplomacy-swatch is-empty" data-ref="swatch"></span>
			<label>
				<span data-ref="slotLabel">Nation</span>
				<select data-ref="nationSelect"></select>
			</label>
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
		setupDirty: false,
	};

	const nationRows = new Map();
	const slotRows = new Map();
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
	let tokenEdit = false;
	let assignmentBusy = 0;
	let assignmentChain = Promise.resolve();
	let settingsBusy = 0;
	let settingsChain = Promise.resolve();

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

	function centerCountLabel(count) {
		const centers = Number(count || 0);
		return centers === 1 ? '1 center' : (centers + ' centers');
	}

	function paintSlotSwatch(swatch, power) {
		paintSwatch(swatch, power ? power.color : '');
		if (swatch) {
			swatch.classList.toggle('is-empty', !power);
		}
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

	function markSetupDirty() {
		localDraft.setupDirty = true;
	}

	function setupFieldsAreLocal() {
		return localDraft.setupDirty || settingsBusy > 0;
	}

	function setupMode() {
		if (setupFieldsAreLocal()) {
			return refs.nationModeSelect.value || 'pick';
		}
		return dip().nation_mode || 'pick';
	}

	function setupCount() {
		if (setupFieldsAreLocal()) {
			return refs.nationCountSelect.value || 'single';
		}
		return dip().nation_count || 'single';
	}

	function viewerUserId() {
		const user = deps.state.state.user || {};
		return user.id ? String(user.id) : '';
	}

	function viewerMember() {
		const id = viewerUserId();
		if (!id) {
			return null;
		}
		return playerMembers().find(function findMember(member) {
			return String(member.id) === id;
		}) || null;
	}

	function viewerUsername() {
		const member = viewerMember();
		if (member && member.username) {
			return member.username;
		}
		const user = deps.state.state.user || {};
		return user.username || 'You';
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

	function canEditSetup() {
		return isOpen() && !!(serverSnapshot.permissions || {}).can_start;
	}

	function nationStatusText(power) {
		if (power.availability === 'civil' || power.civil_disorder) {
			return 'Civil disorder';
		}
		if (power.assigned_to && power.assigned_to.username) {
			return power.assigned_to.username;
		}
		return 'Open';
	}

	function managerAssignOptions() {
		const options = [
			{ value: 'open', label: 'Open' },
			{ value: 'civil', label: 'Civil disorder' },
		];
		playerMembers().forEach(function each(member) {
			options.push({ value: String(member.id), label: member.username || ('Player ' + member.id) });
		});
		return options;
	}

	function assignmentValue(power) {
		if (power.availability === 'civil' || power.civil_disorder) {
			return 'civil';
		}
		if (power.assigned_to && power.assigned_to.user_id) {
			return String(power.assigned_to.user_id);
		}
		return 'open';
	}

	function viewerAssignedPowers() {
		const id = viewerUserId();
		const list = [];
		(dip().powers || []).forEach(function eachPower(power) {
			if (power.assigned_to && String(power.assigned_to.user_id) === id && power.availability !== 'civil') {
				list.push(String(power.id));
			}
		});
		return list;
	}

	function reconcileNations() {
		const powers = Array.isArray(dip().powers) ? dip().powers : [];
		const canManage = canEditSetup();
		const playerCanClaim = isOpen() && setupMode() === 'pick' && setupCount() === 'all' && !!viewerMember();
		const me = viewerUserId();
		const active = new Set();
		powers.forEach(function eachPower(power) {
			const key = String(power.id);
			active.add(key);
			let row = nationRows.get(key);
			if (!row) {
				const node = cloneTemplateNode(nationTemplate);
				row = collectRefs(node);
				row.root = node;
				nationRows.set(key, row);
				bindSelect(row.assignSelect, function onAssign() {
					queueAssignmentSave([{ power: key, state: row.assignSelect.value }]);
				});
			}
			paintSwatch(row.swatch, power.color);
			row.name.textContent = power.name || power.id;
			row.meta.textContent = centerCountLabel(power.center_count);
			row.status.textContent = nationStatusText(power);
			const mine = !!(power.assigned_to && String(power.assigned_to.user_id) === me);
			const open = power.availability === 'open' || (!power.availability && !power.civil_disorder && !power.assigned_to);
			let showSelect = false;
			let options = [];
			if (canManage) {
				showSelect = true;
				options = managerAssignOptions();
			} else if (playerCanClaim && (open || mine)) {
				showSelect = true;
				options = [
					{ value: 'open', label: 'Open' },
					{ value: me, label: viewerUsername() },
				];
			}
			row.assignSelect.style.display = showSelect ? '' : 'none';
			row.status.style.display = showSelect ? 'none' : '';
			if (showSelect) {
				const value = assignmentBusy > 0 ? row.assignSelect.value : assignmentValue(power);
				fillSelect(row.assignSelect, options, value);
			}
		});
		dropRows(nationRows, active, refs.nationList);
	}

	function slotChoices(chosen, index) {
		const taken = {};
		chosen.forEach(function eachChosen(powerId, chosenIndex) {
			if (chosenIndex !== index && powerId) {
				taken[powerId] = true;
			}
		});
		const me = viewerUserId();
		const options = [{ value: '', label: 'Random' }];
		(dip().powers || []).forEach(function eachPower(power) {
			const id = String(power.id);
			if (power.availability === 'civil' || power.civil_disorder) {
				return;
			}
			if (power.assigned_to && String(power.assigned_to.user_id) !== me) {
				return;
			}
			if (taken[id]) {
				return;
			}
			options.push({ value: id, label: power.name || id });
		});
		return options;
	}

	function reconcileSlots() {
		const quota = Number(dip().nation_quota || 0);
		const show = isOpen() && setupMode() === 'pick' && setupCount() !== 'all' && quota > 0 && !!viewerMember();
		refs.slotList.style.display = show ? '' : 'none';
		if (!show) {
			dropRows(slotRows, new Set(), refs.slotList);
			return;
		}
		const assigned = viewerAssignedPowers();
		const slotCount = Math.max(quota, assignmentBusy > 0 ? slotRows.size : assigned.length, assigned.length);
		const chosen = [];
		for (let i = 0; i < slotCount; i += 1) {
			const existing = slotRows.get(String(i));
			chosen.push(assignmentBusy > 0 && existing ? (existing.nationSelect.value || '') : (assigned[i] || ''));
		}
		const active = new Set();
		chosen.forEach(function eachSlot(selectedId, index) {
			const key = String(index);
			active.add(key);
			let row = slotRows.get(key);
			if (!row) {
				const node = cloneTemplateNode(slotTemplate);
				row = collectRefs(node);
				row.root = node;
				row.powerId = '';
				slotRows.set(key, row);
				bindSelect(row.nationSelect, function onSlot() {
					const previous = row.powerId || '';
					const next = row.nationSelect.value || '';
					if (previous === next) {
						return;
					}
					const updates = [];
					const me = Number(viewerUserId() || 0);
					if (previous) {
						updates.push({ power: previous, state: 'open' });
					}
					if (next) {
						updates.push({ power: next, state: me });
					}
					row.powerId = next;
					paintSlotSwatch(row.swatch, powerById(next));
					queueAssignmentSave(updates);
				});
			}
			row.slotLabel.textContent = chosen.length > 1 ? ('Nation ' + (index + 1)) : 'Your nation';
			row.powerId = selectedId;
			fillSelect(row.nationSelect, slotChoices(chosen, index), selectedId);
			paintSlotSwatch(row.swatch, powerById(row.nationSelect.value));
		});
		dropRows(slotRows, active, refs.slotList);
	}

	function setupNoteText() {
		const mode = setupMode();
		const count = setupCount();
		const quota = Number(dip().nation_quota || 0);
		if (count === 'all' && mode === 'random') {
			return 'Random deals every open nation when the game starts. Civil disorder stays out, and nations already assigned stay with that player.';
		}
		if (count === 'all') {
			return 'A player can hold more than one nation. Open nations become civil disorder when the game starts.';
		}
		if (count === 'single') {
			return 'Each player needs one nation. Anyone still short is filled from open nations, then from civil disorder. Leftover open nations become civil disorder.';
		}
		if (quota < 1) {
			return 'There are not enough nations in play to give every player one. Open nations become civil disorder when the game starts.';
		}
		return 'Each player needs ' + quota + ' nations. Leftovers stay unassigned and become civil disorder. Anyone still short is filled from open nations, then from civil disorder.';
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
		const keepLocal = setupFieldsAreLocal();
		fillSelect(refs.mapSelect, maps.map(function eachMap(map) {
			return { value: map.key, label: map.label || map.key };
		}), keepLocal ? refs.mapSelect.value : data.map_key);
		if (!keepLocal) {
			refs.nationModeSelect.value = data.nation_mode || 'pick';
			refs.nationCountSelect.value = data.nation_count || 'single';
			const timer = data.timer || {};
			refs.timerMinutes.value = timer.minutes ? String(timer.minutes) : '';
			refs.timerShortcut.checked = !!timer.shortcut;
		}
		const canEdit = canEditSetup();
		refs.mapSelect.disabled = !canEdit;
		refs.nationModeSelect.disabled = !canEdit;
		refs.nationCountSelect.disabled = !canEdit;
		refs.timerShortcut.disabled = !canEdit;
		refs.timerMinutes.disabled = !canEdit || !refs.timerShortcut.checked;
		refs.saveSetupBtn.disabled = !canEdit;
		refs.saveSetupBtn.style.display = canEdit ? '' : 'none';
		refs.resetNationsBtn.disabled = !canEdit;
		refs.resetNationsBtn.style.display = canEdit ? '' : 'none';
		refs.setupNote.textContent = setupNoteText();
		reconcileSlots();
		reconcileNations();
	}

	function paintTimer() {
		const timer = dip().timer || {};
		if (!timer.shortcut || !timer.minutes || isOpen()) {
			refs.timerText.textContent = '';
			return;
		}
		if (!timer.deadline) {
			refs.timerText.textContent = 'A phase timer is set.';
			return;
		}
		const end = Date.parse(timer.deadline);
		const remain = Number.isFinite(end) ? Math.max(0, Math.floor((end - Date.now()) / 1000)) : 0;
		const clock = Math.floor(remain / 60) + ':' + String(remain % 60).padStart(2, '0');
		if (remain > 0) {
			refs.timerText.textContent = 'Phase ends in ' + clock + '.';
			return;
		}
		refs.timerText.textContent = 'The phase timer has run out.';
	}

	function viewedHistoryLabel() {
		if (isLiveView()) {
			return '';
		}
		const match = historyEntries().find(function each(item) {
			return item.value === historyView;
		});
		return match ? match.label : '';
	}

	function reconcilePlayChrome() {
		const data = dip();
		const perms = serverSnapshot.permissions || {};
		const progress = data.progress || {};
		const pastLabel = viewedHistoryLabel();
		const title = pastLabel || data.phase_label || 'Diplomacy';
		refs.phaseTitle.textContent = title;
		refs.focusTitle.textContent = title;
		refs.progressText.textContent = pastLabel
			? 'Resolved turn'
			: ((data.phase_label || 'Phase')
				+ ' · Submitted ' + Number(progress.submitted_count || 0) + '/' + Number(progress.required_count || 0)
				+ ' · Ready ' + Number(progress.ready_count || 0) + '/' + Number(progress.required_count || 0));
		const names = viewerPowers().map(powerName);
		refs.powerText.textContent = names.length ? ('You are ' + names.join(', ') + '.') : 'You do not have a nation.';
		const powers = viewerPowers();
		const canAct = isLiveView() && !!perms.can_act && powers.length > 0 && String(serverSnapshot.status || '') === 'in_progress';
		const powerCanOrder = currentMode() !== 'build' || powers.some(function each(powerId) {
			return !!adjustmentEntry(data.adjustments, powerId);
		});
		refs.submitBtn.disabled = !canAct || !powerCanOrder;
		refs.submitBtn.style.display = perms.can_act ? '' : 'none';
		const showReady = canAct && !!data.viewer_required;
		refs.readyBtn.style.display = showReady ? '' : 'none';
		refs.readyBtn.disabled = !showReady;
		refs.readyBtn.textContent = data.viewer_ready ? 'Cancel ready' : 'Ready';
		refs.endTurnBtn.style.display = perms.can_end_turn ? '' : 'none';
		refs.endTurnBtn.disabled = !perms.can_end_turn;
		refs.focusBtn.style.display = '';
		refs.editTokensBtn.textContent = tokenEdit ? 'Done editing tokens' : 'Edit token positions';
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

	function importOrders(doc, adjustments) {
		if (!boardApi || !doc) {
			return;
		}
		documentsForBoard(doc, adjustments).forEach(function each(item) {
			boardApi.importDocument(item);
		});
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
		const adjustments = Array.isArray(data.adjustments) ? data.adjustments : [];
		const powerCanOrder = currentMode() !== 'build' || powers.some(function each(powerId) {
			return !!adjustmentEntry(adjustments, powerId);
		});
		const canWrite = !!perms.can_act && powers.length > 0 && powerCanOrder && String(serverSnapshot.status || '') === 'in_progress';
		applyingBoard = true;
		try {
			const key = phaseKey(data.year, data.phase);
			if (localDraft.phaseKey !== key) {
				localDraft.phaseKey = key;
				localDraft.docs = {};
				localDraft.dirtyPowers = {};
			}
			clearMountedOrders(currentMode());
			if (typeof boardApi.setPlayingAsPowers === 'function') {
				boardApi.setPlayingAsPowers(powers);
			} else {
				boardApi.setPlayingAs(powers[0] || '');
			}
			boardApi.setOrderScope('mine');
			boardApi.setRetreats(Array.isArray(data.retreats) ? data.retreats : []);
			boardApi.setAdjustments(adjustments);
			boardApi.setMode(currentMode());
			boardApi.setReadOnly(!canWrite);
			if (data.position) {
				boardApi.setPosition(data.position);
			}
			powers.forEach(function eachPower(powerId) {
				importOrders(ordersDocFor(powerId), adjustments);
			});
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
			const loaded = await loadDiplomacyGraph(data.map);
			const graph = loaded.graph || loaded;
			const tokenPositions = loaded.tokenPositions || null;
			if (boardApi) {
				boardApi.destroy();
				boardApi = null;
			}
			tokenEdit = false;
			refs.editTokensBtn.textContent = 'Edit token positions';
			boardReady = false;
			boardApi = DiplomacyBoard.mount(refs.boardHost, {
				graph: graph,
				tokenPositions: tokenPositions,
				mapUrl: withAssetStamp(data.map.svg_url),
				mode: currentMode(),
				playingAsPowers: viewerPowers(),
				playingAs: viewerPowers()[0] || data.my_power || '',
				orderScope: 'mine',
				retreats: Array.isArray(data.retreats) ? data.retreats : [],
				adjustments: Array.isArray(data.adjustments) ? data.adjustments : [],
				readOnly: true,
				position: data.position,
				onReady: function onReady() {
					applyBoardFromLive();
					boardReady = true;
				},
				onTokenEdit: function onTokenEdit(on) {
					tokenEdit = !!on;
					refs.editTokensBtn.textContent = tokenEdit ? 'Done editing tokens' : 'Edit token positions';
				},
				onChange: function onChange() {
					if (!boardReady || applyingBoard || !isLiveView() || !boardApi) {
						return;
					}
					viewerPowers().forEach(function eachPower(power) {
						localDraft.dirtyPowers[power] = true;
						localDraft.docs[power] = boardApi.exportOrders(power);
					});
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

	function setupPayload() {
		const timerOn = !!refs.timerShortcut.checked;
		const minutesRaw = timerOn ? refs.timerMinutes.value.trim() : '';
		return {
			diplomacy_map_key: refs.mapSelect.value,
			diplomacy_nation_mode: refs.nationModeSelect.value,
			diplomacy_nation_count: refs.nationCountSelect.value,
			diplomacy_timer_minutes: minutesRaw === '' ? null : Number(minutesRaw),
			diplomacy_timer_shortcut: timerOn,
		};
	}

	function applyDetail(detail) {
		if (detail && detail.game) {
			deps.state.patch({ activeGame: detail.game });
			screen.setGame(detail.game);
		}
	}

	function queueSettingsSave() {
		if (!lastGameId || !canEditSetup()) {
			return;
		}
		const payload = setupPayload();
		settingsBusy += 1;
		settingsChain = settingsChain.then(async function saveSettings() {
			try {
				const detail = await deps.api.setGameSettings(lastGameId, payload);
				localDraft.setupDirty = false;
				applyDetail(detail);
			} catch (err) {
				localDraft.setupDirty = false;
				setStatusNode(err.message || 'Unable to save setup.', 'error');
				reconcileSetup();
			} finally {
				settingsBusy -= 1;
				if (settingsBusy === 0) {
					reconcileSetup();
				}
			}
		});
	}

	function queueAssignmentSave(updates) {
		if (!lastGameId || !updates.length) {
			return;
		}
		assignmentBusy += 1;
		assignmentChain = assignmentChain.then(async function saveAssignments() {
			try {
				const detail = await deps.api.setDiplomacyAssignments(lastGameId, updates);
				applyDetail(detail);
			} catch (err) {
				setStatusNode(err.message || 'Unable to save nation.', 'error');
				reconcileSetup();
			} finally {
				assignmentBusy -= 1;
				if (assignmentBusy === 0) {
					reconcileSetup();
				}
			}
		});
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
		queueSettingsSave();
		reconcileSetup();
	});
	refs.nationCountSelect.addEventListener('change', function onCount() {
		queueSettingsSave();
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
		refs.timerMinutes.disabled = !canEditSetup() || !refs.timerShortcut.checked;
	});
	refs.resetNationsBtn.addEventListener('click', function onResetNations() {
		const updates = (dip().powers || []).map(function eachPower(power) {
			return { power: power.id, state: 'open' };
		});
		queueAssignmentSave(updates);
	});

	refs.saveSetupBtn.addEventListener('click', async function onSaveSetup() {
		if (!lastGameId) {
			return;
		}
		try {
			const detail = await deps.api.setGameSettings(lastGameId, setupPayload());
			localDraft.setupDirty = false;
			applyDetail(detail);
			setStatusNode('Setup saved.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to save setup.', 'error');
		}
	});

	refs.submitBtn.addEventListener('click', async function onSubmit() {
		if (!lastGameId || !boardApi) {
			return;
		}
		try {
			const powers = viewerPowers();
			const actionType = actionTypeForMode(currentMode());
			for (let i = 0; i < powers.length; i += 1) {
				const doc = boardApi.exportOrders(powers[i]);
				await deps.api.submitDiplomacyOrder(lastGameId, actionType, doc);
				if (doc && doc.power) {
					localDraft.dirtyPowers[doc.power] = false;
					localDraft.docs[doc.power] = doc;
				}
			}
			await refreshDiplomacyState({ silent: true });
			setStatusNode('Orders submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit orders.', 'error');
		}
	});

	refs.editTokensBtn.addEventListener('click', function onEditTokens() {
		if (!boardApi || typeof boardApi.setTokenEdit !== 'function') {
			return;
		}
		tokenEdit = !tokenEdit;
		boardApi.setTokenEdit(tokenEdit);
		refs.editTokensBtn.textContent = tokenEdit ? 'Done editing tokens' : 'Edit token positions';
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
				const adjustments = Array.isArray(resolution.adjustments) ? resolution.adjustments : [];
				clearMountedOrders(snapshot.mode || 'orders');
				boardApi.setRetreats(Array.isArray(resolution.retreats) ? resolution.retreats : []);
				boardApi.setAdjustments(adjustments);
				boardApi.setMode(snapshot.mode || 'orders');
				if (snapshot.position) {
					boardApi.setPosition(snapshot.position);
				}
				if (snapshot.orders) {
					importOrders(snapshot.orders, adjustments);
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
