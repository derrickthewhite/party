import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { placeChildAt } from './normalization.js';

const VICTORY_SCREEN_HTML = `
	<section class="card" data-ref="section" style="display: none; margin: 10px 0 14px 0; padding: 18px; background: linear-gradient(145deg, rgba(185, 36, 36, 0.12), rgba(15, 18, 34, 0.04)); border: 1px solid rgba(185, 36, 36, 0.24);">
		<div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.75;">Victory</div>
		<h3 data-ref="winnerName" style="margin: 8px 0 4px 0; font-size: 34px; line-height: 1;">Winner</h3>
		<p data-ref="winnerShip" style="margin: 0 0 14px 0; font-size: 15px; opacity: 0.8;"></p>
		<div class="list" data-ref="participantsList"></div>
	</section>
`;

const PARTICIPANT_TEMPLATE_HTML = `
	<div class="message-item" style="display: grid; grid-template-columns: 70px minmax(0, 1.2fr) minmax(0, 1fr) 140px; gap: 10px; align-items: center;">
		<div data-ref="rank" style="font-weight: 700;"></div>
		<div>
			<div data-ref="name" style="font-weight: 600;"></div>
			<small data-ref="ship" style="opacity: 0.75;"></small>
		</div>
		<div data-ref="placement" style="font-weight: 600;"></div>
		<div data-ref="turn" style="text-align: right; opacity: 0.75;"></div>
	</div>
`;

function placementLabel(rank, total) {
	if (rank === 1) {
		return 'Champion';
	}
	if (rank === 2) {
		return 'Runner-up';
	}
	if (rank === total) {
		return 'First out';
	}
	return 'Placement';
}

export function createVictoryScreenController(context) {
	const root = createNodeFromHtml(VICTORY_SCREEN_HTML);
	const refs = collectRefs(root);
	const participantTemplate = createTemplate(PARTICIPANT_TEMPLATE_HTML);
	const participantRowsById = new Map();

	function reconcile() {
		const standings = context.serverSnapshot.finalStandings;
		const entries = standings && Array.isArray(standings.entries) ? standings.entries : [];
		const hasStandings = entries.length > 0;
		const active = new Set();
		const total = entries.length;
		const winner = hasStandings ? entries.find(function eachEntry(entry) {
			return Number(entry.rank) === 1;
		}) || entries[0] : null;

		root.style.display = hasStandings ? '' : 'none';
		refs.winnerName.textContent = winner ? String(winner.username || 'Winner') : '';
		refs.winnerShip.textContent = winner
			? 'Ship: ' + String(winner.ship_name || winner.username || 'Unknown')
			: '';

		entries.forEach(function eachEntry(entry, index) {
			const idPart = Number(entry && entry.user_id ? entry.user_id : 0);
			const key = idPart > 0 ? String(idPart) : 'idx:' + String(index);
			active.add(key);

			let rowRefs = participantRowsById.get(key);
			if (!rowRefs) {
				const line = cloneTemplateNode(participantTemplate);
				const childRefs = collectRefs(line);
				rowRefs = {
					line,
					rank: childRefs.rank,
					name: childRefs.name,
					ship: childRefs.ship,
					placement: childRefs.placement,
					turn: childRefs.turn,
				};
				participantRowsById.set(key, rowRefs);
			}

			const rank = Math.max(1, Number(entry.rank || 0));
			rowRefs.rank.textContent = '#' + String(rank);
			rowRefs.name.textContent = String(entry.username || 'Unknown');
			rowRefs.ship.textContent = String(entry.ship_name || entry.username || 'Unknown');
			rowRefs.placement.textContent = placementLabel(rank, total);
			rowRefs.turn.textContent = entry.eliminated_round === null
				? 'Survived'
				: 'Turn ' + String(Number(entry.eliminated_round || 0));
			placeChildAt(refs.participantsList, rowRefs.line, active.size - 1);
		});

		Array.from(participantRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = participantRowsById.get(key);
			if (rowRefs && rowRefs.line.parentNode === refs.participantsList) {
				refs.participantsList.removeChild(rowRefs.line);
			}
			participantRowsById.delete(key);
		});
	}

	return {
		root,
		reconcile,
	};
}