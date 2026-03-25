export const RUMBLE_PANEL_HTML = `
	<div class="card">
		<div class="row">
			<h3 data-ref="phaseTitle">Rumble Bidding</h3>
			<div data-ref="headerSpacer"></div>
			<button data-ref="refreshBtn">Refresh</button>
		</div>
		<p class="top-user-label" data-ref="progressText">Bidding submissions: 0/0</p>
		<div class="row mobile-stack" data-ref="shipNameRow" style="align-items: center; margin: 6px 0 8px 0;">
			<label style="min-width: 90px;" for="rumble-ship-name-input">Ship name</label>
			<input id="rumble-ship-name-input" type="text" maxlength="60" placeholder="Enter ship name" data-ref="shipNameInput">
			<button data-ref="saveShipNameBtn">Save Name</button>
		</div>
		<p data-ref="shipNameHint" style="margin: 0 0 8px 0; opacity: 0.85;">Leave blank to use your username.</p>
		<div data-ref="biddingPanel">
			<p data-ref="bidHelpText">Place secret bids for offered abilities. You can overbid your health, but if bidding leaves you at 0 or less you are eliminated before combat.</p>
			<p data-ref="bidValidationText"></p>
			<div class="row" style="font-weight: 600; margin-bottom: 6px; align-items: center;">
				<div style="flex: 0 0 180px;">Ability</div>
				<div style="flex: 1;">Description</div>
				<div style="width: 220px;">Bid</div>
			</div>
			<div class="list" data-ref="abilitiesList"></div>
		</div>

		<div data-ref="battlePanel">
			<p data-ref="defenseText">Defense: 0</p>
			<p data-ref="energyText">Energy: 0 | Attacks: 0 | Abilities: 0 | Remaining: 0</p>
			<p data-ref="attackHelpText">Attack allocations (enter power to send at each target):</p>
			<p data-ref="orderValidationText"></p>
			<div class="list" data-ref="playersList"></div>
			<div data-ref="abilityActivationPanel" style="margin-top: 8px;">
				<p data-ref="abilityActivationHelpText">Ability activations (activated abilities consume energy; passive/triggered abilities resolve automatically):</p>
				<p data-ref="abilityValidationText"></p>
				<div class="list" data-ref="abilityActivationList"></div>
			</div>
		</div>

		<div class="row mobile-stack" data-ref="buttonRow">
			<button class="primary" data-ref="submitBtn">Submit Bids</button>
			<button data-ref="editBtn">Edit Bids</button>
			<button data-ref="cancelBtn">Cancel Bids</button>
			<button data-ref="phaseActionBtn">End Bidding</button>
		</div>

		<h4 data-ref="lastTurnTitle">Last Turn Orders</h4>
		<div class="list" data-ref="lastTurnList">
			<p data-ref="emptyPreviousOrdersNode">No previous turn orders yet.</p>
		</div>

		<h4 data-ref="currentEventLogTitle">Current Round Events</h4>
		<div class="list" data-ref="currentEventLogList">
			<p data-ref="emptyCurrentEventLogNode">No current round events yet.</p>
		</div>

		<h4 data-ref="previousEventLogTitle">Previous Round Events</h4>
		<div class="list" data-ref="previousEventLogList">
			<p data-ref="emptyPreviousEventLogNode">No previous round events yet.</p>
		</div>
			<div class="row mobile-stack" data-ref="adminCheatToggleRow" style="display: none; align-items: center; margin: 0 0 8px 0; gap: 8px;">
			<button data-ref="adminCheatToggleBtn">Admin Cheat: Show</button>
			<small data-ref="adminCheatToggleHint" style="opacity: 0.85;">Global Admin UI must also be enabled.</small>
		</div>
		<div data-ref="adminCheatPanel" style="display: none; margin: 0 0 10px 0; padding: 10px; border: 1px dashed rgba(0, 0, 0, 0.25); border-radius: 10px; background: rgba(0, 0, 0, 0.03);">
			<div class="row mobile-stack" style="align-items: center; margin-bottom: 8px;">
				<h4 style="margin: 0;">Admin Ability Cheat</h4>
				<div data-ref="adminCheatSummary" style="margin-left: auto; opacity: 0.85;">Select a player and abilities to grant.</div>
			</div>
			<p data-ref="adminCheatHint" style="margin: 0 0 8px 0; opacity: 0.85;">Visible only to admins while Admin UI is enabled.</p>
			<div class="row mobile-stack" style="align-items: center; margin: 0 0 8px 0; gap: 8px;">
				<label for="rumble-admin-cheat-target" style="min-width: 100px;">Target player</label>
				<select id="rumble-admin-cheat-target" data-ref="adminCheatTargetSelect" style="flex: 1;"></select>
				<button data-ref="adminCheatSubmitBtn">Grant Selected</button>
				<button data-ref="adminCheatClearBtn">Clear</button>
			</div>
			<div class="list" data-ref="adminCheatAbilityList" style="max-height: 260px; overflow: auto; padding-right: 4px;"></div>
			<p data-ref="adminCheatEmptyText" style="margin: 8px 0 0 0; opacity: 0.85;">No abilities available.</p>
		</div>
	</div>
`;

