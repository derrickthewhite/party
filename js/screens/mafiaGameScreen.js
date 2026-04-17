import { cloneTemplateNode, collectRefs, createNodeFromHtml, createTemplate } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';
import { createGameActionButtonMarkup, setGameActionButtonLabel } from './gameActionButtons.js';
import { playerIconLabel, setPlayerIconImage } from '../playerIcons.js';
import { buttonIconUrl } from '../buttonIcons.js';
import { ensureActionTypeIcon } from './gameActionButtons.js';
import { collectGameInfoIcons, setGameInfoIconNode } from '../gameStateIcons.js';
import { MAFIA_REFRESH_MS } from '../config.js';
import { createMafiaVictoryScreenController } from './mafiaGameScreen/victoryScreen.js';
import { showGameIconPickerModal } from './gameIconPickerModal.js';

const MAFIA_PANEL_HTML = `
	<div class="card mafia-panel">
		<div class="row">
			<h3 data-ref="phaseTitle"><img class="mafia-game-state-icon" data-ref="phaseTitleIcon" alt="" aria-hidden="true"></h3>
			<img class="player-icon mafia-player-icon" data-ref="phaseIcon" alt="">
			<div data-ref="headerSpacer"></div>
			${createGameActionButtonMarkup('refresh', 'refreshBtn', '')}
		</div>
		<p class="top-user-label" data-ref="roleText"></p>
		<p data-ref="phaseText"></p>
		<p class="top-user-label" data-ref="progressText"></p> 
		<p class="top-user-label" data-ref="setupNote"></p>
		<div class="mafia-setup-control" data-ref="setupControl" style="display:none">
			<label class="radio-inline"><input type="radio" name="mafiaSetupMode" data-ref="setupAuto" value="auto"> <span>Auto (<span data-ref="autoPreview"></span>)</span></label>
			<label class="radio-inline"><input type="radio" name="mafiaSetupMode" data-ref="setupCustom" value="custom"> <span>Custom</span></label>
			<input type="number" min="1" data-ref="customCount" class="small" />
			<button data-ref="saveSetupBtn">Save</button>
			<small data-ref="setupStatus"></small>
		</div>
		<div class="mafia-summary" data-ref="latestSummary"></div>
		<div data-ref="victoryMount"></div>
		<div class="mafia-ready-card" data-ref="readyCard">
			<p data-ref="readyText"></p>
			<div class="mafia-icon-row" data-ref="iconRow">
				<div class="mafia-icon-chip">
					<img class="player-icon mafia-icon-preview" data-ref="iconPreview" alt="">
					<div>
						<div class="mafia-icon-label" data-ref="iconLabel"></div>
						<small class="mafia-target-meta" data-ref="iconHint"></small>
					</div>
				</div>
				${createGameActionButtonMarkup('change-icon', 'changeIconBtn', 'mafia-icon-action-button')}
			</div>
			<div class="row mobile-stack">
				<button class="primary" data-ref="readyBtn">I&apos;m Ready</button>
			</div>
		</div>
		<div class="mafia-vote-card" data-ref="voteCard">
			<div class="row mobile-stack mafia-selection-row">
				<p class="mafia-selection-text" data-ref="voteText"></p>
				${createGameActionButtonMarkup('withdraw-vote', 'withdrawVoteBtn', 'mafia-vote-action-button')}
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
		<div class="mafia-target-identity">
			<img class="player-icon mafia-target-icon" data-ref="icon" alt="">
			<div class="mafia-target-copy">
				<div class="mafia-target-main">
					<div class="mafia-target-name" data-ref="name"></div>
					<small class="mafia-target-meta" data-ref="meta"></small>
				</div>
				<div class="mafia-target-state" data-ref="suggestions"></div>
				<div class="mafia-target-votes" data-ref="votes"></div>
			</div>
		</div>
		<div class="mafia-target-actions" data-ref="actions">
			${createGameActionButtonMarkup('suggest', 'suggestBtn', 'button-ready mafia-target-action-button')}
			${createGameActionButtonMarkup('vote', 'voteBtn', 'primary mafia-target-action-button')}
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
	const phaseIcon = refs.phaseIcon;
	const phaseTitleIcon = refs.phaseTitleIcon;
	const roleText = refs.roleText;
	const phaseText = refs.phaseText;
	const progressText = refs.progressText;
	const setupNote = refs.setupNote;
	const latestSummary = refs.latestSummary;
	const victoryMount = refs.victoryMount;
	const readyCard = refs.readyCard;
	const readyText = refs.readyText;
	const iconRow = refs.iconRow;
	const iconPreview = refs.iconPreview;
	const iconLabel = refs.iconLabel;
	const iconHint = refs.iconHint;
	const changeIconBtn = refs.changeIconBtn;
	const readyBtn = refs.readyBtn;
	const voteCard = refs.voteCard;
	const voteText = refs.voteText;
	const withdrawVoteBtn = refs.withdrawVoteBtn;
	const targetsList = refs.targetsList;
	const emptyTargets = refs.emptyTargets;
	const historyList = refs.historyList;
	const emptyHistory = refs.emptyHistory;
	const setupControl = refs.setupControl;
	const setupAuto = refs.setupAuto;
	const setupCustom = refs.setupCustom;
	const customCount = refs.customCount;
	const saveSetupBtn = refs.saveSetupBtn;
	const setupStatus = refs.setupStatus;
	const autoPreview = refs.autoPreview;

	refs.headerSpacer.style.flex = '1';
	panel.style.marginTop = '8px';

	let lastGameId = null;
	let refreshBusy = false;
	let submitBusy = false;
	let iconBusy = false;
	let autoRefreshId = null;
	let pendingAction = null;
	let setupInputsDirty = false;
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
		finalStandings: null,
		status: 'open',
		iconCatalog: [],
		setupPlayerCount: 0,
		setupMafiaCount: 0,
	};

	const targetRowsByUserId = new Map();
	const resultRowsByKey = new Map();
	const victoryScreenController = createMafiaVictoryScreenController({ serverSnapshot });
	victoryMount.appendChild(victoryScreenController.root);

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

	function buildIncomingActionText(prefix, usernames) {
		const items = Array.isArray(usernames) ? usernames.filter(Boolean) : [];
		return items.length > 0 ? prefix + items.join(', ') : '';
	}

	function buildSetupNoteText() {
		const playerCount = Number(serverSnapshot.setupPlayerCount || 0);
		const mafiaCount = Number(serverSnapshot.setupMafiaCount || 0);

		if (playerCount <= 0 || mafiaCount <= 0) {
			return '';
		}

		const mafiaLabel = mafiaCount === 1 ? 'mafia member' : 'mafia members';
		const playerLabel = playerCount === 1 ? 'player' : 'players';
		if (serverSnapshot.mafiaSetupMode === 'custom') {
			return 'The game has ' + playerCount + ' ' + playerLabel + ' and is set to start with ' + mafiaCount + ' ' + mafiaLabel + '.';
		}
		return 'With ' + playerCount + ' ' + playerLabel + ', the game will start with ' + mafiaCount + ' ' + mafiaLabel + '.';
	}

	function renderIncomingIcons(container, identifiers) {
		// identifiers may be usernames or numeric user_ids
		container.replaceChildren();
		const items = Array.isArray(identifiers) ? identifiers.filter(Boolean) : [];
		if (items.length === 0) {
			container.style.display = 'none';
			return;
		}
		container.style.display = '';
		items.forEach(function eachId(id) {
			let player = null;
			if (typeof id === 'number' || String(Number(id)) === String(id)) {
				player = serverSnapshot.players.find(function p(x) { return Number(x.user_id) === Number(id); }) || null;
			} else {
				player = serverSnapshot.players.find(function p(x) { return String(x.username || '') === String(id); }) || null;
			}

			if (player) {
				const img = document.createElement('img');
				img.className = 'player-icon mafia-target-meta-icon';
				img.setAttribute('alt', String(player.username || ''));
				setPlayerIconImage(img, player.icon_key || null, player.username || 'Player');
				img.title = String(player.username || 'Player');
				container.appendChild(img);
			} else {
				const span = document.createElement('span');
				span.className = 'mafia-target-meta-text';
				span.textContent = String(id);
				container.appendChild(span);
			}
		});
	}

	function canChangeIcon() {
		return !!lastGameId
			&& serverSnapshot.status === 'open'
			&& Array.isArray(serverSnapshot.iconCatalog)
			&& serverSnapshot.iconCatalog.length > 0
			&& !iconBusy;
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
		// Ensure the current player is always rendered first in the targets list
		const playersOrdered = Array.isArray(serverSnapshot.players)
			? serverSnapshot.players.slice().sort(function (a, b) {
				if (a && a.is_self && !(b && b.is_self)) return -1;
				if (b && b.is_self && !(a && a.is_self)) return 1;
				return 0;
			})
			: [];

		playersOrdered.forEach(function eachPlayer(player) {
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

			const isSelfSuggested = viewerSuggestionTargetUserId === userId;
			const isSelfVoted = viewerVoteTargetUserId === userId;
			const isPendingSuggestion = pendingAction && pendingAction.kind === 'suggest' && pendingAction.targetUserId === userId;
			const isPendingVote = pendingAction && pendingAction.kind === 'vote' && pendingAction.targetUserId === userId;
			// Allow suggestions while a vote exists; allow voting even if a suggestion exists.
			const canSuggest = canSendLiveAction(serverSnapshot.suggestionActionType, player) && !isSelfSuggested;
			const canVote = canSendLiveAction(serverSnapshot.voteActionType, player) && !isSelfVoted;

			setPlayerIconImage(rowRefs.icon, player && player.icon_key ? player.icon_key : null, player && player.username ? player.username : 'Player');
			rowRefs.name.textContent = String(player.username || 'Unknown');
			// Render icon avatars for suggesters/voters when available; fall back to text
			const suggestionItems = player && (player.incoming_suggestion_user_ids || player.incoming_suggestion_usernames || []) || [];
			renderIncomingIcons(rowRefs.suggestions, suggestionItems);
			if (Array.isArray(suggestionItems) && suggestionItems.length > 0) {
				try { ensureActionTypeIcon(rowRefs.suggestions, 'suggest', 'Suggestions'); } catch (e) { /* ignore */ }
			} else {
				// remove any leftover icon if present
				const old = rowRefs.suggestions.querySelector('.mafia-action-type-icon');
				if (old && old.remove) old.remove();
			}

			const voteItems = player && (player.incoming_vote_user_ids || player.incoming_vote_usernames || []) || [];
			renderIncomingIcons(rowRefs.votes, voteItems);
			if (Array.isArray(voteItems) && voteItems.length > 0) {
				try { ensureActionTypeIcon(rowRefs.votes, 'vote', 'Votes'); } catch (e) { /* ignore */ }
			} else {
				const old2 = rowRefs.votes.querySelector('.mafia-action-type-icon');
				if (old2 && old2.remove) old2.remove();
			}
			rowRefs.meta.textContent = bits.join(' | ');
			rowRefs.actions.style.display = player.is_self ? 'none' : '';
			rowRefs.row.classList.toggle('is-suggested', viewerDisplaySuggestionTargetUserId === userId);
			rowRefs.row.classList.toggle('is-voted', isSelfVoted);
			rowRefs.suggestBtn.classList.toggle('is-active', isSelfSuggested || viewerDisplaySuggestionTargetUserId === userId);
			rowRefs.voteBtn.classList.toggle('is-active', isSelfVoted);
			rowRefs.suggestBtn.classList.toggle('is-busy', !!isPendingSuggestion);
			rowRefs.voteBtn.classList.toggle('is-busy', !!isPendingVote);
			rowRefs.suggestBtn.setAttribute('aria-pressed', isSelfSuggested || viewerDisplaySuggestionTargetUserId === userId ? 'true' : 'false');
			rowRefs.voteBtn.setAttribute('aria-pressed', isSelfVoted ? 'true' : 'false');
			setGameActionButtonLabel(rowRefs.suggestBtn, isPendingSuggestion ? 'Suggesting target...' : (isSelfSuggested ? 'Suggested target' : 'Suggest target'));
			setGameActionButtonLabel(rowRefs.voteBtn, isPendingVote ? 'Voting for target...' : (isSelfVoted ? 'Voted for target' : 'Vote target'));
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
		const player = selfPlayer();
		const isLobbyOpen = serverSnapshot.status === 'open';
		const hasVictoryStandings = Array.isArray(serverSnapshot.finalStandings) && serverSnapshot.finalStandings.length > 0;

		// Render a large copy of the player's icon under the phase title when available
		if (phaseIcon) {
			if (player && player.icon_key) {
				setPlayerIconImage(phaseIcon, player.icon_key, player.username || 'Player');
				phaseIcon.style.display = '';
				phaseIcon.setAttribute('alt', String(player.username || 'Player'));
			} else {
				phaseIcon.style.display = 'none';
			}
		}

		// Replace the phase title with the appropriate game state/phase icon (retained DOM)
		try {
			const icons = collectGameInfoIcons({ game_type: 'mafia', status: serverSnapshot.status, phase: serverSnapshot.phase }, { hideInProgressWhenPhase: true });
			let iconToShow = null;
			// If the game is not currently in-progress, show the status icon (open/closed) first.
			if (String(serverSnapshot.status || '').toLowerCase() !== 'in-progress') {
				iconToShow = (icons && icons.statusIcon) ? icons.statusIcon : (icons && icons.phaseIcon ? icons.phaseIcon : null);
			} else {
				iconToShow = (icons && icons.phaseIcon) ? icons.phaseIcon : (icons && icons.statusIcon ? icons.statusIcon : null);
			}
			setGameInfoIconNode(phaseTitleIcon, iconToShow);
		} catch (e) {
			if (phaseTitleIcon) phaseTitleIcon.style.display = 'none';
		}
		if (isLobbyOpen) {
			roleText.textContent = 'Game has not started yet. Pick an icon and use chat while the lobby is open.';
		} else {
			const roleLabel = serverSnapshot.selfRole === 'mafia' ? 'Mafia' : 'Town';
			let extra = '';
			if (serverSnapshot.selfRole === 'mafia') {
				const fellows = Array.isArray(serverSnapshot.players)
					? serverSnapshot.players
						.filter(function (p) { return p && p.known_role === 'mafia' && !p.is_self; })
						.map(function (p) { return String(p.username || ''); })
						.filter(Boolean)
					: [];
				if (fellows.length > 0) {
					extra = ' Your fellow mafia: ' + fellows.join(', ') + '.';
				}
			}
			roleText.textContent = 'Your role: ' + roleLabel + extra;
		}
		phaseText.textContent = isLobbyOpen
			? 'The owner needs to start the game before roles are assigned and ready checks appear.'
			: String(serverSnapshot.phaseInstructions || '');
		if (isLobbyOpen) {
			progressText.textContent = 'Players: ' + Number(serverSnapshot.players.length || 0);
			progressText.title = '';
		} else if (serverSnapshot.phase === 'start') {
			progressText.textContent = 'Ready: ' + Number(serverSnapshot.submittedCount || 0) + '/' + Number(serverSnapshot.requiredCount || 0);
			if (Array.isArray(serverSnapshot.submittedUsernames) && serverSnapshot.submittedUsernames.length > 0) {
				progressText.title = 'Ready:\n' + serverSnapshot.submittedUsernames.join('\n');
			} else {
				progressText.title = '';
			}
		} else {
			progressText.textContent = 'Votes: ' + Number(serverSnapshot.submittedCount || 0) + '/' + Number(serverSnapshot.requiredCount || 0);
			progressText.title = '';
		}
		setupNote.textContent = isLobbyOpen ? buildSetupNoteText() : '';
		setupNote.style.display = setupNote.textContent ? '' : 'none';

		// Setup control visible only to owner/admin while lobby is open
		if (setupControl) {
			setupControl.style.display = serverSnapshot.canConfigure && isLobbyOpen ? '' : 'none';
			// Do not overwrite inputs when the user is editing or focused
			const isFocused = setupControl.contains(document.activeElement instanceof HTMLElement ? document.activeElement : null);
			if (!setupInputsDirty && !isFocused) {
				if (serverSnapshot.mafiaSetupMode === 'custom') {
					if (setupCustom) setupCustom.checked = true;
					if (setupAuto) setupAuto.checked = false;
					if (customCount) customCount.value = serverSnapshot.mafiaSetupMafiaCount != null ? String(serverSnapshot.mafiaSetupMafiaCount) : '';
				} else {
					if (setupAuto) setupAuto.checked = true;
					if (setupCustom) setupCustom.checked = false;
					if (customCount) customCount.value = serverSnapshot.setupMafiaCount ? String(serverSnapshot.setupMafiaCount) : '';
				}
			}
			if (autoPreview) {
				autoPreview.textContent = serverSnapshot.setupMafiaCount ? String(serverSnapshot.setupMafiaCount) : '—';
			}
		}

		if (hasVictoryStandings) {
			latestSummary.textContent = '';
			latestSummary.style.display = 'none';
		} else if (serverSnapshot.latestResult && serverSnapshot.latestResult.summary_text) {
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
		withdrawVoteBtn.classList.toggle('is-busy', !!(pendingAction && pendingAction.kind === 'withdraw'));
		setGameActionButtonLabel(withdrawVoteBtn, pendingAction && pendingAction.kind === 'withdraw' ? 'Withdrawing vote...' : 'Withdraw vote');

		readyCard.style.display = serverSnapshot.phase === 'start' ? '' : 'none';
		voteCard.style.display = isVotePhase() ? '' : 'none';
		readyText.textContent = isLobbyOpen
			? 'Choose the icon you want to use in this game before the host starts the round.'
			: (serverSnapshot.hasSubmitted
				? 'Ready submitted. Waiting for the rest of the table.'
				: 'Confirm that you have reviewed your role.');
		iconRow.style.display = isLobbyOpen && player ? '' : 'none';
		setPlayerIconImage(iconPreview, player && player.icon_key ? player.icon_key : null, player && player.username ? player.username : 'Player');
		iconLabel.textContent = player && player.icon_key ? playerIconLabel(player.icon_key) : 'No icon assigned yet';
		iconHint.textContent = 'Visible in chat and on every mafia player row.';
		changeIconBtn.classList.toggle('is-busy', iconBusy);
		setGameActionButtonLabel(changeIconBtn, iconBusy ? 'Saving icon...' : 'Change icon');
		changeIconBtn.disabled = !canChangeIcon();
		readyBtn.style.display = isLobbyOpen ? 'none' : '';
		readyBtn.disabled = isLobbyOpen || !serverSnapshot.canSubmit || serverSnapshot.hasSubmitted || submitBusy;

		victoryScreenController.reconcile();
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
		serverSnapshot.submittedUsernames = Array.isArray(mafiaState.submitted_usernames) ? mafiaState.submitted_usernames.slice() : [];
		serverSnapshot.players = Array.isArray(mafiaState.players) ? mafiaState.players.slice() : [];
		serverSnapshot.latestResult = mafiaState.latest_result || null;
		serverSnapshot.recentResults = Array.isArray(mafiaState.recent_results) ? mafiaState.recent_results.slice() : [];
		serverSnapshot.winnerSummary = mafiaState.winner_summary || null;
		serverSnapshot.finalStandings = Array.isArray(game && game.final_standings) ? game.final_standings.slice() : null;
		serverSnapshot.status = String((game && game.status) || 'open');
		serverSnapshot.iconCatalog = Array.isArray(game && game.icon_catalog) ? game.icon_catalog.slice() : [];
		serverSnapshot.setupPlayerCount = Number(mafiaState.setup_player_count || 0);
		serverSnapshot.setupMafiaCount = Number(mafiaState.setup_mafia_count || 0);
		serverSnapshot.mafiaSetupMode = String(mafiaState.mafia_setup_mode || 'auto');
		serverSnapshot.mafiaSetupMafiaCount = mafiaState.mafia_setup_mafia_count == null ? null : Number(mafiaState.mafia_setup_mafia_count);
		serverSnapshot.canConfigure = !!(game && game.permissions && game.permissions.can_start);

		reconcileUi();
	}

	async function updateIconSelection() {
		const player = selfPlayer();
		if (!player || !canChangeIcon()) {
			return;
		}

		const selectedIconKey = await showGameIconPickerModal({
			currentIconKey: player.icon_key || null,
			iconCatalog: serverSnapshot.iconCatalog,
			title: 'Choose your icon',
			message: 'Pick the icon that should represent you in chat and on the mafia player list.',
		});
		if (!selectedIconKey || String(selectedIconKey) === String(player.icon_key || '')) {
			return;
		}

		iconBusy = true;
		reconcileUi();
		try {
			await deps.api.setGameIcon(lastGameId, selectedIconKey);
			await fetchAndApplyGameDetail();
			setStatusNode('Icon updated.', 'ok');
		} catch (err) {
			setStatusNode(err.message || 'Unable to update icon.', 'error');
		} finally {
			iconBusy = false;
			reconcileUi();
		}
	}

	async function updateSetupSelection() {
		if (!lastGameId || !serverSnapshot.canConfigure) return;

		const mode = setupCustom && setupCustom.checked ? 'custom' : 'auto';
		let count = null;
		if (mode === 'custom') {
			const raw = customCount && customCount.value ? Number(customCount.value) : 0;
			if (!raw || raw < 1) {
				setStatusNode('Please enter a valid mafia count (>=1).', 'error');
				return;
			}
			count = Number(raw);
		}

		saveSetupBtn.disabled = true;
		setupStatus.textContent = 'Saving...';
		try {
			await deps.api.setGameSettings(lastGameId, {
				mafia_setup_mode: mode,
				mafia_setup_mafia_count: count,
			});
			await fetchAndApplyGameDetail();
			setStatusNode('Mafia setup saved.', 'ok');
			// clear local dirty state after successful save
			setupInputsDirty = false;
		} catch (err) {
			setStatusNode(err.message || 'Unable to save mafia setup.', 'error');
		} finally {
			saveSetupBtn.disabled = false;
			setupStatus.textContent = '';
		}
	}

	async function refreshMafiaState(options) {
		if (!lastGameId || refreshBusy) {
			return;
		}

		const config = options || {};
		refreshBusy = true;
		refreshBtn.disabled = true;
		setGameActionButtonLabel(refreshBtn, 'Refreshing...');
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
			setGameActionButtonLabel(refreshBtn, 'Refresh');
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
		}, MAFIA_REFRESH_MS);
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
			// If the action was a vote, attempt to clear any existing suggestion for this player.
			if (kind === 'vote' && serverSnapshot.suggestionActionType) {
				try {
					await deps.api.sendAction(lastGameId, serverSnapshot.suggestionActionType, {
						//target_user_id: Number(targetUserId),
						clear: true,
					});
				} catch (e) {
					// ignore clear error; we'll re-fetch below
				}
			}
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
					//target_user_id: Number(serverSnapshot.currentVoteTargetUserId || 0),
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
	changeIconBtn.addEventListener('click', updateIconSelection);
	withdrawVoteBtn.addEventListener('click', withdrawVote);

	if (saveSetupBtn) {
		saveSetupBtn.addEventListener('click', updateSetupSelection);
	}

	// Track user edits so refreshes don't clobber inputs
	if (setupAuto) setupAuto.addEventListener('change', function () { setupInputsDirty = true; });
	if (setupCustom) setupCustom.addEventListener('change', function () { setupInputsDirty = true; });
	if (customCount) customCount.addEventListener('input', function () { setupInputsDirty = true; });

	const screen = createBaseGameScreen(deps, {
		title: 'Mafia Game',
		titleSuffix: 'Mafia',
		showActionComposer: false,
		showParticipantsPanel: true,
		showLobbyIconChooser: false,
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
