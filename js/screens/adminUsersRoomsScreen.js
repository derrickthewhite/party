import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate, setStatus, showConfirmModal } from './dom.js';

export function createAdminUsersRoomsScreen(deps) {
	const api = deps.api;
	const state = deps.state;
	const navigateToScreen = deps.navigateToScreen || function fallbackNavigate(screen) {
		state.setScreen(screen);
	};

	const root = createNodeFromHtml(`
		<section class="screen card">
			<div class="row">
				<h2>Users &amp; Rooms</h2>
				<div data-ref="headingSpacer"></div>
				<button type="button" data-ref="playerIconsBtn">Player icons</button>
				<button class="link" data-ref="back">Back to lobby</button>
			</div>
			<p class="top-user-label" data-ref="userLabel"></p>
			<div class="status" data-ref="status"></div>
			<div class="admin-layout">
				<div class="admin-users-col" data-ref="usersCol">
					<h3>Users</h3>
					<div class="admin-user-list" data-ref="userList"></div>
				</div>
				<div class="admin-rooms-col" data-ref="roomsCol">
					<h3>Rooms</h3>
					<div class="admin-room-list" data-ref="roomList"></div>
					<div class="admin-create-room" data-ref="createRoomBlock">
						<h3>Create room</h3>
						<label class="admin-create-field">
							<span>Room name</span>
							<input type="text" placeholder="Room name" data-ref="roomNameInput">
						</label>
						<label class="admin-create-field">
							<span>Invite code</span>
							<input type="text" placeholder="Invite code" data-ref="roomCodeInput">
						</label>
						<button class="primary" type="button" data-ref="createRoomBtn">Create room</button>
					</div>
				</div>
			</div>
			<div class="admin-admins-section" data-ref="adminsSection">
				<div class="row admin-admins-heading">
					<h3>Admins</h3>
					<div data-ref="adminsSpacer"></div>
					<button type="button" data-ref="addAdminBtn">Add admin</button>
				</div>
				<div class="admin-admin-list" data-ref="adminList"></div>
			</div>
		</section>
	`);
	const refs = collectRefs(root);
	refs.headingSpacer.style.flex = '1';
	refs.adminsSpacer.style.flex = '1';

	const userRowTemplate = createTemplate(`
		<div class="admin-user-row">
			<input type="checkbox" data-ref="select">
			<span class="admin-user-name" data-ref="name"></span>
			<span class="admin-user-games" data-ref="games"></span>
			<span class="admin-user-tags" data-ref="tags"></span>
			<button type="button" class="admin-user-delete" data-ref="deleteBtn">Delete</button>
		</div>
	`);
	const roomRowTemplate = createTemplate(`
		<div class="admin-room-row">
			<div class="admin-room-copy">
				<strong data-ref="name"></strong>
				<small data-ref="code"></small>
				<small data-ref="games"></small>
			</div>
			<button type="button" class="admin-room-add" data-ref="addBtn" title="Add selected users">+</button>
			<button type="button" class="admin-room-edit" data-ref="editBtn">Edit</button>
		</div>
	`);
	const tagTemplate = createTemplate(`
		<span class="admin-room-tag">
			<span data-ref="label"></span>
			<button type="button" data-ref="remove" title="Remove room">×</button>
		</span>
	`);
	const adminRowTemplate = createTemplate(`
		<div class="admin-admin-row">
			<span data-ref="name"></span>
			<button type="button" data-ref="remove">Remove admin</button>
		</div>
	`);

	const userRowsById = new Map();
	const roomRowsById = new Map();
	const adminRowsById = new Map();
	const selectedUserIds = new Set();
	let snapshotUsers = [];
	let snapshotRooms = [];
	let busy = false;

	refs.back.addEventListener('click', function onBack() {
		navigateToScreen('landing');
	});

	refs.playerIconsBtn.addEventListener('click', function onPlayerIcons() {
		navigateToScreen('admin-icons');
	});

	refs.createRoomBtn.addEventListener('click', async function onCreateRoom() {
		if (busy) {
			return;
		}

		busy = true;
		try {
			await api.adminCreateRoom(refs.roomNameInput.value.trim(), refs.roomCodeInput.value.trim());
			refs.roomNameInput.value = '';
			refs.roomCodeInput.value = '';
			setStatus(refs.status, 'Room created.', 'ok');
			await reload();
		} catch (err) {
			setStatus(refs.status, err.message, 'error');
		} finally {
			busy = false;
		}
	});

	refs.addAdminBtn.addEventListener('click', function onAddAdmin() {
		openAddAdminModal();
	});

	function currentUserId() {
		const user = state.state.user || {};
		return user.id != null ? Number(user.id) : 0;
	}

	async function refreshCurrentUser() {
		try {
			const result = await api.me();
			state.patch({ user: result.user });
		} catch (err) {
		}
	}

	async function reload() {
		const user = state.state.user || {};
		refs.userLabel.textContent = user.username ? 'Signed in as: ' + user.username : '';

		const [usersResult, roomsResult] = await Promise.all([
			api.adminListUsers(),
			api.adminListRooms(),
		]);
		snapshotUsers = Array.isArray(usersResult.users) ? usersResult.users : [];
		snapshotRooms = Array.isArray(roomsResult.rooms) ? roomsResult.rooms : [];
		reconcile();
	}

	function reconcile() {
		reconcileUsers();
		reconcileRooms();
		reconcileAdmins();
	}

	function reconcileUsers() {
		const activeIds = new Set();
		snapshotUsers.forEach(function eachUser(user) {
			const key = String(user.id);
			activeIds.add(key);
			const row = ensureUserRow(user.id);
			row.name.textContent = String(user.username || '');
			const gameCount = Number(user.game_count || 0);
			row.games.textContent = gameCount === 1 ? '1 game' : gameCount + ' games';
			row.select.checked = selectedUserIds.has(key);
			row.item.classList.toggle('selected', selectedUserIds.has(key));
			const canDelete = gameCount === 0 && Number(user.id) !== currentUserId();
			row.deleteBtn.style.display = canDelete ? '' : 'none';
			row.deleteBtn.disabled = !canDelete;
			reconcileTags(row.tags, user);
		});

		Array.from(userRowsById.keys()).forEach(function eachKey(key) {
			if (activeIds.has(key)) {
				return;
			}
			const row = userRowsById.get(key);
			if (row && row.item.parentNode === refs.userList) {
				refs.userList.removeChild(row.item);
			}
			userRowsById.delete(key);
			selectedUserIds.delete(key);
		});
	}

	function ensureUserRow(userId) {
		const key = String(userId);
		if (userRowsById.has(key)) {
			return userRowsById.get(key);
		}

		const item = cloneTemplateNode(userRowTemplate);
		const itemRefs = collectRefs(item);
		itemRefs.select.addEventListener('change', function onSelect() {
			if (itemRefs.select.checked) {
				selectedUserIds.add(key);
			} else {
				selectedUserIds.delete(key);
			}
			item.classList.toggle('selected', itemRefs.select.checked);
		});
		itemRefs.deleteBtn.addEventListener('click', async function onDeleteUser() {
			if (busy) {
				return;
			}

			const snapshot = snapshotUsers.find(function eachUser(entry) {
				return String(entry.id) === key;
			});
			const username = snapshot && snapshot.username ? String(snapshot.username) : 'this user';
			const confirmed = await showConfirmModal({
				title: 'Delete user',
				message: 'Are you sure you want to delete ' + username + '? This cannot be undone.',
				cancelLabel: 'Cancel',
				confirmLabel: 'Delete user',
			});
			if (!confirmed) {
				return;
			}

			busy = true;
			try {
				await api.adminDeleteUser(userId);
				setStatus(refs.status, 'User deleted.', 'ok');
				await refreshCurrentUser();
				await reload();
			} catch (err) {
				setStatus(refs.status, err.message, 'error');
			} finally {
				busy = false;
			}
		});

		const row = {
			item: item,
			select: itemRefs.select,
			name: itemRefs.name,
			games: itemRefs.games,
			tags: itemRefs.tags,
			deleteBtn: itemRefs.deleteBtn,
		};
		userRowsById.set(key, row);
		refs.userList.appendChild(item);
		return row;
	}

	function reconcileTags(container, user) {
		const rooms = Array.isArray(user.rooms) ? user.rooms : [];
		const active = new Set();
		const existing = container._tagRows || new Map();

		rooms.forEach(function eachRoom(room) {
			const key = String(room.id);
			active.add(key);
			let tag = existing.get(key);
			if (!tag) {
				const node = cloneTemplateNode(tagTemplate);
				const tagRefs = collectRefs(node);
				tagRefs.remove.addEventListener('click', async function onRemoveTag(event) {
					event.preventDefault();
					event.stopPropagation();
					if (busy) {
						return;
					}
					busy = true;
					try {
						await api.adminRemoveUserRoom(user.id, room.id);
						await refreshCurrentUser();
						await reload();
					} catch (err) {
						setStatus(refs.status, err.message, 'error');
					} finally {
						busy = false;
					}
				});
				tag = { node: node, label: tagRefs.label };
				existing.set(key, tag);
				container.appendChild(node);
			}
			tag.label.textContent = String(room.name || room.code || 'Room');
		});

		Array.from(existing.keys()).forEach(function eachKey(key) {
			if (active.has(key)) {
				return;
			}
			const tag = existing.get(key);
			if (tag && tag.node.parentNode === container) {
				container.removeChild(tag.node);
			}
			existing.delete(key);
		});

		container._tagRows = existing;
	}

	function reconcileRooms() {
		const activeIds = new Set();
		snapshotRooms.forEach(function eachRoom(room) {
			const key = String(room.id);
			activeIds.add(key);
			const row = ensureRoomRow(room.id);
			row.name.textContent = String(room.name || '');
			row.code.textContent = 'Code: ' + String(room.code || '');
			const gameCount = Number(room.game_count || 0);
			row.games.textContent = gameCount === 1 ? '1 game' : gameCount + ' games';
		});

		Array.from(roomRowsById.keys()).forEach(function eachKey(key) {
			if (activeIds.has(key)) {
				return;
			}
			const row = roomRowsById.get(key);
			if (row && row.item.parentNode === refs.roomList) {
				refs.roomList.removeChild(row.item);
			}
			roomRowsById.delete(key);
		});
	}

	function ensureRoomRow(roomId) {
		const key = String(roomId);
		if (roomRowsById.has(key)) {
			return roomRowsById.get(key);
		}

		const item = cloneTemplateNode(roomRowTemplate);
		const itemRefs = collectRefs(item);
		itemRefs.addBtn.addEventListener('click', async function onAddMembers() {
			if (busy) {
				return;
			}
			const userIds = Array.from(selectedUserIds).map(function eachId(id) {
				return Number(id);
			});
			if (userIds.length === 0) {
				setStatus(refs.status, 'Select one or more users.', 'error');
				return;
			}

			busy = true;
			try {
				await api.adminAddRoomMembers(roomId, userIds);
				setStatus(refs.status, 'Users added to room.', 'ok');
				await refreshCurrentUser();
				await reload();
			} catch (err) {
				setStatus(refs.status, err.message, 'error');
			} finally {
				busy = false;
			}
		});
		itemRefs.editBtn.addEventListener('click', function onEditRoom() {
			const snapshot = snapshotRooms.find(function eachRoom(entry) {
				return String(entry.id) === key;
			});
			if (!snapshot) {
				return;
			}
			openEditRoomModal(snapshot);
		});

		const row = {
			item: item,
			name: itemRefs.name,
			code: itemRefs.code,
			games: itemRefs.games,
			editBtn: itemRefs.editBtn,
		};
		roomRowsById.set(key, row);
		refs.roomList.appendChild(item);
		return row;
	}

	function reconcileAdmins() {
		const admins = snapshotUsers.filter(function eachUser(user) {
			return Number(user.is_admin) === 1;
		});
		const activeIds = new Set();
		admins.forEach(function eachAdmin(user) {
			const key = String(user.id);
			activeIds.add(key);
			const row = ensureAdminRow(user.id);
			row.name.textContent = String(user.username || '');
			const isSelf = Number(user.id) === currentUserId();
			row.remove.disabled = isSelf;
			row.remove.title = isSelf ? 'You cannot remove your own admin access.' : 'Remove admin';
		});

		Array.from(adminRowsById.keys()).forEach(function eachKey(key) {
			if (activeIds.has(key)) {
				return;
			}
			const row = adminRowsById.get(key);
			if (row && row.item.parentNode === refs.adminList) {
				refs.adminList.removeChild(row.item);
			}
			adminRowsById.delete(key);
		});
	}

	function ensureAdminRow(userId) {
		const key = String(userId);
		if (adminRowsById.has(key)) {
			return adminRowsById.get(key);
		}

		const item = cloneTemplateNode(adminRowTemplate);
		const itemRefs = collectRefs(item);
		itemRefs.remove.addEventListener('click', async function onRemoveAdmin() {
			if (busy || Number(userId) === currentUserId()) {
				return;
			}
			busy = true;
			try {
				await api.adminSetUserAdmin(userId, false);
				setStatus(refs.status, 'Admin access removed.', 'ok');
				await reload();
			} catch (err) {
				setStatus(refs.status, err.message, 'error');
			} finally {
				busy = false;
			}
		});

		const row = {
			item: item,
			name: itemRefs.name,
			remove: itemRefs.remove,
		};
		adminRowsById.set(key, row);
		refs.adminList.appendChild(item);
		return row;
	}

	function openEditRoomModal(room) {
		const canDelete = Number(room.game_count || 0) === 0;
		const overlay = createNodeFromHtml(`
			<div class="modal-overlay" data-ref="overlay">
				<div class="modal-card" role="dialog" aria-modal="true" aria-label="Edit room">
					<h3>Edit room</h3>
					<label class="admin-create-field">
						<span>Room name</span>
						<input type="text" data-ref="nameInput">
					</label>
					<label class="admin-create-field">
						<span>Invite code</span>
						<input type="text" data-ref="codeInput">
					</label>
					<div class="status" data-ref="status"></div>
					<div class="modal-actions admin-edit-room-actions">
						<button type="button" class="admin-user-delete" data-ref="deleteBtn">Delete room</button>
						<div data-ref="actionsSpacer"></div>
						<button type="button" data-ref="cancel">Cancel</button>
						<button type="button" class="primary" data-ref="save">Save</button>
					</div>
				</div>
			</div>
		`);
		const modalRefs = collectRefs(overlay);
		modalRefs.actionsSpacer.style.flex = '1';
		modalRefs.nameInput.value = String(room.name || '');
		modalRefs.codeInput.value = String(room.code || '');
		modalRefs.deleteBtn.style.display = canDelete ? '' : 'none';
		modalRefs.deleteBtn.disabled = !canDelete;

		function closeModal() {
			if (overlay.parentNode) {
				overlay.parentNode.removeChild(overlay);
			}
		}

		modalRefs.cancel.addEventListener('click', closeModal);
		overlay.addEventListener('click', function onOverlay(event) {
			if (event.target === overlay) {
				closeModal();
			}
		});
		modalRefs.save.addEventListener('click', async function onSave() {
			if (busy) {
				return;
			}
			busy = true;
			try {
				await api.adminUpdateRoom(room.id, modalRefs.nameInput.value.trim(), modalRefs.codeInput.value.trim());
				setStatus(refs.status, 'Room updated.', 'ok');
				closeModal();
				await refreshCurrentUser();
				await reload();
			} catch (err) {
				setStatus(modalRefs.status, err.message, 'error');
			} finally {
				busy = false;
			}
		});
		modalRefs.deleteBtn.addEventListener('click', async function onDelete() {
			if (busy || !canDelete) {
				return;
			}
			const confirmed = await showConfirmModal({
				title: 'Delete room',
				message: 'Are you sure you want to delete ' + String(room.name || 'this room') + '? This cannot be undone.',
				cancelLabel: 'Cancel',
				confirmLabel: 'Delete room',
			});
			if (!confirmed) {
				return;
			}
			busy = true;
			try {
				await api.adminDeleteRoom(room.id);
				setStatus(refs.status, 'Room deleted.', 'ok');
				closeModal();
				await refreshCurrentUser();
				await reload();
			} catch (err) {
				setStatus(modalRefs.status, err.message, 'error');
			} finally {
				busy = false;
			}
		});

		document.body.appendChild(overlay);
		modalRefs.nameInput.focus();
	}

	function openAddAdminModal() {
		const overlay = createNodeFromHtml(`
			<div class="modal-overlay" data-ref="overlay">
				<div class="modal-card modal-card-wide" role="dialog" aria-modal="true" aria-label="Add admin">
					<h3>Add admin</h3>
					<p class="modal-message">Select one user to grant admin access.</p>
					<div class="admin-modal-user-list" data-ref="list"></div>
					<div class="modal-actions">
						<button type="button" data-ref="cancel">Cancel</button>
					</div>
				</div>
			</div>
		`);
		const modalRefs = collectRefs(overlay);
		const candidates = snapshotUsers.filter(function eachUser(user) {
			return Number(user.is_admin) !== 1;
		});

		if (candidates.length === 0) {
			const empty = document.createElement('p');
			empty.textContent = 'No non-admin users.';
			modalRefs.list.appendChild(empty);
		}

		candidates.forEach(function eachCandidate(user) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'admin-modal-user';
			button.textContent = String(user.username || '');
			button.addEventListener('click', async function onPick() {
				if (busy) {
					return;
				}
				busy = true;
				try {
					await api.adminSetUserAdmin(user.id, true);
					setStatus(refs.status, 'Admin access granted.', 'ok');
					closeModal();
					await reload();
				} catch (err) {
					setStatus(refs.status, err.message, 'error');
				} finally {
					busy = false;
				}
			});
			modalRefs.list.appendChild(button);
		});

		function closeModal() {
			if (overlay.parentNode) {
				overlay.parentNode.removeChild(overlay);
			}
		}

		modalRefs.cancel.addEventListener('click', closeModal);
		overlay.addEventListener('click', function onOverlay(event) {
			if (event.target === overlay) {
				closeModal();
			}
		});
		document.body.appendChild(overlay);
	}

	return {
		root: root,
		load: reload,
		setStatus: function setAdminStatus(text, kind) {
			setStatus(refs.status, text, kind);
		},
	};
}