export const ABILITY_ROW_TEMPLATE_HTML = `
	<div class="row mobile-stack" style="align-items: center; margin-bottom: 6px;">
		<div style="flex: 0 0 180px;" data-ref="name"></div>
		<div style="flex: 1;" data-ref="description"></div>
		<div style="width: 220px;" data-ref="right">
			<div data-ref="label"></div>
			<input type="number" min="0" step="1" placeholder="Bid amount" data-ref="input">
		</div>
	</div>
`;

export const PLAYER_ROW_TEMPLATE_HTML = `
	<div class="row mobile-stack" style="align-items: center; margin-bottom: 6px;">
		<div style="flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
			<div data-ref="name"></div>
			<small data-ref="abilities" style="opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;"></small>
		</div>
		<div style="min-width: 220px; display: flex; flex-direction: column; justify-content: center; gap: 4px;" data-ref="right">
			<div data-ref="label" style="line-height: 1.2;"></div>
			<input type="number" min="0" step="1" placeholder="Attack amount" data-ref="input">
		</div>
	</div>
`;

export const ABILITY_ACTIVATION_ROW_TEMPLATE_HTML = `
	<div class="row mobile-stack" style="align-items: flex-start; margin-bottom: 6px;">
		<div style="flex: 1 1 260px; min-width: 220px;">
			<div data-ref="name" style="font-weight: 600;"></div>
			<small data-ref="meta" style="opacity: 0.8;"></small>
			<div data-ref="description" style="margin-top: 3px;"></div>
		</div>
		<div style="flex: 1 1 320px; min-width: 240px; display: grid; gap: 6px;" data-ref="controls">
			<label data-ref="toggleWrap" style="display: inline-flex; align-items: center; gap: 8px;">
				<input type="checkbox" data-ref="toggleInput" style="width: auto;">
				<span data-ref="toggleLabel">Activate</span>
			</label>
			<div data-ref="targetWrap" class="row" style="margin: 0; gap: 8px;">
				<label data-ref="targetLabel" style="min-width: 50px;">Target</label>
				<select data-ref="targetSelect" style="flex: 1;"></select>
			</div>
			<div data-ref="xCostWrap" class="row" style="margin: 0; gap: 8px;">
				<label data-ref="xCostLabel" style="min-width: 50px;">X Cost</label>
				<input type="number" min="0" step="1" data-ref="xCostInput" placeholder="0" style="flex: 1;">
			</div>
			<div data-ref="readonlyText"></div>
		</div>
	</div>
`;

export const ADMIN_CHEAT_ABILITY_ROW_TEMPLATE_HTML = `
	<label class="row mobile-stack" style="align-items: flex-start; margin-bottom: 6px; gap: 8px; cursor: pointer;">
		<input type="checkbox" data-ref="checkbox" style="width: auto; margin-top: 2px;">
		<div style="flex: 1; min-width: 0;">
			<div class="row mobile-stack" style="align-items: center; gap: 8px; margin: 0 0 2px 0;">
				<div data-ref="name" style="font-weight: 600;"></div>
				<small data-ref="meta" style="opacity: 0.8;"></small>
				<small data-ref="status" style="opacity: 0.85;"></small>
			</div>
			<div data-ref="description" style="opacity: 0.9;"></div>
		</div>
	</label>
`;

export const PREVIOUS_ORDER_TEMPLATE_HTML = `
	<div class="message-item">
		<small data-ref="meta"></small>
		<div data-ref="text"></div>
	</div>
`;

export const EVENT_LOG_TEMPLATE_HTML = `
	<div class="message-item">
		<small data-ref="meta"></small>
		<div data-ref="text"></div>
	</div>
`;