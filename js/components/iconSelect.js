import { collectRefs, cloneTemplateNode, createTemplate } from '../screens/dom.js';

const wrapperTemplate = createTemplate(`
	<div class="icon-select" data-ref="wrapper">
		<button type="button" class="icon-select-toggle" data-ref="toggle" aria-haspopup="listbox" aria-expanded="false">
			<span class="icon-select-toggle-main">
				<span class="icon-select-icon" data-ref="icon"></span>
				<span class="icon-select-label" data-ref="label"></span>
			</span>
			<span class="icon-select-caret" data-ref="caret" aria-hidden="true"></span>
		</button>
		<div class="icon-select-menu hidden" data-ref="menu">
			<div class="icon-select-options" data-ref="options" role="listbox"></div>
		</div>
	</div>
`);

const optionTemplate = createTemplate(`
	<button type="button" class="icon-select-option" data-ref="option" role="option">
		<span class="icon-select-icon" data-ref="icon"></span>
		<span class="icon-select-option-label" data-ref="label"></span>
	</button>
`);

export function enhanceSelectWithIcons(selectNode, createIconForValue) {
	if (!selectNode || typeof createIconForValue !== 'function') {
		throw new Error('enhanceSelectWithIcons: invalid arguments');
	}

	selectNode.classList.add('hidden');

	const wrapper = cloneTemplateNode(wrapperTemplate);
	const refs = collectRefs(wrapper);
	selectNode.parentNode.insertBefore(wrapper, selectNode.nextSibling);

	function getVisibleOptions() {
		return Array.from(selectNode.options).filter(function eachOption(option) {
			return !option.hidden;
		});
	}

	function setIcon(container, value) {
		container.replaceChildren();
		const iconNode = createIconForValue(value);
		if (iconNode) {
			container.appendChild(iconNode);
		}
	}

	function getSelectedOption() {
		const visibleOptions = getVisibleOptions();
		const current = visibleOptions.find(function eachOption(option) {
			return option.value === selectNode.value;
		});
		return current || visibleOptions[0] || selectNode.options[0] || null;
	}

	function hideMenu() {
		refs.menu.classList.add('hidden');
		refs.toggle.setAttribute('aria-expanded', 'false');
		wrapper.classList.remove('is-open');
	}

	function showMenu() {
		refs.menu.classList.remove('hidden');
		refs.toggle.setAttribute('aria-expanded', 'true');
		wrapper.classList.add('is-open');
		const selectedOption = refs.options.querySelector('.is-selected');
		if (selectedOption) {
			selectedOption.focus();
		}
	}

	function updateToggle() {
		const option = getSelectedOption();
		refs.label.textContent = option ? (option.textContent || option.label || option.value) : '';
		setIcon(refs.icon, option ? option.value : '');
	}

	function selectValue(value) {
		if (selectNode.value !== value) {
			selectNode.value = value;
			selectNode.dispatchEvent(new Event('change', { bubbles: true }));
		}
		refresh();
	}

	function createOptionNode(option) {
		const node = cloneTemplateNode(optionTemplate);
		const optionRefs = collectRefs(node);
		const label = option.textContent || option.label || option.value;
		node.dataset.value = option.value;
		node.setAttribute('aria-selected', option.value === selectNode.value ? 'true' : 'false');
		node.classList.toggle('is-selected', option.value === selectNode.value);
		optionRefs.label.textContent = label;
		setIcon(optionRefs.icon, option.value);

		node.addEventListener('click', function onOptionClick() {
			selectValue(option.value);
			hideMenu();
			refs.toggle.focus();
		});

		node.addEventListener('keydown', function onOptionKeyDown(event) {
			const items = Array.from(refs.options.querySelectorAll('.icon-select-option'));
			const index = items.indexOf(node);
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				(items[index + 1] || items[0] || node).focus();
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				(items[index - 1] || items[items.length - 1] || node).focus();
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				hideMenu();
				refs.toggle.focus();
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				selectValue(option.value);
				hideMenu();
				refs.toggle.focus();
			}
		});

		return node;
	}

	function rebuildOptions() {
		const nodes = getVisibleOptions().map(createOptionNode);
		refs.options.replaceChildren.apply(refs.options, nodes);
	}

	function refresh() {
		rebuildOptions();
		updateToggle();
	}

	refs.toggle.addEventListener('click', function onToggleClick(event) {
		event.preventDefault();
		if (refs.menu.classList.contains('hidden')) {
			showMenu();
			return;
		}
		hideMenu();
	});

	refs.toggle.addEventListener('keydown', function onToggleKeyDown(event) {
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			showMenu();
		}
	});

	document.addEventListener('click', function onDocumentClick(event) {
		if (!wrapper.contains(event.target)) {
			hideMenu();
		}
	});

	selectNode.addEventListener('change', updateToggle);
	refresh();

	return {
		wrapper,
		toggle: refs.toggle,
		menu: refs.menu,
		refresh,
		selectValue,
	};
}
