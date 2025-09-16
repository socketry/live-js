import {describe, before, beforeEach, after, it} from 'node:test';
import {ok, strict, strictEqual, deepStrictEqual} from 'node:assert';

import {WebSocket} from 'ws';
import {JSDOM} from 'jsdom';

// We need to have a single global JSDOM because we are testing a sub-class of HTMLElement:
const DOM = new JSDOM();
globalThis.HTMLElement = DOM.window.HTMLElement;
DOM.window.WebSocket = WebSocket;

let {Live, ViewElement} = await import('../Live.js');

class Queue {
	constructor() {
		this.items = [];
		this.waiting = [];
	}

	push(item) {
		if (this.waiting.length > 0) {
			let resolve = this.waiting.shift();
			resolve(item);
		} else {
			this.items.push(item);
		}
	}

	pop() {
		return new Promise(resolve => {
			if (this.items.length > 0) {
				resolve(this.items.shift());
			} else {
				this.waiting.push(resolve);
			}
		});
	}
	
	async popUntil(callback) {
		while (true) {
			let item = await this.pop();
			if (callback(item)) return item;
		}
	}
	
	clear() {
		this.items = [];
		this.waiting = [];
	}
}

describe('Live', function () {
	let webSocketServer;
	let messages = new Queue();

	const webSocketServerConfig = {port: 3000};
	const webSocketServerURL = new URL(`ws://localhost:${webSocketServerConfig.port}/live`);

	before(async function () {
		const listening = new Promise((resolve, reject) => {
			webSocketServer = new WebSocket.Server(webSocketServerConfig, resolve);
			webSocketServer.on('error', reject);
		});
		
		// Define the custom element in the test DOM:
		DOM.window.customElements.define('live-view', ViewElement);
		DOM.window.document.body.innerHTML = '<live-view id="my" class="live"><p>Hello World</p></live-view>';
		
		await listening;
		
		webSocketServer.on('connection', socket => {
			socket.on('message', message => {
				let payload = JSON.parse(message);
				messages.push(payload);
			});
		});
	});
	
	beforeEach(function () {
		DOM.window.live = null;
		messages.clear();
	});
	
	after(async function () {
		return new Promise((resolve) => {
			webSocketServer.close(() => {
				resolve();
			});
		});
	});
	
	it('should start the live connection', function () {
		const live = Live.start({window: DOM.window, base: 'http://localhost/'});
		
		ok(live);
		
		strictEqual(live.url.href, 'ws://localhost/live');
		
		live.disconnect();
	});
	
	it('should connect to the WebSocket server', function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		const server = live.connect();
		ok(server);
		
		live.disconnect();
	});
	
	it('should handle visibility changes', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		// It's tricky to test the method directly.
		// - Changing document.hidden is a hack.
		// - Sending custom events seems to cause a hang.
		
		live.connect();
		deepStrictEqual(await messages.pop(), ['bind', 'my', {}]);
		
		live.disconnect();
		
		live.connect()
		deepStrictEqual(await messages.pop(), ['bind', 'my', {}]);
		
		live.disconnect();
	});
	
	it('can execute scripts', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['script', 'my', 'return 1+2', {reply: true}])
		);
		
		let successReply = await messages.popUntil(message => message[0] == 'reply');
		strictEqual(successReply[2], 3);
		
		socket.send(
			JSON.stringify(['script', 'my', 'throw new Error("Test Error")', {reply: true}])
		);
		
		let errorReply = await messages.popUntil(message => message[0] == 'reply');
		strictEqual(errorReply[2], null);
		
		live.disconnect();
	});
	
	it('should handle updates', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['update', 'my', '<live-view id="my"><p>Goodbye World!</p></live-view>', {reply: true}])
		);
		
		await messages.popUntil(message => message[0] == 'reply');
		
		strictEqual(DOM.window.document.getElementById('my').innerHTML, '<p>Goodbye World!</p>');
		
		live.disconnect();
	});
	
	it('should handle updates with child live elements', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		DOM.window.live = live;
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['update', 'my', '<live-view id="my"><live-view id="mychild" class="live"></live-view></live-view>'])
		);
		
		let payload = await messages.popUntil(message => message[0] == 'bind' && message[1] == 'mychild');
		deepStrictEqual(payload, ['bind', 'mychild', {}]);
		
		live.disconnect();
	});
	
	it('can unbind removed elements', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		DOM.window.live = live;
		
		live.connect();
		
		DOM.window.document.body.innerHTML = '<live-view id="my" class="live"><p>Hello World</p></live-view>';
		
		DOM.window.document.getElementById('my').remove();
		
		let payload = await messages.popUntil(message => message[0] == 'unbind' && message[1] == 'my');
		
		deepStrictEqual(payload, ['unbind', 'my']);
		
		live.disconnect();
	});
	
	it('should handle replacements', async function () {
		DOM.window.document.body.innerHTML = '<live-view id="my"><p>Hello World</p></live-view>';
		
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['replace', '#my p', '<p>Replaced!</p>', {reply: true}])
		);
		
		await messages.popUntil(message => message[0] == 'reply');
		strictEqual(DOM.window.document.getElementById('my').innerHTML, '<p>Replaced!</p>');
		
		live.disconnect();
	});
	
	it('should handle prepends', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['update', 'my', '<live-view id="my"><p>Middle</p></live-view>'])
		);
		
		socket.send(
			JSON.stringify(['prepend', '#my', '<p>Prepended!</p>', {reply: true}])
		);
		
		await messages.popUntil(message => message[0] == 'reply');
		strictEqual(DOM.window.document.getElementById('my').innerHTML, '<p>Prepended!</p><p>Middle</p>');
		
		live.disconnect();
	});
	
	it('should handle appends', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['update', 'my', '<live-view id="my"><p>Middle</p></live-view>'])
		);
		
		socket.send(
			JSON.stringify(['append', '#my', '<p>Appended!</p>', {reply: true}])
		);
		
		await messages.popUntil(message => message[0] == 'reply');
		strictEqual(DOM.window.document.getElementById('my').innerHTML, '<p>Middle</p><p>Appended!</p>');
		
		live.disconnect();
	});
	
	it ('should handle removals', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['update', 'my', '<live-view id="my"><p>Middle</p></live-view>'])
		);
		
		socket.send(
			JSON.stringify(['remove', '#my p', {reply: true}])
		);
		
		await messages.popUntil(message => message[0] == 'reply');
		strictEqual(DOM.window.document.getElementById('my').innerHTML, '');
		
		live.disconnect();
	});
	
	it ('can dispatch custom events', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		socket.send(
			JSON.stringify(['dispatchEvent', '#my', 'click', {reply: true}])
		);
		
		await messages.popUntil(message => message[0] == 'reply');
		
		live.disconnect();
	});
	
	it ('can forward events', async function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.connect();
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		DOM.window.document.getElementById('my').addEventListener('click', event => {
			live.forwardEvent('my', event);
		});
		
		DOM.window.document.getElementById('my').click();
		
		let payload = await messages.popUntil(message => message[0] == 'event');
		strictEqual(payload[1], 'my');
		strictEqual(payload[2].type, 'click');
		
		live.disconnect();
	});
	
	it ('can log errors', function () {
		const live = new Live(DOM.window, webSocketServerURL);
		
		live.error('my', 'Test Error');
	});
});
