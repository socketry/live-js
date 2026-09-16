import {describe, it} from 'node:test';
import {ok, rejects, strictEqual} from 'node:assert';

import {JSDOM} from 'jsdom';

const DOM = new JSDOM();
globalThis.HTMLElement = DOM.window.HTMLElement;

const {ViewElement} = await import('../Live.js');
const {transitionView} = await import('../Transition.js');

function viewTransitionDocument() {
	let transitions = 0;
	let skipped = 0;

	return {
		hidden: false,
		get transitions() {return transitions;},
		get skipped() {return skipped;},
		startViewTransition(update) {
			transitions += 1;
			const updateCallbackDone = Promise.resolve().then(update);

			return {
				ready: Promise.resolve(),
				updateCallbackDone,
				finished: updateCallbackDone,
				skipTransition() {skipped += 1;},
			};
		},
	};
}

describe('transitionView', function () {
	it('applies asynchronous updates within a view transition', async function () {
		const document = viewTransitionDocument();
		let release;
		const ready = new Promise(resolve => release = resolve);
		let updated = false;

		const result = transitionView(async () => {
			updated = true;
			await ready;
			return 42;
		}, {document});

		await Promise.resolve();
		strictEqual(updated, true);
		strictEqual(document.transitions, 1);

		release();
		strictEqual(await result, 42);
	});

	it('updates directly when view transitions are unavailable', async function () {
		let updates = 0;
		const result = await transitionView(() => {
			updates += 1;
			return 'updated';
		}, {document: {hidden: false}});

		strictEqual(updates, 1);
		strictEqual(result, 'updated');
	});

	it('updates directly when the document is hidden', async function () {
		const document = viewTransitionDocument();
		document.hidden = true;

		await transitionView(() => {}, {document});
		strictEqual(document.transitions, 0);
	});

	it('still updates exactly once when starting the transition fails', async function () {
		let updates = 0;
		const document = {
			hidden: false,
			startViewTransition() {throw new DOM.window.DOMException('Document hidden', 'InvalidStateError');},
		};

		await transitionView(() => updates += 1, {document});
		strictEqual(updates, 1);
	});

	it('skips an active transition when its lifecycle is aborted', async function () {
		const document = viewTransitionDocument();
		const abortController = new AbortController();
		let release;
		const ready = new Promise(resolve => release = resolve);

		const result = transitionView(() => ready, {
			document,
			signal: abortController.signal,
		});

		await Promise.resolve();
		abortController.abort();
		strictEqual(document.skipped, 1);

		release();
		await result;
	});

	it('propagates errors from the application update', async function () {
		const error = new Error('Update failed');
		await rejects(transitionView(() => {throw error;}, {
			document: viewTransitionDocument(),
		}), error);
	});
});

describe('ViewElement', function () {
	it('provides a new AbortSignal for each connection lifetime', function () {
		let events = 0;
		class TestView extends ViewElement {
			connectedCallback() {
				super.connectedCallback();
				this.addEventListener('ping', () => events += 1, {signal: this.signal});
			}
		}
		DOM.window.customElements.define('test-view', TestView);

		const component = DOM.window.document.createElement('test-view');
		component.id = 'test-view';
		const firstSignal = component.signal;
		DOM.window.document.body.append(component);
		strictEqual(firstSignal.aborted, false);
		component.dispatchEvent(new DOM.window.Event('ping'));
		strictEqual(events, 1);

		component.remove();
		strictEqual(firstSignal.aborted, true);
		component.dispatchEvent(new DOM.window.Event('ping'));
		strictEqual(events, 1);

		DOM.window.document.body.append(component);
		strictEqual(component.signal.aborted, false);
		ok(component.signal !== firstSignal);
		component.dispatchEvent(new DOM.window.Event('ping'));
		strictEqual(events, 2);

		component.remove();
	});

	it('skips a view-owned transition when disconnected', async function () {
		class TransitionView extends ViewElement {}
		DOM.window.customElements.define('transition-view', TransitionView);

		const document = DOM.window.document;
		const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
		const startViewTransition = document.startViewTransition;
		let skipped = 0;
		let release;
		const ready = new Promise(resolve => release = resolve);

		Object.defineProperty(document, 'hidden', {configurable: true, value: false});
		document.startViewTransition = update => {
			const updateCallbackDone = Promise.resolve().then(update);
			return {
				ready: Promise.resolve(),
				updateCallbackDone,
				finished: updateCallbackDone,
				skipTransition() {skipped += 1;},
			};
		};

		try {
			const component = document.createElement('transition-view');
			component.id = 'transition-view';
			document.body.append(component);
			const transition = transitionView(() => ready, {
				document,
				signal: component.signal,
			});
			await Promise.resolve();

			component.remove();
			strictEqual(skipped, 1);

			release();
			await transition;
		} finally {
			if (hidden) {
				Object.defineProperty(document, 'hidden', hidden);
			} else {
				delete document.hidden;
			}

			if (startViewTransition === undefined) {
				delete document.startViewTransition;
			} else {
				document.startViewTransition = startViewTransition;
			}
		}
	});
});
