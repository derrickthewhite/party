import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from './dom.js';
import { setPlayerIconImage } from '../playerIcons.js';

const SIDEBAR_HTML = `
	<aside class="participant-sidebar card">
		<h3 class="participant-sidebar-title">Participants</h3>
		<div class="participant-sidebar-section">
			<div class="participant-sidebar-heading">Players</div>
			<div class="participant-sidebar-list" data-ref="playersList"></div>
			<p class="participant-sidebar-empty" data-ref="playersEmpty">No players yet.</p>
		</div>
		<div class="participant-sidebar-section">
			<div class="participant-sidebar-heading">Observers</div>
			<div class="participant-sidebar-list" data-ref="observersList"></div>
			<p class="participant-sidebar-empty" data-ref="observersEmpty">No observers.</p>
		</div>
	</aside>
`;

const MEMBER_ROW_TEMPLATE_HTML = `
	<div class="participant-sidebar-item">
		<div class="participant-sidebar-identity">
			<img class="player-icon participant-sidebar-icon" data-ref="icon" alt="">
			<div class="participant-sidebar-name-meta">
				<div data-ref="name"></div>
				<small data-ref="meta"></small>
			</div>
		</div>
	</div>
`;

function normalizeMembers(game) {
	return Array.isArray(game && game.members) ? game.members.slice() : [];
}

function normalizeRole(member) {
	return String(member && member.role ? member.role : '').toLowerCase() === 'observer' ? 'observer' : 'player';
}

function memberId(member) {
	return Number(member && (member.user_id ?? member.id) ? (member.user_id ?? member.id) : 0);
}

function displayName(member) {
	return String(member && member.username ? member.username : 'Unknown');
}

export function createGameParticipantsSidebarController() {
	const root = createNodeFromHtml(SIDEBAR_HTML);
	const refs = collectRefs(root);
	const memberRowTemplate = createTemplate(MEMBER_ROW_TEMPLATE_HTML);
	const playerRowRefsByKey = new Map();
	const observerRowRefsByKey = new Map();
	let currentGame = null;

	function ensureMemberRow(rowRefsByKey, key) {
		if (rowRefsByKey.has(key)) {
			return rowRefsByKey.get(key);
		}

		const row = cloneTemplateNode(memberRowTemplate);
		const nextRefs = collectRefs(row);
		nextRefs.row = row;
		rowRefsByKey.set(key, nextRefs);
		return nextRefs;
	}

	function reconcileList(listNode, rowRefsByKey, activeMembers, emptyNode) {
		const activeKeys = new Set();
		activeMembers.forEach(function eachMember(member, index) {
			const key = String(memberId(member)) + ':' + normalizeRole(member);
			activeKeys.add(key);
			const rowRefs = ensureMemberRow(rowRefsByKey, key);
			const isOwner = memberId(member) === Number(currentGame && currentGame.owner_user_id ? currentGame.owner_user_id : 0);
			const roleBits = [];
			if (isOwner) {
				roleBits.push('Owner');
			}
			if (String(member.role || '').toLowerCase() === 'observer') {
				roleBits.push('Observer');
			}

			setPlayerIconImage(rowRefs.icon, member && member.icon_key ? member.icon_key : null, displayName(member));
			rowRefs.name.textContent = displayName(member);
			rowRefs.meta.textContent = roleBits.join(' | ');
			if (!rowRefs.meta.textContent) {
				rowRefs.meta.textContent = 'Active';
			}

			if (listNode.children[index] !== rowRefs.row) {
				listNode.appendChild(rowRefs.row);
			}
		});

		Array.from(rowRefsByKey.keys()).forEach(function eachKey(key) {
			if (activeKeys.has(key)) {
				return;
			}

			const rowRefs = rowRefsByKey.get(key);
			if (rowRefs && rowRefs.row.parentNode) {
				rowRefs.row.parentNode.removeChild(rowRefs.row);
			}
			rowRefsByKey.delete(key);
		});

		emptyNode.style.display = activeMembers.length > 0 ? 'none' : '';
	}

	function reconcile() {
		const members = normalizeMembers(currentGame);
		const players = members.filter(function eachMember(member) {
			return normalizeRole(member) !== 'observer';
		}).sort(function sortPlayers(a, b) {
			return displayName(a).localeCompare(displayName(b));
		});
		const observers = members.filter(function eachMember(member) {
			return normalizeRole(member) === 'observer';
		}).sort(function sortObservers(a, b) {
			return displayName(a).localeCompare(displayName(b));
		});

		reconcileList(refs.playersList, playerRowRefsByKey, players, refs.playersEmpty);
		reconcileList(refs.observersList, observerRowRefsByKey, observers, refs.observersEmpty);
	}

	return {
		root,
		setGame: function setGame(game) {
			currentGame = game || null;
			reconcile();
		},
	};
}