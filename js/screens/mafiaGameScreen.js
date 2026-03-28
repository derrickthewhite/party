import { cloneTemplateNode, collectRefs, createNodeFromHtml, createTemplate } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';

const MAFIA_PANEL_HTML = `
	<div class="card mafia-panel">
		<div class="row">
			<h3 data-ref="phaseTitle">Mafia</h3>
			<div data-ref="headerSpacer"></div>
			<button data-ref="refreshBtn">Refresh</button>
		</div>
		<p class="top-user-label" data-ref="roleText"></p>
		<p data-ref="phaseText"></p>
		<p class="top-user-label" data-ref="progressText"></p>
		<div class="mafia-summary" data-ref="latestSummary"></div>
		<div class="mafia-ready-card" data-ref="readyCard">
			<p data-ref="readyText"></p>
			<div class="row mobile-stack">
				<button class="primary" data-ref="readyBtn">I&apos;m Ready</button>
			</div>
		</div>
		<div class="mafia-vote-card" data-ref="voteCard">
			<div class="row mobile-stack mafia-selection-row">
				<div class="mafia-selection-text" data-ref="selectionText"></div>
				<button class="primary" data-ref="submitVoteBtn">Submit Vote</button>
			</div>
			<div class="list mafia-target-list" data-ref="targetsList"></div>
			<p class="top-user-label" data-ref="emptyTargets">No valid targets right now.</p>
		</div>
		<div class="mafia-history" data-ref="historySection">
			<h4>Recent Results</h4>
			<div class="list" data-ref="historyList"></div>
			<p class="top-user-label" data-ref="emptyHistory">No resolved turns yet.</p>
		</div>
	</div>
`;

const TARGET_ROW_TEMPLATE_HTML = `
	<div class="mafia-target-row">
		<div class="mafia-target-copy">
			<div class="mafia-target-name" data-ref="name"></div>
			<small class="mafia-target-meta" data-ref="meta"></small>
		</div>
		<button data-ref="selectBtn">Select</button>
	</div>
`;

const RESULT_ROW_TEMPLATE_HTML = `
	<div class="message-item mafia-result-row">
		<small data-ref="meta"></small>
		<div data-ref="text"></div>
	</div>
`;

