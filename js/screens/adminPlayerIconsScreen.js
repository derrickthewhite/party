import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate, setStatus, showConfirmModal } from './dom.js';
import { setPlayerIconImage } from '../playerIcons.js';

function iconKeyOf(icon) {
	return String(icon && icon.key ? icon.key : '');
}

function tagIdsFromIcon(icon) {
	const ids = new Set();
	(Array.isArray(icon && icon.tags) ? icon.tags : []).forEach(function eachTag(tag) {
		if (tag && tag.id != null) {
			ids.add(Number(tag.id));
		}
	});
	return ids;
}

function matchesFilter(icon, filters) {
	const displayName = String(icon && icon.label ? icon.label : '').toLowerCase();
	const filename = String(icon && (icon.filename || icon.key) ? (icon.filename || icon.key) : '').toLowerCase();
	if (filters.displayName && displayName.indexOf(filters.displayName) === -1) {
		return false;
	}
	if (filters.filename && filename.indexOf(filters.filename) === -1) {
		return false;
	}
	if (filters.tagId) {
		const wanted = Number(filters.tagId);
		let hasTag = false;
		tagIdsFromIcon(icon).forEach(function eachId(id) {
			if (id === wanted) {
				hasTag = true;
			}
		});
		if (!hasTag) {
			return false;
		}
	}
	return true;
}

