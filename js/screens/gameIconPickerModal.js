import { collectRefs, createNodeFromHtml } from './dom.js';
import {
	isPlayerIconAnimal,
	isPlayerIconHuman,
	normalizePlayerIconKey,
	playerIconGroupLabel,
	playerIconLabel,
	setPlayerIconImage,
} from '../playerIcons.js';

const ICON_PICKER_MODAL_HTML = `
	<div class="modal-overlay" data-ref="overlay">
		<div class="modal-card modal-card-wide mafia-icon-modal" role="dialog" aria-modal="true" aria-label="Choose icon" data-ref="dialog">
			<h3 data-ref="title">Choose your icon</h3>
			<p class="modal-message" data-ref="message">Pick the icon that should represent you in chat and player lists.</p>
			<div class="mafia-icon-tabs" role="tablist" data-ref="tabList"></div>
			<div class="mafia-icon-panel" role="tabpanel" aria-label="Available icons" data-ref="panel">
				<div class="mafia-icon-grid" data-ref="grid"></div>
			</div>
			<div class="modal-actions" data-ref="actions">
				<button data-ref="cancelBtn">Cancel</button>
			</div>
		</div>
	</div>
`;

function buildIconGroups(iconCatalog) {
	const availableIcons = Array.isArray(iconCatalog) ? iconCatalog.slice() : [];
	const iconGroupsByKey = new Map();

	availableIcons.forEach(function eachIcon(iconKey) {
		const normalized = normalizePlayerIconKey(iconKey) || '';
		let folderKey = '';
		if (normalized) {
			const lastSlashIndex = normalized.lastIndexOf('/');
			folderKey = lastSlashIndex === -1 ? '' : normalized.slice(0, lastSlashIndex);
		}

		function addToGroup(key) {
			if (!iconGroupsByKey.has(key)) {
				iconGroupsByKey.set(key, {
					key,
					label: playerIconGroupLabel(key),
					icons: [],
				});
			}
			iconGroupsByKey.get(key).icons.push(iconKey);
		}

		addToGroup(folderKey);
		if (isPlayerIconAnimal(iconKey)) {
			addToGroup('animals');
		}
		if (isPlayerIconHuman(iconKey)) {
			addToGroup('humans');
		}
	});

	return Array.from(iconGroupsByKey.values()).sort(function compareIconGroups(left, right) {
		if (left.key === '' && right.key !== '') {
			return -1;
		}
		if (left.key !== '' && right.key === '') {
			return 1;
		}

		return left.label.localeCompare(right.label);
	});
}

