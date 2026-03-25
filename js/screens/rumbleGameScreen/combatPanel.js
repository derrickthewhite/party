import { collectRefs, createNodeFromHtml } from '../dom.js';
import { createAbilityActivationController } from './abilityActivations.js';
import { createPlayersListController } from './playersList.js';

const COMBAT_PANEL_HTML = `
	<div>
		<p data-ref="defenseText" style="margin: 8px 0 6px 0; font-weight: 600;">Defense: 0</p>
		<p data-ref="energyText" style="margin: 0 0 6px 0; font-weight: 600;">Energy: 0 | Attacks: 0 | Abilities: 0 | Remaining: 0</p>
		<div data-ref="playersMount"></div>
		<div data-ref="abilityActivationsMount"></div>
	</div>
`;

export function createCombatPanelController(context) {
	const root = createNodeFromHtml(COMBAT_PANEL_HTML);
	const refs = collectRefs(root);
	const playersListController = createPlayersListController(context);
	const abilityActivationController = createAbilityActivationController(context);

	refs.playersMount.appendChild(playersListController.root);
	refs.abilityActivationsMount.appendChild(abilityActivationController.root);

	function reconcile() {
		const validation = context.getOrderValidation();
		const selfPlayer = context.getSelfPlayer();
		if (!selfPlayer) {
			refs.defenseText.textContent = 'Defense: n/a';
		} else if (validation.invalidDefense) {
			refs.defenseText.textContent = 'Defense: ' + validation.defense + ' (invalid: defense cannot be negative)';
		} else {
			refs.defenseText.textContent = 'Defense: ' + validation.defense;
		}

		refs.energyText.textContent = 'Energy: ' + validation.energyBudget
			+ ' | Attacks: ' + validation.attackEnergySpent
			+ ' | Abilities: ' + validation.abilityEnergySpent
			+ ' | Remaining: ' + validation.remainingEnergy;

		playersListController.reconcile();
		abilityActivationController.reconcile();
	}

	return {
		root,
		reconcile,
		setVisible: function setVisible(visible) {
			root.style.display = visible ? '' : 'none';
		},
	};
}