export function canEditShipName(lastMemberRole) {
	return lastMemberRole !== 'none' && lastMemberRole !== 'observer';
}

export function reconcileShipNameEditor(context) {
	const editable = !!context.canEditShipName();
	context.shipNameRow.style.display = editable ? '' : 'none';
	context.shipNameHint.style.display = editable ? '' : 'none';
	if (!editable) {
		return;
	}

	const activeEl = document.activeElement;
	const focused = activeEl === context.shipNameInput;
	const valueFromDraft = String(context.localDraft.shipName || '');
	if (!focused && context.shipNameInput.value !== valueFromDraft) {
		context.shipNameInput.value = valueFromDraft;
	}

	context.shipNameInput.disabled = !!context.shipNameBusy;
	context.saveShipNameBtn.disabled = !!context.shipNameBusy;
	context.saveShipNameBtn.textContent = context.shipNameBusy ? 'Saving...' : 'Save Name';

	const normalizedDraft = String(context.localDraft.shipName || '').trim();
	const normalizedServer = String(context.serverSnapshot.selfShipName || '').trim();
	if (normalizedDraft === '' || normalizedDraft === normalizedServer) {
		context.shipNameHint.textContent = 'Leave blank to use your username.';
	} else {
		context.shipNameHint.textContent = 'Unsaved ship name: ' + normalizedDraft;
	}
}

export function bindShipNameHandlers(context) {
	context.shipNameInput.addEventListener('input', function onShipNameInput() {
		context.localDraft.shipName = String(context.shipNameInput.value || '');
		context.localDraft.dirtyShipName = true;
		context.reconcileUi();
	});

	context.shipNameInput.addEventListener('keydown', function onShipNameKeyDown(event) {
		if (event.key !== 'Enter') {
			return;
		}

		event.preventDefault();
		context.saveShipNameBtn.click();
	});

	context.saveShipNameBtn.addEventListener('click', async function onSaveShipName() {
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
}