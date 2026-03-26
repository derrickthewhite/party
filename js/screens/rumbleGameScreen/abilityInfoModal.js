import { showInfoModal } from '../dom.js';
import { getAbilityControlSpec } from './abilities.js';

function describeCostFormula(ability) {
	const params = ability && typeof ability.template_params === 'object' && ability.template_params
		? ability.template_params
		: {};
	const formula = params.cost_formula && typeof params.cost_formula === 'object' ? params.cost_formula : null;
	const healthBurn = Math.max(0, Number(params.health_burn || 0));
	const costParts = [];

	if (formula) {
		const kind = String(formula.kind || '');
		if (kind === 'constant') {
			costParts.push('Energy cost: ' + Math.max(0, Number(formula.value || 0)));
		} else if (kind === 'variable_x') {
			costParts.push('Energy cost: X');
		} else if (kind === 'scaled_x') {
			costParts.push('Energy cost: ' + Math.max(0, Number(formula.multiplier || 0)) + ' × X');
		}
	}

	if (healthBurn > 0) {
		costParts.push('Health burn: ' + healthBurn);
	}

	if (costParts.length === 0) {
		costParts.push('No direct energy cost.');
	}

	return costParts.join(' | ');
}

function describeUsage(ability) {
	const controlSpec = getAbilityControlSpec(ability);
	const parts = [];
	if (controlSpec.showTarget) {
		parts.push(controlSpec.targetRequired ? 'Requires a target' : 'Can target an opponent');
	}
	if (controlSpec.showXCost) {
		parts.push('Supports X-cost input');
	}
	if (parts.length === 0) {
		parts.push('No extra input required');
	}
	return parts.join(' | ');
}

export function showRumbleAbilityInfo(ability) {
	const source = ability && typeof ability === 'object' ? ability : {};
	const abilityName = String(source.title || source.name || source.id || 'Ability');
	const copyIndex = Math.max(0, Number(source.ability_copy_index || 0));
	const fullTitle = copyIndex > 1 ? (abilityName + ' #' + copyIndex) : abilityName;
	const tags = Array.isArray(source.tags) && source.tags.length > 0 ? source.tags : ['None'];

	return showInfoModal({
		title: fullTitle,
		message: String(source.description || 'No description available.'),
		sections: [
			{ label: 'Type', value: String(source.template_kind || 'unknown') },
			{ label: 'Template', value: String(source.template_key || 'unknown') },
			{ label: 'Tags', value: tags },
			{ label: 'Cost', value: describeCostFormula(source) },
			{ label: 'Usage', value: describeUsage(source) },
		],
	});
}