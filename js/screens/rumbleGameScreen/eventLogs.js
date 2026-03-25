import { collectRefs, cloneTemplateNode, createNodeFromHtml, createTemplate } from '../dom.js';
import { placeChildAt } from './normalization.js';

const EVENT_LOGS_SECTION_HTML = `
	<div>
		<h4 data-ref="lastTurnTitle" style="margin-top: 10px;">Last Turn Orders</h4>
		<div class="list" data-ref="lastTurnList">
			<p data-ref="emptyPreviousOrdersNode">No previous turn orders yet.</p>
		</div>

		<h4 data-ref="currentEventLogTitle" style="margin-top: 10px;">Current Round Events</h4>
		<div class="list" data-ref="currentEventLogList">
			<p data-ref="emptyCurrentEventLogNode">No current round events yet.</p>
		</div>

		<h4 data-ref="previousEventLogTitle" style="margin-top: 10px;">Previous Round Events</h4>
		<div class="list" data-ref="previousEventLogList">
			<p data-ref="emptyPreviousEventLogNode">No previous round events yet.</p>
		</div>
	</div>
`;

const PREVIOUS_ORDER_TEMPLATE_HTML = `
	<div class="message-item">
		<small data-ref="meta"></small>
		<div data-ref="text"></div>
	</div>
`;

const EVENT_LOG_TEMPLATE_HTML = `
	<div class="message-item">
		<small data-ref="meta"></small>
		<div data-ref="text"></div>
	</div>
`;

function reconcileEventLogList(eventLogTemplate, options) {
	const list = Array.isArray(options.events) ? options.events : [];
	const active = new Set();

	list.forEach(function eachEvent(event, index) {
		const idPart = Number(event && event.id ? event.id : 0);
		const key = idPart > 0 ? String(idPart) : String(index);
		active.add(key);
		let refs = options.rowMap.get(key);
		if (!refs) {
			const line = cloneTemplateNode(eventLogTemplate);
			const rowRefs = collectRefs(line);
			refs = {
				line,
				meta: rowRefs.meta,
				text: rowRefs.text,
			};
			options.listNode.appendChild(line);
			options.rowMap.set(key, refs);
		}
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

export function createEventLogsController(context) {
	const root = createNodeFromHtml(EVENT_LOGS_SECTION_HTML);
	const refs = collectRefs(root);
	const previousOrderTemplate = createTemplate(PREVIOUS_ORDER_TEMPLATE_HTML);
	const eventLogTemplate = createTemplate(EVENT_LOG_TEMPLATE_HTML);
	const previousOrderRowsById = new Map();
	const currentEventRowsById = new Map();
	const previousEventRowsById = new Map();

	function reconcilePreviousOrdersList() {
		const previousOrders = Array.isArray(context.serverSnapshot.previousRoundOrders) ? context.serverSnapshot.previousRoundOrders : [];
		const active = new Set();

		previousOrders.forEach(function eachOrder(order, index) {
			const key = String(Number(order.user_id || 0)) + ':' + String(index);
			active.add(key);

			let rowRefs = previousOrderRowsById.get(key);
			if (!rowRefs) {
				const line = cloneTemplateNode(previousOrderTemplate);
				const childRefs = collectRefs(line);
				rowRefs = { line, meta: childRefs.meta, text: childRefs.text };
				previousOrderRowsById.set(key, rowRefs);
			}

			rowRefs.meta.textContent = String(order.username || 'Unknown');
			rowRefs.text.textContent = context.describeOrder(order);
			placeChildAt(refs.lastTurnList, rowRefs.line, active.size - 1);
		});

		Array.from(previousOrderRowsById.keys()).forEach(function eachExisting(key) {
			if (active.has(key)) {
				return;
			}

			const rowRefs = previousOrderRowsById.get(key);
			if (rowRefs && rowRefs.line.parentNode === refs.lastTurnList) {
				refs.lastTurnList.removeChild(rowRefs.line);
			}
			previousOrderRowsById.delete(key);
		});

		refs.emptyPreviousOrdersNode.style.display = previousOrders.length === 0 ? '' : 'none';
		if (refs.emptyPreviousOrdersNode.style.display === '' && refs.emptyPreviousOrdersNode.parentNode !== refs.lastTurnList) {
			refs.lastTurnList.appendChild(refs.emptyPreviousOrdersNode);
		}
	}

	function reconcile() {
		const visible = !context.isBiddingPhase();
		root.style.display = visible ? '' : 'none';
		if (!visible) {
			return;
		}

		reconcilePreviousOrdersList();
		reconcileEventLogList(eventLogTemplate, {
			events: context.serverSnapshot.currentRoundEventLog,
			listNode: refs.currentEventLogList,
			emptyNode: refs.emptyCurrentEventLogNode,
			rowMap: currentEventRowsById,
			labelPrefix: 'Current Round',
		});
		reconcileEventLogList(eventLogTemplate, {
			events: context.serverSnapshot.previousRoundEventLog,
			listNode: refs.previousEventLogList,
			emptyNode: refs.emptyPreviousEventLogNode,
			rowMap: previousEventRowsById,
			labelPrefix: 'Previous Round',
		});
	}

	return {
		root,
		reconcile,
	};
}