export function reconcileSelectOptions(selectNode, optionMap, options) {
	const active = new Set();
	options.forEach(function eachOption(option) {
		const value = String(option.value);
		active.add(value);
		let optionNode = optionMap.get(value);
		if (!optionNode) {
			optionNode = document.createElement('option');
			optionMap.set(value, optionNode);
		}

		optionNode.value = value;
		optionNode.textContent = String(option.label);
		selectNode.appendChild(optionNode);
	});

	Array.from(optionMap.keys()).forEach(function eachExisting(value) {
		if (active.has(value)) {
			return;
		}

		const node = optionMap.get(value);
		if (node && node.parentNode === selectNode) {
			selectNode.removeChild(node);
		}
		optionMap.delete(value);
	});
}