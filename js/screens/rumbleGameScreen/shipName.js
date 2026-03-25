import { collectRefs, createNodeFromHtml } from '../dom.js';

const SHIP_NAME_SECTION_HTML = `
	<div>
		<div class="row mobile-stack" data-ref="shipNameRow" style="align-items: center; margin: 6px 0 8px 0;">
			<label style="min-width: 90px;" for="rumble-ship-name-input">Ship name</label>
			<input id="rumble-ship-name-input" type="text" maxlength="60" placeholder="Enter ship name" data-ref="shipNameInput">
			<button data-ref="saveShipNameBtn">Save Name</button>
		</div>
		<p data-ref="shipNameHint" style="margin: 0 0 8px 0; opacity: 0.85;">Leave blank to use your username.</p>
	</div>
`;

export function canEditShipName(lastMemberRole) {
	return lastMemberRole !== 'none' && lastMemberRole !== 'observer';
}

export function createShipNameController(context) {
	const root = createNodeFromHtml(SHIP_NAME_SECTION_HTML);
	const refs = collectRefs(root);
	refs.shipNameInput.style.flex = '1';

	refs.shipNameInput.addEventListener('input', function onShipNameInput() {
		context.localDraft.shipName = String(refs.shipNameInput.value || '');
		context.localDraft.dirtyShipName = true;
		context.reconcileUi();
	});

	refs.shipNameInput.addEventListener('keydown', function onShipNameKeyDown(event) {
		if (event.key !== 'Enter') {
			return;
		}

		event.preventDefault();
		refs.saveShipNameBtn.click();
	});

	refs.saveShipNameBtn.addEventListener('click', async function onSaveShipName() {
		if (!context.getLastGameId() || context.isShipNameBusy() || !context.canEditShipName()) {
			return;
		}

		const nextShipName = String(context.localDraft.shipName || '');
		context.setShipNameBusy(true);
		context.reconcileUi();
		try {
			await context.api.setRumbleShipName(context.getLastGameId(), nextShipName);
			context.localDraft.dirtyShipName = false;
			await context.refreshRumbleState({ silent: true });
			context.setStatusNode('Ship name updated.', 'ok');
		} catch (err) {
			context.setStatusNode(err.message || 'Unable to update ship name.', 'error');
		} finally {
			context.setShipNameBusy(false);
			context.reconcileUi();
		}
	});

	function reconcile() {
		const editable = !!context.canEditShipName();
		refs.shipNameRow.style.display = editable ? '' : 'none';
		refs.shipNameHint.style.display = editable ? '' : 'none';
		if (!editable) {
			return;
		}

		const activeEl = document.activeElement;
		const focused = activeEl === refs.shipNameInput;
		const valueFromDraft = String(context.localDraft.shipName || '');
		if (!focused && refs.shipNameInput.value !== valueFromDraft) {
			refs.shipNameInput.value = valueFromDraft;
		}

		const shipNameBusy = !!context.isShipNameBusy();
		refs.shipNameInput.disabled = shipNameBusy;
		refs.saveShipNameBtn.disabled = shipNameBusy;
		refs.saveShipNameBtn.textContent = shipNameBusy ? 'Saving...' : 'Save Name';

		const normalizedDraft = String(context.localDraft.shipName || '').trim();
		const normalizedServer = String(context.serverSnapshot.selfShipName || '').trim();
		if (normalizedDraft === '' || normalizedDraft === normalizedServer) {
			refs.shipNameHint.textContent = 'Leave blank to use your username.';
		} else {
			refs.shipNameHint.textContent = 'Unsaved ship name: ' + normalizedDraft;
		}
	}

	return {
		root,
		reconcile,
	};
}