export function createAdminPlayerIconsScreen(deps) {
	const api = deps.api;
	const state = deps.state;
	const navigateToScreen = deps.navigateToScreen || function fallbackNavigate(screen) {
		state.setScreen(screen);
	};

	const root = createNodeFromHtml(`
		<section class="screen card">
			<div class="row">
				<h2>Player icons</h2>
				<div data-ref="headingSpacer"></div>
				<button class="link" data-ref="back">Back to users and rooms</button>
			</div>
			<p class="top-user-label" data-ref="userLabel"></p>
			<div class="status" data-ref="status"></div>
			<div class="admin-icons-toolbar">
				<label class="admin-icons-upload">
					<span>Upload SVG</span>
					<input type="file" accept=".svg,image/svg+xml" data-ref="uploadInput">
				</label>
				<label class="admin-create-field">
					<span>New tag</span>
					<input type="text" placeholder="Tag name" data-ref="newTagInput">
				</label>
				<button type="button" class="primary" data-ref="createTagBtn">Create tag</button>
			</div>
			<div class="admin-icons-tags" data-ref="tagList"></div>
			<div class="admin-icons-filters">
				<label class="admin-create-field">
					<span>Filter tag</span>
					<select data-ref="filterTag"></select>
				</label>
				<label class="admin-create-field">
					<span>Display name</span>
					<input type="text" placeholder="Display name" data-ref="filterDisplay">
				</label>
				<label class="admin-create-field">
					<span>Filename</span>
					<input type="text" placeholder="Filename" data-ref="filterFilename">
				</label>
			</div>
			<div class="admin-icons-bulk">
				<label class="admin-create-field">
					<span>Bulk tag</span>
					<select data-ref="bulkTag"></select>
				</label>
				<button type="button" data-ref="bulkAssignBtn">Assign</button>
				<button type="button" data-ref="bulkUnassignBtn">Unassign</button>
				<button type="button" data-ref="bulkHideBtn">Hide</button>
				<button type="button" data-ref="bulkShowBtn">Show</button>
				<button type="button" data-ref="bulkAutoOnBtn">Auto-assign on</button>
				<button type="button" data-ref="bulkAutoOffBtn">Auto-assign off</button>
			</div>
			<div class="admin-icons-layout">
				<div class="admin-icons-grid" data-ref="grid"></div>
				<div class="admin-icons-edit" data-ref="editPanel">
					<p class="admin-icons-edit-empty" data-ref="editEmpty">Select an icon to edit it.</p>
					<div class="admin-icons-edit-form" data-ref="editForm" style="display:none;">
						<img class="player-icon admin-icons-edit-image" data-ref="editImage" alt="">
						<label class="admin-create-field">
							<span>Display name</span>
							<input type="text" data-ref="editDisplayName">
						</label>
						<p class="admin-icons-filename" data-ref="editFilename"></p>
						<label class="admin-icons-check">
							<input type="checkbox" data-ref="editHidden">
							<span>Hidden from picker</span>
						</label>
						<label class="admin-icons-check">
							<input type="checkbox" data-ref="editAutoAssign">
							<span>Auto-assign to new players</span>
						</label>
						<div class="admin-icons-edit-tags" data-ref="editTags"></div>
						<button type="button" class="primary" data-ref="saveBtn">Save icon</button>
					</div>
				</div>
			</div>
		</section>
	`);
	const refs = collectRefs(root);
	refs.headingSpacer.style.flex = '1';

	const cardTemplate = createTemplate(`
		<div class="admin-icons-card">
			<input type="checkbox" data-ref="select">
			<img class="player-icon admin-icons-card-image" data-ref="image" alt="">
			<strong data-ref="label"></strong>
			<small data-ref="filename"></small>
		</div>
	`);
	const tagRowTemplate = createTemplate(`
		<div class="admin-icons-tag-row">
			<span data-ref="name"></span>
			<button type="button" data-ref="renameBtn">Rename</button>
			<button type="button" data-ref="deleteBtn">Delete</button>
		</div>
	`);
	const tagCheckTemplate = createTemplate(`
		<label class="admin-icons-check">
			<input type="checkbox" data-ref="check">
			<span data-ref="label"></span>
		</label>
	`);

	const iconCardsByKey = new Map();
	const tagRowsById = new Map();
	const editChecksById = new Map();
	let snapshotIcons = [];
	let snapshotTags = [];
	let selectedKeys = new Set();
	let editingKey = null;
	let localDraft = null;
	let filterTagId = '';
	let filterDisplayName = '';
	let filterFilename = '';
	let busy = false;

	function currentFilters() {
		return {
			tagId: filterTagId,
			displayName: filterDisplayName.trim().toLowerCase(),
			filename: filterFilename.trim().toLowerCase(),
		};
	}

	function iconByKey(iconKey) {
		return snapshotIcons.find(function findIcon(icon) {
			return iconKeyOf(icon) === iconKey;
		}) || null;
	}

	function selectedIconKeys() {
		return Array.from(selectedKeys);
	}

	function draftFor(icon) {
		return {
			iconKey: iconKeyOf(icon),
			displayName: String(icon.label || ''),
			hidden: !!icon.hidden,
			autoAssign: !!icon.auto_assign,
			tagIds: tagIdsFromIcon(icon),
			dirty: false,
		};
	}

	function applySnapshot(payload) {
		snapshotIcons = Array.isArray(payload && payload.icons) ? payload.icons.slice() : [];
		snapshotTags = Array.isArray(payload && payload.tags) ? payload.tags.slice() : [];
		const activeKeys = new Set(snapshotIcons.map(iconKeyOf));
		selectedKeys.forEach(function eachKey(key) {
			if (!activeKeys.has(key)) {
				selectedKeys.delete(key);
			}
		});
		if (editingKey && !activeKeys.has(editingKey)) {
			editingKey = null;
			localDraft = null;
		} else if (editingKey && (!localDraft || !localDraft.dirty || localDraft.iconKey !== editingKey)) {
			const icon = iconByKey(editingKey);
			localDraft = icon ? draftFor(icon) : null;
		}
		reconcile();
	}

	async function reload() {
		const user = state.state.user || {};
		refs.userLabel.textContent = user.username ? 'Signed in as: ' + user.username : '';
		const result = await api.adminListPlayerIcons();
		applySnapshot(result);
	}

	function reconcile() {
		reconcileFilterOptions();
		reconcileTags();
		reconcileGrid();
		reconcileEdit();
	}

	function fillTagSelect(select, includeAll) {
		const current = select.value;
		const keep = {};
		Array.from(select.options).forEach(function eachOption(option) {
			keep[option.value] = option;
		});
		const wanted = [];
		if (includeAll) {
			wanted.push({ value: '', label: 'All tags' });
		} else {
			wanted.push({ value: '', label: 'Choose tag' });
		}
		snapshotTags.forEach(function eachTag(tag) {
			wanted.push({ value: String(tag.id), label: String(tag.name || '') });
		});
		wanted.forEach(function eachWanted(item) {
			let option = keep[item.value];
			if (!option) {
				option = document.createElement('option');
				option.value = item.value;
			}
			option.textContent = item.label;
			select.appendChild(option);
			delete keep[item.value];
		});
		Object.keys(keep).forEach(function eachStale(value) {
			keep[value].remove();
		});
		if (wanted.some(function hasCurrent(item) { return item.value === current; })) {
			select.value = current;
		} else {
			select.value = wanted[0] ? wanted[0].value : '';
		}
	}

	function reconcileFilterOptions() {
		fillTagSelect(refs.filterTag, true);
		fillTagSelect(refs.bulkTag, false);
		if (filterTagId) {
			refs.filterTag.value = filterTagId;
		}
	}

	function reconcileTags() {
		const activeIds = new Set();
		snapshotTags.forEach(function eachTag(tag) {
			const key = String(tag.id);
			activeIds.add(key);
			let row = tagRowsById.get(key);
			if (!row) {
				const node = cloneTemplateNode(tagRowTemplate);
				const rowRefs = collectRefs(node);
				row = { node: node, refs: rowRefs, tagId: tag.id };
				rowRefs.renameBtn.addEventListener('click', function onRename() {
					renameTag(row.tagId);
				});
				rowRefs.deleteBtn.addEventListener('click', function onDelete() {
					deleteTag(row.tagId);
				});
				tagRowsById.set(key, row);
			}
			row.tagId = tag.id;
			row.refs.name.textContent = String(tag.name || '') + ' (' + String(tag.icon_count || 0) + ')';
			refs.tagList.appendChild(row.node);
		});
		tagRowsById.forEach(function eachRow(row, key) {
			if (!activeIds.has(key)) {
				row.node.remove();
				tagRowsById.delete(key);
			}
		});
	}

	function reconcileGrid() {
		const filters = currentFilters();
		const activeKeys = new Set();
		snapshotIcons.forEach(function eachIcon(icon) {
			const key = iconKeyOf(icon);
			if (!key) {
				return;
			}
			activeKeys.add(key);
			let card = iconCardsByKey.get(key);
			if (!card) {
				const node = cloneTemplateNode(cardTemplate);
				const cardRefs = collectRefs(node);
				card = { node: node, refs: cardRefs };
				cardRefs.select.addEventListener('click', function onSelectClick(event) {
					event.stopPropagation();
				});
				cardRefs.select.addEventListener('change', function onSelectChange() {
					if (cardRefs.select.checked) {
						selectedKeys.add(key);
					} else {
						selectedKeys.delete(key);
					}
					node.classList.toggle('is-selected', selectedKeys.has(key));
				});
				node.addEventListener('click', function onCardClick(event) {
					if (event.target === cardRefs.select) {
						return;
					}
					editingKey = key;
					const current = iconByKey(key);
					if (!current) {
						return;
					}
					if (!localDraft || localDraft.iconKey !== key || !localDraft.dirty) {
						localDraft = draftFor(current);
					}
					reconcileEdit();
					reconcileGrid();
				});
				iconCardsByKey.set(key, card);
			}
			setPlayerIconImage(card.refs.image, key, icon.label || 'Icon');
			card.refs.label.textContent = String(icon.label || '');
			card.refs.filename.textContent = String(icon.filename || key);
			card.refs.select.checked = selectedKeys.has(key);
			card.node.classList.toggle('is-selected', selectedKeys.has(key));
			card.node.classList.toggle('is-editing', editingKey === key);
			card.node.classList.toggle('is-hidden-icon', !!icon.hidden);
			card.node.style.display = matchesFilter(icon, filters) ? '' : 'none';
			refs.grid.appendChild(card.node);
		});
		iconCardsByKey.forEach(function eachCard(card, key) {
			if (!activeKeys.has(key)) {
				card.node.remove();
				iconCardsByKey.delete(key);
			}
		});
	}

	function reconcileEdit() {
		const icon = editingKey ? iconByKey(editingKey) : null;
		if (!icon || !localDraft || localDraft.iconKey !== editingKey) {
			refs.editEmpty.style.display = '';
			refs.editForm.style.display = 'none';
			return;
		}

		refs.editEmpty.style.display = 'none';
		refs.editForm.style.display = '';
		setPlayerIconImage(refs.editImage, icon.key, localDraft.displayName || icon.label || 'Icon');
		if (document.activeElement !== refs.editDisplayName) {
			refs.editDisplayName.value = localDraft.displayName;
		}
		refs.editFilename.textContent = 'Filename: ' + String(icon.filename || icon.key);
		if (document.activeElement !== refs.editHidden) {
			refs.editHidden.checked = !!localDraft.hidden;
		}
		if (document.activeElement !== refs.editAutoAssign) {
			refs.editAutoAssign.checked = !!localDraft.autoAssign;
		}
		refs.saveBtn.disabled = busy;

		const activeIds = new Set();
		snapshotTags.forEach(function eachTag(tag) {
			const key = String(tag.id);
			activeIds.add(key);
			let row = editChecksById.get(key);
			if (!row) {
				const node = cloneTemplateNode(tagCheckTemplate);
				const rowRefs = collectRefs(node);
				row = { node: node, refs: rowRefs };
				rowRefs.check.addEventListener('change', function onCheck() {
					if (!localDraft || localDraft.iconKey !== editingKey) {
						return;
					}
					if (rowRefs.check.checked) {
						localDraft.tagIds.add(Number(tag.id));
					} else {
						localDraft.tagIds.delete(Number(tag.id));
					}
					localDraft.dirty = true;
				});
				editChecksById.set(key, row);
			}
			row.refs.label.textContent = String(tag.name || '');
			if (document.activeElement !== row.refs.check) {
				row.refs.check.checked = localDraft.tagIds.has(Number(tag.id));
			}
			refs.editTags.appendChild(row.node);
		});
		editChecksById.forEach(function eachRow(row, key) {
			if (!activeIds.has(key)) {
				row.node.remove();
				editChecksById.delete(key);
			}
		});
	}

	async function runBusy(work, successMessage) {
		if (busy) {
			return;
		}
		busy = true;
		try {
			const result = await work();
			if (successMessage) {
				setStatus(refs.status, successMessage, 'ok');
			}
			if (result) {
				applySnapshot(result);
			} else {
				await reload();
			}
		} catch (err) {
			setStatus(refs.status, err && err.message ? err.message : 'Request failed.', 'error');
		} finally {
			busy = false;
			reconcileEdit();
		}
	}

	async function renameTag(tagId) {
		const tag = snapshotTags.find(function findTag(item) {
			return Number(item.id) === Number(tagId);
		});
		const nextName = window.prompt('Tag name', tag ? String(tag.name || '') : '');
		if (nextName == null) {
			return;
		}
		await runBusy(function rename() {
			return api.adminRenamePlayerIconTag(tagId, nextName);
		}, 'Tag renamed.');
	}

	async function deleteTag(tagId) {
		const tag = snapshotTags.find(function findTag(item) {
			return Number(item.id) === Number(tagId);
		});
		const confirmed = await showConfirmModal({
			title: 'Delete tag',
			message: 'Delete ' + (tag ? String(tag.name || 'this tag') : 'this tag') + '? Icons stay; only the tag is removed.',
			confirmLabel: 'Delete tag',
		});
		if (!confirmed) {
			return;
		}
		await runBusy(function removeTag() {
			return api.adminDeletePlayerIconTag(tagId);
		}, 'Tag deleted.');
	}

	async function bulkUpdate(changes, successMessage) {
		const iconKeys = selectedIconKeys();
		if (!iconKeys.length) {
			setStatus(refs.status, 'Select one or more icons.', 'error');
			return;
		}
		await runBusy(function bulk() {
			return api.adminBulkPlayerIcons(Object.assign({ icon_keys: iconKeys }, changes));
		}, successMessage);
	}

	refs.back.addEventListener('click', function onBack() {
		navigateToScreen('admin');
	});

	refs.createTagBtn.addEventListener('click', function onCreateTag() {
		const name = refs.newTagInput.value.trim();
		runBusy(function createTag() {
			return api.adminCreatePlayerIconTag(name).then(function afterCreate(result) {
				refs.newTagInput.value = '';
				return result;
			});
		}, 'Tag created.');
	});

	refs.uploadInput.addEventListener('change', function onUpload() {
		const file = refs.uploadInput.files && refs.uploadInput.files[0] ? refs.uploadInput.files[0] : null;
		if (!file) {
			return;
		}
		runBusy(function upload() {
			return api.adminUploadPlayerIcon(file).then(function afterUpload(result) {
				refs.uploadInput.value = '';
				if (result && result.icon_key) {
					editingKey = result.icon_key;
					localDraft = null;
				}
				return result;
			});
		}, 'Icon uploaded.').finally(function resetInput() {
			refs.uploadInput.value = '';
		});
	});

	refs.filterTag.addEventListener('change', function onFilterTag() {
		filterTagId = refs.filterTag.value;
		reconcileGrid();
	});
	refs.filterDisplay.addEventListener('input', function onFilterDisplay() {
		filterDisplayName = refs.filterDisplay.value;
		reconcileGrid();
	});
	refs.filterFilename.addEventListener('input', function onFilterFilename() {
		filterFilename = refs.filterFilename.value;
		reconcileGrid();
	});

	refs.bulkAssignBtn.addEventListener('click', function onAssign() {
		const tagId = Number(refs.bulkTag.value || 0);
		if (!tagId) {
			setStatus(refs.status, 'Choose a tag to assign.', 'error');
			return;
		}
		bulkUpdate({ add_tag_id: tagId }, 'Tag assigned.');
	});
	refs.bulkUnassignBtn.addEventListener('click', function onUnassign() {
		const tagId = Number(refs.bulkTag.value || 0);
		if (!tagId) {
			setStatus(refs.status, 'Choose a tag to unassign.', 'error');
			return;
		}
		bulkUpdate({ remove_tag_id: tagId }, 'Tag unassigned.');
	});
	refs.bulkHideBtn.addEventListener('click', function onHide() {
		bulkUpdate({ hidden: true }, 'Icons hidden.');
	});
	refs.bulkShowBtn.addEventListener('click', function onShow() {
		bulkUpdate({ hidden: false }, 'Icons shown.');
	});
	refs.bulkAutoOnBtn.addEventListener('click', function onAutoOn() {
		bulkUpdate({ auto_assign: true }, 'Auto-assign enabled.');
	});
	refs.bulkAutoOffBtn.addEventListener('click', function onAutoOff() {
		bulkUpdate({ auto_assign: false }, 'Auto-assign disabled.');
	});

	refs.editDisplayName.addEventListener('input', function onDisplayName() {
		if (!localDraft || localDraft.iconKey !== editingKey) {
			return;
		}
		localDraft.displayName = refs.editDisplayName.value;
		localDraft.dirty = true;
	});
	refs.editHidden.addEventListener('change', function onHidden() {
		if (!localDraft || localDraft.iconKey !== editingKey) {
			return;
		}
		localDraft.hidden = refs.editHidden.checked;
		localDraft.dirty = true;
	});
	refs.editAutoAssign.addEventListener('change', function onAuto() {
		if (!localDraft || localDraft.iconKey !== editingKey) {
			return;
		}
		localDraft.autoAssign = refs.editAutoAssign.checked;
		localDraft.dirty = true;
	});
	refs.saveBtn.addEventListener('click', function onSave() {
		if (!localDraft || localDraft.iconKey !== editingKey) {
			return;
		}
		const payload = {
			icon_key: localDraft.iconKey,
			display_name: localDraft.displayName,
			hidden: localDraft.hidden ? 1 : 0,
			auto_assign: localDraft.autoAssign ? 1 : 0,
			tag_ids: Array.from(localDraft.tagIds),
		};
		runBusy(function save() {
			return api.adminUpdatePlayerIcon(payload).then(function afterSave(result) {
				localDraft = localDraft ? Object.assign({}, localDraft, { dirty: false }) : null;
				return result;
			});
		}, 'Icon saved.');
	});

	return {
		root: root,
		load: reload,
		setStatus: function setAdminIconsStatus(text, kind) {
			setStatus(refs.status, text, kind);
		},
	};
}