export function showGameIconPickerModal(options) {
	const config = options || {};
	const normalizedCurrentIconKey = typeof config.currentIconKey === 'string' ? config.currentIconKey.trim() : '';
	const tabGroups = buildIconGroups(config.iconCatalog);
	let activeGroupKey = tabGroups.find(function hasCurrentSelection(group) {
		return group.icons.some(function isCurrentIcon(iconKey) {
			return String(iconKey) === String(normalizedCurrentIconKey);
		});
	})?.key || (tabGroups[0] ? tabGroups[0].key : '');
	const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	return new Promise(function resolveSelection(resolve) {
		const modal = createNodeFromHtml(ICON_PICKER_MODAL_HTML);
		const refs = collectRefs(modal);
		const overlay = refs.overlay;
		const title = refs.title;
		const message = refs.message;
		const tabList = refs.tabList;
		const panel = refs.panel;
		const grid = refs.grid;
		const cancelBtn = refs.cancelBtn;
		let closed = false;

		if (typeof config.title === 'string' && config.title.trim()) {
			title.textContent = config.title.trim();
		}
		if (typeof config.message === 'string' && config.message.trim()) {
			message.textContent = config.message.trim();
		}

		function close(result) {
			if (closed) {
				return;
			}
			closed = true;
			document.removeEventListener('keydown', onKeyDown);
			if (modal && modal.remove) {
				modal.remove();
			}
			if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') {
				priorFocus.focus();
			}
			resolve(result);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				close(null);
			}
		}

		function iconOptionsForActiveGroup() {
			const activeGroup = tabGroups.find(function matchesActiveGroup(group) {
				return group.key === activeGroupKey;
			});

			return activeGroup ? activeGroup.icons : [];
		}

		function focusActiveTabButton() {
			const activeTabButton = tabList.querySelector('[data-group-key="' + CSS.escape(activeGroupKey) + '"]');
			if (activeTabButton instanceof HTMLElement) {
				activeTabButton.focus();
			}
		}

		function focusSelectedOption() {
			const selectedOption = grid.querySelector('.mafia-icon-option.is-selected') || grid.querySelector('.mafia-icon-option');
			if (selectedOption instanceof HTMLElement) {
				selectedOption.focus();
			}
		}

		function renderActiveGroup() {
			grid.replaceChildren();
			Array.from(tabList.querySelectorAll('.mafia-icon-tab')).forEach(function syncTabState(tabButton) {
				const isActive = tabButton.getAttribute('data-group-key') === activeGroupKey;
				tabButton.classList.toggle('is-active', isActive);
				tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
				tabButton.tabIndex = isActive ? 0 : -1;
			});

			iconOptionsForActiveGroup().forEach(function eachIcon(iconKey) {
				const option = document.createElement('button');
				option.type = 'button';
				option.className = 'mafia-icon-option';
				option.classList.toggle('is-selected', String(iconKey) === String(normalizedCurrentIconKey));

				const icon = document.createElement('img');
				icon.className = 'player-icon mafia-icon-option-image';
				icon.setAttribute('aria-hidden', 'true');
				setPlayerIconImage(icon, iconKey, 'Player');

				const label = document.createElement('span');
				label.textContent = playerIconLabel(iconKey);

				option.appendChild(icon);
				option.appendChild(label);
				option.addEventListener('click', function onSelect() {
					close(iconKey);
				});
				grid.appendChild(option);
			});

			panel.scrollTop = 0;
		}

		function setActiveGroup(nextGroupKey, focusTarget) {
			if (!tabGroups.some(function hasGroup(group) { return group.key === nextGroupKey; })) {
				return;
			}
			activeGroupKey = nextGroupKey;
			renderActiveGroup();
			if (focusTarget === 'tab') {
				focusActiveTabButton();
				return;
			}
			if (focusTarget === 'option') {
				focusSelectedOption();
			}
		}

		tabGroups.forEach(function eachGroup(group, index) {
			const tabButton = document.createElement('button');
			tabButton.type = 'button';
			tabButton.className = 'mafia-icon-tab';
			tabButton.setAttribute('role', 'tab');
			tabButton.setAttribute('data-group-key', group.key);
			tabButton.id = 'game-icon-tab-' + String(index + 1);
			tabButton.textContent = group.label;
			tabButton.addEventListener('click', function onTabClick() {
				setActiveGroup(group.key, 'tab');
			});
			tabButton.addEventListener('keydown', function onTabKeyDown(event) {
				if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
					return;
				}
				event.preventDefault();
				const currentIndex = tabGroups.findIndex(function matchesCurrent(candidate) {
					return candidate.key === activeGroupKey;
				});
				if (currentIndex === -1) {
					return;
				}
				if (event.key === 'Home') {
					setActiveGroup(tabGroups[0].key, 'tab');
					return;
				}
				if (event.key === 'End') {
					setActiveGroup(tabGroups[tabGroups.length - 1].key, 'tab');
					return;
				}
				const offset = event.key === 'ArrowLeft' ? -1 : 1;
				const nextIndex = (currentIndex + offset + tabGroups.length) % tabGroups.length;
				setActiveGroup(tabGroups[nextIndex].key, 'tab');
			});
			tabList.appendChild(tabButton);
		});

		overlay.addEventListener('click', function onOverlayClick(event) {
			if (event.target === overlay) {
				close(null);
			}
		});
		cancelBtn.addEventListener('click', function onCancel() {
			close(null);
		});

		document.body.appendChild(modal);
		document.addEventListener('keydown', onKeyDown);
		renderActiveGroup();

		const initialFocus = grid.querySelector('.mafia-icon-option.is-selected') || grid.querySelector('.mafia-icon-option');
		if (initialFocus instanceof HTMLElement) {
			initialFocus.focus();
		}
	});
}