export function createMafiaGameScreen(deps) {
	const panel = createNodeFromHtml(MAFIA_PANEL_HTML);
	const refs = collectRefs(panel);
	const targetTemplate = createTemplate(TARGET_ROW_TEMPLATE_HTML);
	const resultTemplate = createTemplate(RESULT_ROW_TEMPLATE_HTML);

	const refreshBtn = refs.refreshBtn;
	const phaseTitle = refs.phaseTitle;
	const roleText = refs.roleText;
	const phaseText = refs.phaseText;
	const progressText = refs.progressText;
	const latestSummary = refs.latestSummary;
	const readyCard = refs.readyCard;
	const readyText = refs.readyText;
	const readyBtn = refs.readyBtn;
	const voteCard = refs.voteCard;
	const selectionText = refs.selectionText;
	const submitVoteBtn = refs.submitVoteBtn;
	const targetsList = refs.targetsList;
	const emptyTargets = refs.emptyTargets;
	const historyList = refs.historyList;
	const emptyHistory = refs.emptyHistory;

	refs.headerSpacer.style.flex = '1';
	panel.style.marginTop = '8px';

	let lastGameId = null;
	let refreshBusy = false;
	let submitBusy = false;
	let autoRefreshId = null;
	let setStatusNode = function noop() {};

	const serverSnapshot = {
		phase: 'start',
		roundNumber: 1,
		phaseTitle: 'Role Reveal',
		phaseInstructions: '',
		selfRole: 'town',
		selfIsAlive: true,
		submissionActionType: null,
		canSubmit: false,
		hasSubmitted: false,
		currentVoteTargetUserId: null,
		submittedCount: 0,
		requiredCount: 0,
		players: [],
		latestResult: null,
		recentResults: [],
		winnerSummary: null,
		status: 'open',
	};

	const localDraft = {
		selectedTargetUserId: '',
		dirtyTarget: false,
	};

	const targetRowsByUserId = new Map();
	const resultRowsByKey = new Map();

	function currentSelectionUserId() {
		if (localDraft.selectedTargetUserId && /^\d+$/.test(localDraft.selectedTargetUserId)) {
			return Number(localDraft.selectedTargetUserId);
		}
		return null;
	}

	function targetPlayerById(userId) {
		return serverSnapshot.players.find(function eachPlayer(player) {
			return Number(player.user_id) === Number(userId);
		}) || null;
	}

	function isVotePhase() {
		return serverSnapshot.phase === 'day' || serverSnapshot.phase === 'night';
	}

	function canSubmitCurrentVote() {
		if (!isVotePhase() || !serverSnapshot.canSubmit || submitBusy) {
			return false;
		}

		const selectedUserId = currentSelectionUserId();
		if (!selectedUserId) {
			return false;
		}

		const player = targetPlayerById(selectedUserId);
		if (!player || !player.can_target_by_self) {
			return false;
		}

		if (!localDraft.dirtyTarget && serverSnapshot.hasSubmitted && Number(serverSnapshot.currentVoteTargetUserId || 0) === selectedUserId) {
			return false;
		}

		return true;
	}

	function ensureTargetRow(userId) {
		const key = String(Number(userId || 0));
		if (targetRowsByUserId.has(key)) {
			return targetRowsByUserId.get(key);
		}

		const row = cloneTemplateNode(targetTemplate);
		const rowRefs = collectRefs(row);
		rowRefs.row = row;
		rowRefs.selectBtn.addEventListener('click', function onSelect() {
			if (rowRefs.selectBtn.disabled) {
				return;
			}

			localDraft.selectedTargetUserId = key;
			localDraft.dirtyTarget = true;
			reconcileUi();
		});
		targetRowsByUserId.set(key, rowRefs);
		return rowRefs;
	}

	function ensureResultRow(key) {
		if (resultRowsByKey.has(key)) {
			return resultRowsByKey.get(key);
		}

		const row = cloneTemplateNode(resultTemplate);
		const rowRefs = collectRefs(row);
		rowRefs.row = row;
		resultRowsByKey.set(key, rowRefs);
		return rowRefs;
	}

	function reconcileTargets() {
		const activeKeys = new Set();
		serverSnapshot.players.forEach(function eachPlayer(player) {
			const userId = Number(player.user_id || 0);
			const key = String(userId);
			activeKeys.add(key);
			const rowRefs = ensureTargetRow(userId);
			const bits = [];
			if (player.is_self) {
				bits.push('You');
			}
			bits.push(player.is_alive ? 'Alive' : 'Eliminated');
			if (player.known_role) {
				bits.push(player.known_role === 'mafia' ? 'Mafia' : 'Town');
			}

			const selected = currentSelectionUserId() === userId;
			rowRefs.name.textContent = String(player.username || 'Unknown');
			rowRefs.meta.textContent = bits.join(' | ');
			rowRefs.row.classList.toggle('is-selected', selected);
			rowRefs.selectBtn.className = selected ? 'primary' : '';
			rowRefs.selectBtn.textContent = selected ? 'Selected' : 'Select';
			rowRefs.selectBtn.disabled = !player.can_target_by_self || !serverSnapshot.canSubmit || submitBusy;
			targetsList.appendChild(rowRefs.row);
		});

		Array.from(targetRowsByUserId.keys()).forEach(function eachKey(key) {
			if (activeKeys.has(key)) {
				return;
			}
			const rowRefs = targetRowsByUserId.get(key);
			if (rowRefs && rowRefs.row.parentNode === targetsList) {
				targetsList.removeChild(rowRefs.row);
			}
			targetRowsByUserId.delete(key);
		});

		const hasTargetablePlayer = serverSnapshot.players.some(function eachPlayer(player) {
			return !!player.can_target_by_self;
		});
		emptyTargets.style.display = hasTargetablePlayer ? 'none' : '';
	}

	function reconcileHistory() {
		const items = Array.isArray(serverSnapshot.recentResults) ? serverSnapshot.recentResults : [];
		const activeKeys = new Set();

		items.forEach(function eachItem(item, index) {
			const key = [
				String(item.action_type || 'result'),
				String(item.round_number || 0),
				String(item.created_at || index),
			].join(':');
			activeKeys.add(key);
			const rowRefs = ensureResultRow(key);
			rowRefs.meta.textContent = 'Round ' + Number(item.round_number || 0) + ' | ' + String(item.phase || '').toUpperCase();
			rowRefs.text.textContent = String(item.summary_text || 'Resolved.');
			historyList.appendChild(rowRefs.row);
		});

		Array.from(resultRowsByKey.keys()).forEach(function eachKey(key) {
			if (activeKeys.has(key)) {
				return;
			}
			const rowRefs = resultRowsByKey.get(key);
			if (rowRefs && rowRefs.row.parentNode === historyList) {
				historyList.removeChild(rowRefs.row);
			}
			resultRowsByKey.delete(key);
		});

		emptyHistory.style.display = items.length > 0 ? 'none' : '';
	}

	function reconcileUi() {
		phaseTitle.textContent = String(serverSnapshot.phaseTitle || 'Mafia');
		roleText.textContent = 'Your role: ' + (serverSnapshot.selfRole === 'mafia' ? 'Mafia' : 'Town');
		phaseText.textContent = String(serverSnapshot.phaseInstructions || '');
		if (serverSnapshot.phase === 'start') {
			progressText.textContent = 'Ready: ' + Number(serverSnapshot.submittedCount || 0) + '/' + Number(serverSnapshot.requiredCount || 0);
		} else {
			progressText.textContent = 'Submissions: ' + Number(serverSnapshot.submittedCount || 0) + '/' + Number(serverSnapshot.requiredCount || 0);
		}

		if (serverSnapshot.latestResult && serverSnapshot.latestResult.summary_text) {
			latestSummary.textContent = String(serverSnapshot.latestResult.summary_text);
			latestSummary.style.display = '';
		} else if (serverSnapshot.winnerSummary) {
			latestSummary.textContent = String(serverSnapshot.winnerSummary);
			latestSummary.style.display = '';
		} else {
			latestSummary.textContent = '';
			latestSummary.style.display = 'none';
		}

		const selectedPlayer = targetPlayerById(currentSelectionUserId());
		if (selectedPlayer) {
			selectionText.textContent = 'Selected target: ' + String(selectedPlayer.username || 'Unknown');
		} else if (serverSnapshot.hasSubmitted && serverSnapshot.currentVoteTargetUserId) {
			const currentPlayer = targetPlayerById(serverSnapshot.currentVoteTargetUserId);
			selectionText.textContent = currentPlayer
				? 'Current submitted target: ' + String(currentPlayer.username || 'Unknown')
				: 'Current submitted target is locked in.';
		} else {
			selectionText.textContent = 'Choose a target from the list below.';
		}

		readyCard.style.display = serverSnapshot.phase === 'start' ? '' : 'none';
		voteCard.style.display = isVotePhase() ? '' : 'none';
		readyText.textContent = serverSnapshot.hasSubmitted
			? 'Ready submitted. Waiting for the rest of the table.'
			: 'Confirm that you have reviewed your role.';
		readyBtn.disabled = !serverSnapshot.canSubmit || serverSnapshot.hasSubmitted || submitBusy;
		submitVoteBtn.disabled = !canSubmitCurrentVote();

		reconcileTargets();
		reconcileHistory();
	}

	function applyServerSnapshot(game) {
		const mafiaState = game && game.mafia_state ? game.mafia_state : {};
		const nextPhase = String(mafiaState.phase || 'start');
		const nextRound = Number(mafiaState.round_number || 1);
		const transitioned = nextPhase !== serverSnapshot.phase
			|| nextRound !== serverSnapshot.roundNumber
			|| String(mafiaState.submission_action_type || '') !== String(serverSnapshot.submissionActionType || '');

		serverSnapshot.phase = nextPhase;
		serverSnapshot.roundNumber = nextRound;
		serverSnapshot.phaseTitle = String(mafiaState.phase_title || 'Mafia');
		serverSnapshot.phaseInstructions = String(mafiaState.phase_instructions || '');
		serverSnapshot.selfRole = String(mafiaState.self_role || 'town');
		serverSnapshot.selfIsAlive = !!mafiaState.self_is_alive;
		serverSnapshot.submissionActionType = mafiaState.submission_action_type || null;
		serverSnapshot.canSubmit = !!mafiaState.can_submit;
		serverSnapshot.hasSubmitted = !!mafiaState.has_submitted;
		serverSnapshot.currentVoteTargetUserId = mafiaState.current_vote_target_user_id == null ? null : Number(mafiaState.current_vote_target_user_id);
		serverSnapshot.submittedCount = Number(mafiaState.submitted_count || 0);
		serverSnapshot.requiredCount = Number(mafiaState.required_count || 0);
		serverSnapshot.players = Array.isArray(mafiaState.players) ? mafiaState.players.slice() : [];
		serverSnapshot.latestResult = mafiaState.latest_result || null;
		serverSnapshot.recentResults = Array.isArray(mafiaState.recent_results) ? mafiaState.recent_results.slice() : [];
		serverSnapshot.winnerSummary = mafiaState.winner_summary || null;
		serverSnapshot.status = String((game && game.status) || 'open');

		if (transitioned) {
			localDraft.selectedTargetUserId = serverSnapshot.currentVoteTargetUserId != null
				? String(serverSnapshot.currentVoteTargetUserId)
				: '';
			localDraft.dirtyTarget = false;
		} else if (!localDraft.dirtyTarget) {
			localDraft.selectedTargetUserId = serverSnapshot.currentVoteTargetUserId != null
				? String(serverSnapshot.currentVoteTargetUserId)
				: '';
		}

		reconcileUi();
	}

	async function refreshMafiaState(options) {
		if (!lastGameId || refreshBusy) {
			return;
		}

		const config = options || {};
		refreshBusy = true;
		refreshBtn.disabled = true;
		refreshBtn.textContent = 'Refreshing...';
		try {
			const detail = await deps.api.gameDetail(lastGameId);
			deps.state.patch({ activeGame: detail.game });
			screen.setGame(detail.game);
			if (!config.silent) {
				setStatusNode('Mafia updates refreshed.', 'ok');
			}
		} catch (err) {
			setStatusNode(err.message || 'Unable to refresh mafia updates.', 'error');
		} finally {
			refreshBusy = false;
			refreshBtn.disabled = false;
			refreshBtn.textContent = 'Refresh';
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
			const isMafiaScreen = current.screen === 'game'
				&& current.activeGame
				&& String(current.activeGame.game_type || '').toLowerCase() === 'mafia';
			if (!isMafiaScreen) {
				stopAutoRefresh();
				return;
			}

			refreshMafiaState({ silent: true });
		}, 4000);
	}

	async function submitCurrentAction() {
		if (!lastGameId || submitBusy || !serverSnapshot.submissionActionType) {
			return;
		}

		submitBusy = true;
		reconcileUi();
		try {
			if (serverSnapshot.phase === 'start') {
				await deps.api.sendAction(lastGameId, serverSnapshot.submissionActionType, {});
			} else {
				const selectedUserId = currentSelectionUserId();
				if (!selectedUserId) {
					throw new Error('Select a target before submitting.');
				}
				await deps.api.sendAction(lastGameId, serverSnapshot.submissionActionType, {
					target_user_id: selectedUserId,
				});
			}

			localDraft.dirtyTarget = false;
			await refreshMafiaState({ silent: true });
			setStatusNode('Action submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit mafia action.', 'error');
		} finally {
			submitBusy = false;
			reconcileUi();
		}
	}

	refreshBtn.addEventListener('click', function onRefreshClick() {
		refreshMafiaState({ silent: false });
	});

	readyBtn.addEventListener('click', submitCurrentAction);
	submitVoteBtn.addEventListener('click', submitCurrentAction);

	const screen = createBaseGameScreen(deps, {
		title: 'Mafia Game',
		titleSuffix: 'Mafia',
		showActionComposer: false,
		showParticipantsPanel: true,
		onSetGame: function onSetGame(context) {
			lastGameId = context.game.id;
			setStatusNode = context.setStatusNode;
			context.nodes.composerRow.style.display = '';
			context.nodes.actionRow.style.display = 'none';
			screen.setTypePanel(panel);
			applyServerSnapshot(context.game);
			startAutoRefresh();
		},
	});

	deps.state.subscribe(function onStateChanged(current) {
		const isMafiaScreen = current.screen === 'game'
			&& current.activeGame
			&& String(current.activeGame.game_type || '').toLowerCase() === 'mafia';
		if (!isMafiaScreen) {
			stopAutoRefresh();
		}
	});

	return screen;
}
