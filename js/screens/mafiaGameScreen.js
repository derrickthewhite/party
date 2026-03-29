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
				<p class="mafia-selection-text" data-ref="voteText"></p>
				<button data-ref="withdrawVoteBtn">Withdraw Vote</button>
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
			<div class="mafia-target-state" data-ref="state"></div>
			<small class="mafia-target-meta" data-ref="meta"></small>
		</div>
		<div class="mafia-target-actions" data-ref="actions">
			<button class="button-ready" data-ref="suggestBtn">Suggest</button>
			<button class="primary" data-ref="voteBtn">Vote</button>
		</div>
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
	const voteText = refs.voteText;
	const withdrawVoteBtn = refs.withdrawVoteBtn;
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
	let pendingAction = null;
	let setStatusNode = function noop() {};

	const serverSnapshot = {
		phase: 'start',
		roundNumber: 1,
		phaseTitle: 'Role Reveal',
		phaseInstructions: '',
		selfRole: 'town',
		selfIsAlive: true,
		submissionActionType: null,
		suggestionActionType: null,
		voteActionType: null,
		canSubmit: false,
		hasSubmitted: false,
		currentSuggestionTargetUserId: null,
		currentDisplaySuggestionTargetUserId: null,
		currentVoteTargetUserId: null,
		submittedCount: 0,
		requiredCount: 0,
		players: [],
		latestResult: null,
		recentResults: [],
		winnerSummary: null,
		status: 'open',
	};

	const targetRowsByUserId = new Map();
	const resultRowsByKey = new Map();

	function targetPlayerById(userId) {
		if (userId == null) {
			return null;
		}

		return serverSnapshot.players.find(function eachPlayer(player) {
			return Number(player.user_id) === Number(userId);
		}) || null;
	}

	function selfPlayer() {
		return serverSnapshot.players.find(function eachPlayer(player) {
			return !!player.is_self;
		}) || null;
	}

	function targetPlayerName(userId) {
		const player = targetPlayerById(userId);
		return player ? String(player.username || 'Unknown') : 'Unknown';
	}

	function isVotePhase() {
		return serverSnapshot.phase === 'day' || serverSnapshot.phase === 'night';
	}

	function canSendLiveAction(actionType, player) {
		if (!isVotePhase() || !actionType || !serverSnapshot.canSubmit || submitBusy) {
			return false;
		}

		if (!player || !player.can_target_by_self) {
			return false;
		}

		return true;
	}

	function canWithdrawVote() {
		return isVotePhase()
			&& !!serverSnapshot.voteActionType
			&& serverSnapshot.canSubmit
			&& serverSnapshot.currentVoteTargetUserId != null
			&& !submitBusy;
	}

	function buildVoteSummaryText() {
		if (!isVotePhase()) {
			return '';
		}

		if (!serverSnapshot.canSubmit) {
			if (serverSnapshot.phase === 'night') {
				if (serverSnapshot.selfRole === 'mafia' && !serverSnapshot.selfIsAlive) {
					return 'You are eliminated. Night coordination is hidden until resolution.';
				}
				return 'Night actions are hidden from town until resolution.';
			}

			return 'You cannot act in this phase.';
		}

		const suggestionName = serverSnapshot.currentDisplaySuggestionTargetUserId != null
			? targetPlayerName(serverSnapshot.currentDisplaySuggestionTargetUserId)
			: '';
		const voteName = serverSnapshot.currentVoteTargetUserId != null
			? targetPlayerName(serverSnapshot.currentVoteTargetUserId)
			: '';

		if (suggestionName && voteName && suggestionName === voteName) {
			return 'You suggest and vote ' + suggestionName + '.';
		}

		if (suggestionName && voteName) {
			return 'You suggest ' + suggestionName + ' and vote ' + voteName + '.';
		}

		if (suggestionName) {
			return 'You suggest ' + suggestionName + '.';
		}

		if (voteName) {
			return 'You vote ' + voteName + '.';
		}

		return 'Use Suggest to float a target and Vote when you want your choice to count.';
	}

	function buildPlayerLiveStateText(player) {
		const suggestionTargetUserId = player && player.display_suggestion_target_user_id != null
			? Number(player.display_suggestion_target_user_id)
			: null;
		const voteTargetUserId = player && player.vote_target_user_id != null
			? Number(player.vote_target_user_id)
			: null;

		if (suggestionTargetUserId != null && voteTargetUserId != null && suggestionTargetUserId === voteTargetUserId) {
			return 'Suggests and votes ' + targetPlayerName(voteTargetUserId);
		}

		const bits = [];
		if (suggestionTargetUserId != null) {
			bits.push('Suggests ' + targetPlayerName(suggestionTargetUserId));
		}
		if (voteTargetUserId != null) {
			bits.push('Votes ' + targetPlayerName(voteTargetUserId));
		}

		return bits.join(' | ');
	}

	async function fetchAndApplyGameDetail() {
		const detail = await deps.api.gameDetail(lastGameId);
		deps.state.patch({ activeGame: detail.game });
		screen.setGame(detail.game);
		return detail;
	}

	function ensureTargetRow(userId) {
		const key = String(Number(userId || 0));
		if (targetRowsByUserId.has(key)) {
			return targetRowsByUserId.get(key);
		}

		const row = cloneTemplateNode(targetTemplate);
		const rowRefs = collectRefs(row);
		rowRefs.row = row;
		rowRefs.suggestBtn.addEventListener('click', function onSuggest() {
			submitLiveAction(Number(key), 'suggest');
		});
		rowRefs.voteBtn.addEventListener('click', function onVote() {
			submitLiveAction(Number(key), 'vote');
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
		const viewer = selfPlayer();
		const viewerSuggestionTargetUserId = viewer && viewer.suggestion_target_user_id != null
			? Number(viewer.suggestion_target_user_id)
			: null;
		const viewerDisplaySuggestionTargetUserId = viewer && viewer.display_suggestion_target_user_id != null
			? Number(viewer.display_suggestion_target_user_id)
			: null;
		const viewerVoteTargetUserId = viewer && viewer.vote_target_user_id != null
			? Number(viewer.vote_target_user_id)
			: null;
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

			const liveStateText = buildPlayerLiveStateText(player);
			const isSelfSuggested = viewerSuggestionTargetUserId === userId;
			const isSelfVoted = viewerVoteTargetUserId === userId;
			const isPendingSuggestion = pendingAction && pendingAction.kind === 'suggest' && pendingAction.targetUserId === userId;
			const isPendingVote = pendingAction && pendingAction.kind === 'vote' && pendingAction.targetUserId === userId;
			const canSuggest = canSendLiveAction(serverSnapshot.suggestionActionType, player) && !isSelfSuggested && !isPendingVote;
			const canVote = canSendLiveAction(serverSnapshot.voteActionType, player) && !isSelfVoted && !isPendingSuggestion;

			rowRefs.name.textContent = String(player.username || 'Unknown');
			rowRefs.state.textContent = liveStateText;
			rowRefs.state.style.display = liveStateText ? '' : 'none';
			rowRefs.meta.textContent = bits.join(' | ');
			rowRefs.actions.style.display = player.is_self ? 'none' : '';
			rowRefs.row.classList.toggle('is-suggested', viewerDisplaySuggestionTargetUserId === userId);
			rowRefs.row.classList.toggle('is-voted', isSelfVoted);
			rowRefs.suggestBtn.textContent = isPendingSuggestion ? 'Suggesting...' : (isSelfSuggested ? 'Suggested' : 'Suggest');
			rowRefs.voteBtn.textContent = isPendingVote ? 'Voting...' : (isSelfVoted ? 'Voted' : 'Vote');
			rowRefs.suggestBtn.disabled = !canSuggest;
			rowRefs.voteBtn.disabled = !canVote;
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
		emptyTargets.textContent = serverSnapshot.canSubmit
			? 'No valid targets right now.'
			: (serverSnapshot.phase === 'night' ? 'Only living mafia can act at night.' : 'You cannot act in this phase.');
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
			progressText.textContent = 'Votes: ' + Number(serverSnapshot.submittedCount || 0) + '/' + Number(serverSnapshot.requiredCount || 0);
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

		voteText.textContent = buildVoteSummaryText();
		withdrawVoteBtn.style.display = canWithdrawVote() ? '' : 'none';
		withdrawVoteBtn.disabled = !canWithdrawVote();

		readyCard.style.display = serverSnapshot.phase === 'start' ? '' : 'none';
		voteCard.style.display = isVotePhase() ? '' : 'none';
		readyText.textContent = serverSnapshot.hasSubmitted
			? 'Ready submitted. Waiting for the rest of the table.'
			: 'Confirm that you have reviewed your role.';
		readyBtn.disabled = !serverSnapshot.canSubmit || serverSnapshot.hasSubmitted || submitBusy;

		reconcileTargets();
		reconcileHistory();
	}

	function applyServerSnapshot(game) {
		const mafiaState = game && game.mafia_state ? game.mafia_state : {};
		serverSnapshot.phase = String(mafiaState.phase || 'start');
		serverSnapshot.roundNumber = Number(mafiaState.round_number || 1);
		serverSnapshot.phaseTitle = String(mafiaState.phase_title || 'Mafia');
		serverSnapshot.phaseInstructions = String(mafiaState.phase_instructions || '');
		serverSnapshot.selfRole = String(mafiaState.self_role || 'town');
		serverSnapshot.selfIsAlive = !!mafiaState.self_is_alive;
		serverSnapshot.submissionActionType = mafiaState.submission_action_type || null;
		serverSnapshot.suggestionActionType = mafiaState.suggestion_action_type || null;
		serverSnapshot.voteActionType = mafiaState.vote_action_type || null;
		serverSnapshot.canSubmit = !!mafiaState.can_submit;
		serverSnapshot.hasSubmitted = !!mafiaState.has_submitted;
		serverSnapshot.currentSuggestionTargetUserId = mafiaState.current_suggestion_target_user_id == null ? null : Number(mafiaState.current_suggestion_target_user_id);
		serverSnapshot.currentDisplaySuggestionTargetUserId = mafiaState.current_display_suggestion_target_user_id == null ? null : Number(mafiaState.current_display_suggestion_target_user_id);
		serverSnapshot.currentVoteTargetUserId = mafiaState.current_vote_target_user_id == null ? null : Number(mafiaState.current_vote_target_user_id);
		serverSnapshot.submittedCount = Number(mafiaState.submitted_count || 0);
		serverSnapshot.requiredCount = Number(mafiaState.required_count || 0);
		serverSnapshot.players = Array.isArray(mafiaState.players) ? mafiaState.players.slice() : [];
		serverSnapshot.latestResult = mafiaState.latest_result || null;
		serverSnapshot.recentResults = Array.isArray(mafiaState.recent_results) ? mafiaState.recent_results.slice() : [];
		serverSnapshot.winnerSummary = mafiaState.winner_summary || null;
		serverSnapshot.status = String((game && game.status) || 'open');

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
			await fetchAndApplyGameDetail();
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

	async function submitReadyAction() {
		if (!lastGameId || submitBusy || serverSnapshot.phase !== 'start' || !serverSnapshot.submissionActionType) {
			return;
		}

		submitBusy = true;
		reconcileUi();
		try {
			await deps.api.sendAction(lastGameId, serverSnapshot.submissionActionType, {});
			await fetchAndApplyGameDetail();
			setStatusNode('Ready submitted.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to submit mafia action.', 'error');
		} finally {
			submitBusy = false;
			reconcileUi();
		}
	}

	async function submitLiveAction(targetUserId, kind) {
		if (!lastGameId || submitBusy) {
			return;
		}

		const player = targetPlayerById(targetUserId);
		const actionType = kind === 'suggest' ? serverSnapshot.suggestionActionType : serverSnapshot.voteActionType;
		if (!canSendLiveAction(actionType, player)) {
			return;
		}

		submitBusy = true;
		pendingAction = {
			kind: kind,
			targetUserId: Number(targetUserId),
		};
		reconcileUi();
		try {
			await deps.api.sendAction(lastGameId, actionType, {
				target_user_id: Number(targetUserId),
			});
			await fetchAndApplyGameDetail();
			setStatusNode(kind === 'suggest' ? 'Suggestion updated.' : 'Vote updated.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to update mafia action.', 'error');
		} finally {
			pendingAction = null;
			submitBusy = false;
			reconcileUi();
		}
	}

	async function withdrawVote() {
		if (!lastGameId || !canWithdrawVote()) {
			return;
		}

		submitBusy = true;
		pendingAction = {
			kind: 'withdraw',
			targetUserId: Number(serverSnapshot.currentVoteTargetUserId || 0),
		};
		reconcileUi();
		try {
			await deps.api.sendAction(lastGameId, serverSnapshot.voteActionType, {
				clear: true,
			});
			await fetchAndApplyGameDetail();
			setStatusNode('Vote withdrawn.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to withdraw vote.', 'error');
		} finally {
			pendingAction = null;
			submitBusy = false;
			reconcileUi();
		}
	}

	refreshBtn.addEventListener('click', function onRefreshClick() {
		refreshMafiaState({ silent: false });
	});

	readyBtn.addEventListener('click', submitReadyAction);
	withdrawVoteBtn.addEventListener('click', withdrawVote);

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
