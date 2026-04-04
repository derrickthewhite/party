import { cloneTemplateNode, collectRefs, createNodeFromHtml, createTemplate } from './dom.js';
import { createBaseGameScreen } from './gameScreen.js';
import { playerIconGroupKey, playerIconGroupLabel, playerIconLabel, setPlayerIconImage } from '../playerIcons.js';

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
			<div class="mafia-icon-row" data-ref="iconRow">
				<div class="mafia-icon-chip">
					<img class="player-icon mafia-icon-preview" data-ref="iconPreview" alt="">
					<div>
						<div class="mafia-icon-label" data-ref="iconLabel"></div>
						<small class="mafia-target-meta" data-ref="iconHint"></small>
					</div>
				</div>
				<button data-ref="changeIconBtn">Change Icon</button>
			</div>
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
		<div class="mafia-target-identity">
			<img class="player-icon mafia-target-icon" data-ref="icon" alt="">
			<div class="mafia-target-copy">
				<div class="mafia-target-name" data-ref="name"></div>
				<div class="mafia-target-state" data-ref="suggestions"></div>
				<div class="mafia-target-votes" data-ref="votes"></div>
				<small class="mafia-target-meta" data-ref="meta"></small>
			</div>
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

	refs.headerSpacer.style.flex = '1';
	panel.style.marginTop = '8px';

	let lastGameId = null;
	let refreshBusy = false;
	let submitBusy = false;
	let iconBusy = false;
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
		iconCatalog: [],
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

	function buildIncomingActionText(prefix, usernames) {
		const items = Array.isArray(usernames) ? usernames.filter(Boolean) : [];
		return items.length > 0 ? prefix + items.join(', ') : '';
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

	const ICON_PICKER_MODAL_HTML = `
	<div class="modal-overlay" data-ref="overlay">
		<div class="modal-card modal-card-wide mafia-icon-modal" role="dialog" aria-modal="true" aria-label="Choose icon" data-ref="dialog">
			<h3 data-ref="title">Choose your icon</h3>
			<p class="modal-message" data-ref="message">Pick the icon that should represent you in chat and on the mafia player list.</p>
			<div class="mafia-icon-tabs" role="tablist" data-ref="tabList"></div>
			<div class="mafia-icon-panel" role="tabpanel" aria-label="Available icons" data-ref="panel">
				<div class="mafia-icon-grid" data-ref="grid"></div>
			</div>
			<div class="modal-actions" data-ref="actions">
				<button data-ref="cancelBtn">Cancel</button>
			</div>
		</div>
	</div>
	`;

	function showIconPickerModal(currentIconKey, iconCatalog) {
		const availableIcons = Array.isArray(iconCatalog) ? iconCatalog.slice() : [];
		const normalizedCurrentIconKey = typeof currentIconKey === 'string' ? currentIconKey.trim() : '';
		const iconGroupsByKey = new Map();
		availableIcons.forEach(function eachIcon(iconKey) {
			const groupKey = playerIconGroupKey(iconKey);
			if (!iconGroupsByKey.has(groupKey)) {
				iconGroupsByKey.set(groupKey, {
					key: groupKey,
					label: playerIconGroupLabel(groupKey),
					icons: [],
				});
			}

			iconGroupsByKey.get(groupKey).icons.push(iconKey);
		});

		const tabGroups = Array.from(iconGroupsByKey.values()).sort(function compareIconGroups(left, right) {
			if (left.key === '' && right.key !== '') {
				return -1;
			}
			if (left.key !== '' && right.key === '') {
				return 1;
			}

			return left.label.localeCompare(right.label);
		});
		let activeGroupKey = tabGroups.find(function hasCurrentSelection(group) {
			return group.icons.some(function isCurrentIcon(iconKey) {
				return String(iconKey) === String(normalizedCurrentIconKey);
			});
		})?.key || (tabGroups[0] ? tabGroups[0].key : '');
		const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

		return new Promise(function resolveSelection(resolve) {
			const modal = createNodeFromHtml(ICON_PICKER_MODAL_HTML);
			const refs = collectRefs(modal);
			const overlay = refs.overlay;
			const tabList = refs.tabList;
			const panel = refs.panel;
			const grid = refs.grid;
			const cancelBtn = refs.cancelBtn;

			let closed = false;

			function close(result) {
				if (closed) return;
				closed = true;
				document.removeEventListener('keydown', onKeyDown);
				if (modal && modal.remove) modal.remove();
				if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') {
					priorFocus.focus();
				}
				resolve(result);
			}

			function onKeyDown(event) {
				if (event.key === 'Escape') {
					close(null);
				}
			}

			function iconOptionsForActiveGroup() {
				const activeGroup = tabGroups.find(function matchesActiveGroup(group) {
					return group.key === activeGroupKey;
				});

				return activeGroup ? activeGroup.icons : [];
			}

			function focusActiveTabButton() {
				const activeTabButton = tabList.querySelector('[data-group-key="' + CSS.escape(activeGroupKey) + '"]');
				if (activeTabButton instanceof HTMLElement) activeTabButton.focus();
			}

			function focusSelectedOption() {
				const selectedOption = grid.querySelector('.mafia-icon-option.is-selected') || grid.querySelector('.mafia-icon-option');
				if (selectedOption instanceof HTMLElement) selectedOption.focus();
			}

			function renderActiveGroup() {
				grid.replaceChildren();
				Array.from(tabList.querySelectorAll('.mafia-icon-tab')).forEach(function syncTabState(tabButton) {
					const isActive = tabButton.getAttribute('data-group-key') === activeGroupKey;
					tabButton.classList.toggle('is-active', isActive);
					tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
					tabButton.tabIndex = isActive ? 0 : -1;
				});

				iconOptionsForActiveGroup().forEach(function eachIcon(iconKey) {
					const option = document.createElement('button');
					option.type = 'button';
					option.className = 'mafia-icon-option';
					option.classList.toggle('is-selected', String(iconKey) === String(normalizedCurrentIconKey));

					const icon = document.createElement('img');
					icon.className = 'player-icon mafia-icon-option-image';
					icon.setAttribute('aria-hidden', 'true');
					setPlayerIconImage(icon, iconKey, 'Player');

					const label = document.createElement('span');
					label.textContent = playerIconLabel(iconKey);

					option.appendChild(icon);
					option.appendChild(label);
					option.addEventListener('click', function onSelect() { close(iconKey); });
					grid.appendChild(option);
				});

				panel.scrollTop = 0;
			}

			function setActiveGroup(nextGroupKey, focusTarget) {
				if (!tabGroups.some(function hasGroup(group) { return group.key === nextGroupKey; })) return;
				activeGroupKey = nextGroupKey;
				renderActiveGroup();
				if (focusTarget === 'tab') { focusActiveTabButton(); return; }
				if (focusTarget === 'option') { focusSelectedOption(); }
			}

			// build tabs
			tabGroups.forEach(function eachGroup(group, index) {
				const tabButton = document.createElement('button');
				tabButton.type = 'button';
				tabButton.className = 'mafia-icon-tab';
				tabButton.setAttribute('role', 'tab');
				tabButton.setAttribute('data-group-key', group.key);
				tabButton.id = 'mafia-icon-tab-' + String(index + 1);
				tabButton.textContent = group.label;
				tabButton.addEventListener('click', function onTabClick() { setActiveGroup(group.key, 'tab'); });
				tabButton.addEventListener('keydown', function onTabKeyDown(event) {
					if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
					event.preventDefault();
					const currentIndex = tabGroups.findIndex(function matchesCurrent(candidate) { return candidate.key === activeGroupKey; });
					if (currentIndex === -1) return;
					if (event.key === 'Home') { setActiveGroup(tabGroups[0].key, 'tab'); return; }
					if (event.key === 'End') { setActiveGroup(tabGroups[tabGroups.length - 1].key, 'tab'); return; }
					const offset = event.key === 'ArrowLeft' ? -1 : 1;
					const nextIndex = (currentIndex + offset + tabGroups.length) % tabGroups.length;
					setActiveGroup(tabGroups[nextIndex].key, 'tab');
				});
				tabList.appendChild(tabButton);
			});

			overlay.addEventListener('click', function onOverlayClick(event) { if (event.target === overlay) close(null); });
			cancelBtn.addEventListener('click', function onCancel() { close(null); });

			document.body.appendChild(modal);
			document.addEventListener('keydown', onKeyDown);

			renderActiveGroup();

			const initialFocus = grid.querySelector('.mafia-icon-option.is-selected') || grid.querySelector('.mafia-icon-option');
			if (initialFocus instanceof HTMLElement) initialFocus.focus();
		});
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

			const suggestionSummaryText = buildIncomingActionText('Suggested by ', player && player.incoming_suggestion_usernames);
			const voteSummaryText = buildIncomingActionText('Voted by ', player && player.incoming_vote_usernames);
			const isSelfSuggested = viewerSuggestionTargetUserId === userId;
			const isSelfVoted = viewerVoteTargetUserId === userId;
			const isPendingSuggestion = pendingAction && pendingAction.kind === 'suggest' && pendingAction.targetUserId === userId;
			const isPendingVote = pendingAction && pendingAction.kind === 'vote' && pendingAction.targetUserId === userId;
			const canSuggest = canSendLiveAction(serverSnapshot.suggestionActionType, player) && !isSelfSuggested && !isPendingVote;
			const canVote = canSendLiveAction(serverSnapshot.voteActionType, player) && !isSelfVoted && !isPendingSuggestion;

			setPlayerIconImage(rowRefs.icon, player && player.icon_key ? player.icon_key : null, player && player.username ? player.username : 'Player');
			rowRefs.name.textContent = String(player.username || 'Unknown');
			// Render icon avatars for suggesters/voters when available; fall back to text
			renderIncomingIcons(rowRefs.suggestions, player && (player.incoming_suggestion_user_ids || player.incoming_suggestion_usernames || []));
			rowRefs.suggestions.title = suggestionSummaryText;
			renderIncomingIcons(rowRefs.votes, player && (player.incoming_vote_user_ids || player.incoming_vote_usernames || []));
			rowRefs.votes.title = voteSummaryText;
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
		const player = selfPlayer();
		const isLobbyOpen = serverSnapshot.status === 'open';

		phaseTitle.textContent = isLobbyOpen ? 'Lobby' : String(serverSnapshot.phaseTitle || 'Mafia');
		roleText.textContent = isLobbyOpen
			? 'Game has not started yet. Pick an icon and use chat while the lobby is open.'
			: 'Your role: ' + (serverSnapshot.selfRole === 'mafia' ? 'Mafia' : 'Town');
		phaseText.textContent = isLobbyOpen
			? 'The owner needs to start the game before roles are assigned and ready checks appear.'
			: String(serverSnapshot.phaseInstructions || '');
		if (isLobbyOpen) {
			progressText.textContent = 'Players: ' + Number(serverSnapshot.players.length || 0);
		} else if (serverSnapshot.phase === 'start') {
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
		readyText.textContent = isLobbyOpen
			? 'Choose the icon you want to use in this game before the host starts the round.'
			: (serverSnapshot.hasSubmitted
				? 'Ready submitted. Waiting for the rest of the table.'
				: 'Confirm that you have reviewed your role.');
		iconRow.style.display = isLobbyOpen && player ? '' : 'none';
		setPlayerIconImage(iconPreview, player && player.icon_key ? player.icon_key : null, player && player.username ? player.username : 'Player');
		iconLabel.textContent = player && player.icon_key ? playerIconLabel(player.icon_key) : 'No icon assigned yet';
		iconHint.textContent = 'Visible in chat and on every mafia player row.';
		changeIconBtn.textContent = iconBusy ? 'Saving...' : 'Change Icon';
		changeIconBtn.disabled = !canChangeIcon();
		readyBtn.style.display = isLobbyOpen ? 'none' : '';
		readyBtn.disabled = isLobbyOpen || !serverSnapshot.canSubmit || serverSnapshot.hasSubmitted || submitBusy;

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
		serverSnapshot.iconCatalog = Array.isArray(game && game.icon_catalog) ? game.icon_catalog.slice() : [];

		reconcileUi();
	}

	async function updateIconSelection() {
		const player = selfPlayer();
		if (!player || !canChangeIcon()) {
			return;
		}

		const selectedIconKey = await showIconPickerModal(player.icon_key || null, serverSnapshot.iconCatalog);
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
	changeIconBtn.addEventListener('click', updateIconSelection);
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
