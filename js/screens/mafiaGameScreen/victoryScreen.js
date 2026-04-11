import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { setPlayerIconImage } from '../../playerIcons.js';
import { placeChildAt } from '../rumbleGameScreen/normalization.js';

const MAFIA_VICTORY_HTML = `
	<section class="mafia-victory-card" data-ref="section" style="display: none;">
		<div class="mafia-victory-eyebrow">Victory</div>
		<h3 class="mafia-victory-title" data-ref="winnerTitle">Winner</h3>
		<p class="mafia-victory-summary" data-ref="winnerSummary"></p>
		<div class="mafia-victory-columns">
			<section class="mafia-victory-team mafia-victory-team-town">
				<div class="mafia-victory-team-header">
					<h4>Town</h4>
					<span class="mafia-victory-team-count" data-ref="townCount"></span>
				</div>
				<div class="list mafia-victory-team-list" data-ref="townList"></div>
			</section>
			<section class="mafia-victory-team mafia-victory-team-mafia">
				<div class="mafia-victory-team-header">
					<h4>Mafia</h4>
					<span class="mafia-victory-team-count" data-ref="mafiaCount"></span>
				</div>
				<div class="list mafia-victory-team-list" data-ref="mafiaList"></div>
			</section>
		</div>
	</section>
`;

const MAFIA_VICTORY_PLAYER_ROW_HTML = `
	<div class="mafia-victory-player-row">
		<img class="player-icon mafia-victory-player-icon" data-ref="icon" alt="">
		<div class="mafia-victory-player-copy">
			<div class="mafia-victory-player-name" data-ref="name"></div>
			<small class="mafia-victory-player-status" data-ref="status"></small>
		</div>
	</div>
`;

function winnerKeyFromEntries(entries) {
	const winner = entries.find(function eachEntry(entry) {
		return String(entry && entry.result_status ? entry.result_status : '') === 'winner'
			|| Number(entry && entry.final_rank ? entry.final_rank : 0) === 1;
	});

	return winner ? String(winner.role || '') : '';
}

function winnerTitleFromEntries(entries) {
	const winnerKey = winnerKeyFromEntries(entries);
	if (winnerKey === 'mafia') {
		return 'Mafia Wins';
	}
	if (winnerKey === 'town') {
		return 'Town Wins';
	}
	return 'Game Over';
}

function playerStatusText(entry) {
	const eliminatedRound = entry && Object.prototype.hasOwnProperty.call(entry, 'eliminated_round')
		? entry.eliminated_round
		: null;
	const isWinner = String(entry && entry.result_status ? entry.result_status : '') === 'winner'
		|| Number(entry && entry.final_rank ? entry.final_rank : 0) === 1;

	if (eliminatedRound === null || eliminatedRound === undefined) {
		return isWinner ? 'Survived to victory' : 'Survived';
	}

	return 'Eliminated in round ' + String(Number(eliminatedRound || 0));
}

function teamCountLabel(entries) {
	const count = Array.isArray(entries) ? entries.length : 0;
	return String(count) + ' ' + (count === 1 ? 'player' : 'players');
}

export function createMafiaVictoryScreenController(context) {
	const root = createNodeFromHtml(MAFIA_VICTORY_HTML);
	const refs = collectRefs(root);
	const playerTemplate = createTemplate(MAFIA_VICTORY_PLAYER_ROW_HTML);
	const playerRowsById = new Map();

	function reconcileTeam(listNode, entries, active) {
		entries.forEach(function eachEntry(entry, index) {
			const userId = Number(entry && entry.user_id ? entry.user_id : 0);
			const key = userId > 0 ? String(userId) : ('idx:' + String(index) + ':' + String(entry && entry.role ? entry.role : 'team'));
			active.add(key);

			let rowRefs = playerRowsById.get(key);
			if (!rowRefs) {
				const row = cloneTemplateNode(playerTemplate);
				const childRefs = collectRefs(row);
				rowRefs = {
					row,
					icon: childRefs.icon,
					name: childRefs.name,
					status: childRefs.status,
				};
				playerRowsById.set(key, rowRefs);
			}

			setPlayerIconImage(rowRefs.icon, entry && entry.icon_key ? entry.icon_key : null, entry && entry.username ? entry.username : 'Player');
			rowRefs.icon.setAttribute('alt', String(entry && entry.username ? entry.username : 'Player'));
			rowRefs.name.textContent = String(entry && entry.username ? entry.username : 'Unknown');
			rowRefs.status.textContent = playerStatusText(entry);
			placeChildAt(listNode, rowRefs.row, index);
		});
	}

	function reconcile() {
		const standings = Array.isArray(context.serverSnapshot.finalStandings)
			? context.serverSnapshot.finalStandings
			: [];
		const hasStandings = standings.length > 0;
		const townEntries = standings.filter(function eachEntry(entry) {
			return String(entry && entry.role ? entry.role : '') !== 'mafia';
		});
		const mafiaEntries = standings.filter(function eachEntry(entry) {
			return String(entry && entry.role ? entry.role : '') === 'mafia';
		});
		const active = new Set();

		root.style.display = hasStandings ? '' : 'none';
		if (!hasStandings) {
			Array.from(playerRowsById.keys()).forEach(function eachKey(key) {
				const rowRefs = playerRowsById.get(key);
				if (rowRefs && rowRefs.row.parentNode) {
					rowRefs.row.parentNode.removeChild(rowRefs.row);
				}
				playerRowsById.delete(key);
			});
			return;
		}

		refs.winnerTitle.textContent = winnerTitleFromEntries(standings);
		refs.winnerSummary.textContent = String(context.serverSnapshot.winnerSummary || 'Final teams');
		refs.townCount.textContent = teamCountLabel(townEntries);
		refs.mafiaCount.textContent = teamCountLabel(mafiaEntries);

		reconcileTeam(refs.townList, townEntries, active);
		reconcileTeam(refs.mafiaList, mafiaEntries, active);

		Array.from(playerRowsById.keys()).forEach(function eachKey(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = playerRowsById.get(key);
			if (rowRefs && rowRefs.row.parentNode) {
				rowRefs.row.parentNode.removeChild(rowRefs.row);
			}
			playerRowsById.delete(key);
		});
	}

	return {
		root,
		reconcile,
	};
}