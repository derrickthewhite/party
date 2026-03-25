export function isActivatedAbility(ability) {
	return String(ability && ability.template_kind ? ability.template_kind : '') === 'activated';
}

export function evaluateAbilityCostFormula(formula, xCost) {
	const source = formula && typeof formula === 'object' ? formula : {};
	const kind = String(source.kind || '');
	if (kind === 'constant') {
		return Math.max(0, Math.floor(Number(source.value || 0)));
	}

	if (kind === 'variable_x') {
		return Math.max(0, Math.floor(Number(xCost || 0)));
	}

	if (kind === 'scaled_x') {
		const multiplier = Math.max(0, Math.floor(Number(source.multiplier || 0)));
		return Math.max(0, Math.floor(Number(xCost || 0)) * multiplier);
	}

	return null;
}

export function abilityCostFromDraft(ability, draftActivation) {
	const activation = draftActivation && typeof draftActivation === 'object' ? draftActivation : {};
	const templateKey = String(ability && ability.template_key ? ability.template_key : '');
	const params = ability && typeof ability.template_params === 'object' && ability.template_params
		? ability.template_params
		: {};
	const xCost = Math.max(0, Math.floor(Number(activation.x_cost || 0)));
	const healthBurn = Math.max(0, Math.floor(Number(params.health_burn || 0)));
	const formulaCost = evaluateAbilityCostFormula(params.cost_formula, xCost);
	if (formulaCost !== null) {
		return formulaCost + healthBurn;
	}

	if (templateKey === 'activated_spend_with_target_policy') {
		if (String(params.cost_mode || '') === 'variable') {
			return xCost + healthBurn;
		}

		return healthBurn;
	}

	if (templateKey === 'activated_defense_mode') {
		if (Object.prototype.hasOwnProperty.call(activation, 'x_cost')) {
			return xCost + healthBurn;
		}

		return healthBurn;
	}

	if (templateKey === 'activated_self_or_toggle') {
		return xCost + healthBurn;
	}

	return healthBurn;
}

export function getAbilityControlSpec(ability) {
	const templateKey = String(ability && ability.template_key ? ability.template_key : '');
	const abilityId = String(ability && ability.id ? ability.id : '');
	const params = ability && typeof ability.template_params === 'object' && ability.template_params
		? ability.template_params
		: {};
	const templateInputs = ability && typeof ability.template_inputs === 'object' && ability.template_inputs
		? ability.template_inputs
		: {};

	if (!isActivatedAbility(ability)) {
		return {
			showTarget: false,
			targetRequired: false,
			showXCost: false,
		};
	}

	if (templateKey === 'activated_spend_with_target_policy') {
		const targetPolicy = String(params.target_policy || 'optional_target');
		const costKind = String(params && params.cost_formula && params.cost_formula.kind ? params.cost_formula.kind : '');
		const showTarget = targetPolicy === 'single_opponent' || targetPolicy === 'optional_target';
		return {
			showTarget,
			targetRequired: targetPolicy === 'single_opponent',
			showXCost: String(params.cost_mode || '') === 'variable' || costKind === 'variable_x' || costKind === 'scaled_x',
		};
	}

	if (templateKey === 'activated_defense_mode') {
		const targetPolicy = String(params.target_policy || '');
		const costKind = String(params && params.cost_formula && params.cost_formula.kind ? params.cost_formula.kind : '');
		return {
			showTarget: targetPolicy === 'single_opponent' || abilityId === 'focused_defense',
			targetRequired: targetPolicy === 'single_opponent' || abilityId === 'focused_defense',
			showXCost: costKind === 'variable_x' || costKind === 'scaled_x',
		};
	}

	if (templateKey === 'activated_self_or_toggle') {
		const targetPolicy = String(params.target_policy || '');
		const costKind = String(params && params.cost_formula && params.cost_formula.kind ? params.cost_formula.kind : '');
		return {
			showTarget: targetPolicy === 'single_opponent',
			targetRequired: targetPolicy === 'single_opponent',
			showXCost: costKind === 'variable_x' || costKind === 'scaled_x',
		};
	}

	return {
		showTarget: Object.prototype.hasOwnProperty.call(templateInputs, 'target_user_id'),
		targetRequired: Object.prototype.hasOwnProperty.call(templateInputs, 'target_user_id'),
		showXCost: Object.prototype.hasOwnProperty.call(templateInputs, 'x_cost'),
	};
}