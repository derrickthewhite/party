import { collectRefs, cloneTemplateNode } from '../dom.js';
import { placeChildAt } from './normalization.js';

export function ensureEventRow(context, eventListMap, key, listNode) {
	if (eventListMap.has(key)) {
		return eventListMap.get(key);
	}

	const line = cloneTemplateNode(context.eventLogTemplate);
	const rowRefs = collectRefs(line);
	const refs = {
		line,
		meta: rowRefs.meta,
		text: rowRefs.text,
	};
	listNode.appendChild(line);
	eventListMap.set(key, refs);
	return refs;
}

export function reconcileEventLogList(context, options) {
	const list = Array.isArray(options.events) ? options.events : [];
	const active = new Set();

	list.forEach(function eachEvent(event, index) {
		const idPart = Number(event && event.id ? event.id : 0);
		const key = idPart > 0 ? String(idPart) : String(index);
		active.add(key);
		const refs = ensureEventRow(context, options.rowMap, key, options.listNode);
		const effectKey = String(event && event.effect_key ? event.effect_key : 'event');
		refs.meta.textContent = options.labelPrefix + ' • ' + effectKey;
		refs.text.textContent = String(event && event.text ? event.text : 'No event details.');
		placeChildAt(options.listNode, refs.line, active.size - 1);
	});

	Array.from(options.rowMap.keys()).forEach(function eachExisting(key) {
		if (active.has(key)) {
			return;
		}

		const refs = options.rowMap.get(key);
		if (refs && refs.line.parentNode === options.listNode) {
			options.listNode.removeChild(refs.line);
		}
		options.rowMap.delete(key);
	});

	options.emptyNode.style.display = list.length === 0 ? '' : 'none';
	if (options.emptyNode.style.display === '' && options.emptyNode.parentNode !== options.listNode) {
		options.listNode.appendChild(options.emptyNode);
	}
}

export function reconcilePreviousOrdersList(context) {
	const previousOrders = Array.isArray(context.serverSnapshot.previousRoundOrders) ? context.serverSnapshot.previousRoundOrders : [];
	const active = new Set();

	previousOrders.forEach(function eachOrder(order, index) {
		const key = String(Number(order.user_id || 0)) + ':' + String(index);
		active.add(key);

		let refs = context.previousOrderRowsById.get(key);
		if (!refs) {
			const line = cloneTemplateNode(context.previousOrderTemplate);
			const rowRefs = collectRefs(line);
			refs = { line, meta: rowRefs.meta, text: rowRefs.text };
			context.previousOrderRowsById.set(key, refs);
		}

		refs.meta.textContent = String(order.username || 'Unknown');
		refs.text.textContent = context.describeOrder(order);
		placeChildAt(context.lastTurnList, refs.line, active.size - 1);
	});

	Array.from(context.previousOrderRowsById.keys()).forEach(function eachExisting(key) {
		if (active.has(key)) {
			return;
		}

		const refs = context.previousOrderRowsById.get(key);
		if (refs && refs.line.parentNode === context.lastTurnList) {
			context.lastTurnList.removeChild(refs.line);
		}
		context.previousOrderRowsById.delete(key);
	});

	context.emptyPreviousOrdersNode.style.display = previousOrders.length === 0 ? '' : 'none';
	if (context.emptyPreviousOrdersNode.style.display === '' && context.emptyPreviousOrdersNode.parentNode !== context.lastTurnList) {
		context.lastTurnList.appendChild(context.emptyPreviousOrdersNode);
	}
}