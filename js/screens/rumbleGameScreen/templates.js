import { createGameActionButtonMarkup } from '../gameActionButtons.js';

export const RUMBLE_PANEL_HTML = `
	<div class="card">
		<div class="row">
			<h3 class="rumble-phase-heading" data-ref="phaseTitle">
				<img class="mafia-game-state-icon" data-ref="phaseTitleIcon" alt="" aria-hidden="true">
				<span data-ref="phaseTitleText">Rumble Bidding</span>
			</h3>
			<img class="player-icon mafia-player-icon" data-ref="phaseIcon" alt="" style="display:none;">
			<div data-ref="headerSpacer"></div>
			${createGameActionButtonMarkup('refresh', 'refreshBtn', '')}
		</div>
		<p class="top-user-label" data-ref="progressText">Bidding submissions: 0/0</p>
		<div data-ref="shipNameMount"></div>
		<div data-ref="biddingMount"></div>
		<div data-ref="victoryMount"></div>
		<div data-ref="battleMount"></div>
		<div data-ref="phaseControlsMount"></div>
		<div data-ref="eventLogsMount"></div>
		<div data-ref="adminCheatMount"></div>
	</div>
`;
