import {describe, before, after, it} from 'node:test';
import {ok, strict, strictEqual} from 'node:assert';

import {WebSocket} from 'ws';
import {JSDOM} from 'jsdom';
import {Live} from '../Live.js';

describe('Live', function () {
	let dom;
	let webSocketServer;

	const webSocketServerConfig = {port: 3000};
	const webSocketServerURL = `ws://localhost:${webSocketServerConfig.port}/live`;

	before(async function () {
		const listening = new Promise(resolve => {
			webSocketServer = new WebSocket.Server(webSocketServerConfig, resolve);
		});
		
		dom = new JSDOM('<!DOCTYPE html><html><body><div id="my"><p>Hello World</p></div></body></html>');
		// Ensure the WebSocket class is available:
		dom.window.WebSocket = WebSocket;
		
		await new Promise(resolve => dom.window.addEventListener('load', resolve));
		
		await listening;
	});
	
	after(function () {
		webSocketServer.close();
	});
	
	it('should start the live connection', function () {
		const live = Live.start({window: dom.window, base: 'http://localhost/'});
		ok(live);
		
		strictEqual(live.window, dom.window);
		strictEqual(live.document, dom.window.document);
		strictEqual(live.url.href, 'ws://localhost/live');
	});
	
	it('should connect to the WebSocket server', function () {
		const live = new Live(dom.window, webSocketServerURL);
		
		const server = live.connect();
		ok(server);
		
		live.disconnect();
	});
	
	it('should handle visibility changes', function () {
		const live = new Live(dom.window, webSocketServerURL);
		
		var hidden = false;
		Object.defineProperty(dom.window.document, "hidden", {
			get() {return hidden},
		});
		
		live.handleVisibilityChange();
		
		ok(live.server);
		
		hidden = true;
		
		live.handleVisibilityChange();
		
		ok(!live.server);
	});
	
	it('should handle updates', async function () {
		const live = new Live(dom.window, webSocketServerURL);
		
		live.connect();
		
		strictEqual(dom.window.document.getElementById('my').innerHTML, '<p>Hello World</p>');
		
		const connected = new Promise(resolve => {
			webSocketServer.on('connection', resolve);
		});
		
		let socket = await connected;
		
		const reply = new Promise((resolve, reject) => {
			socket.on('message', message => {
				let payload = JSON.parse(message);
				
				// Only care about the reply message:
				if (payload.reply) resolve(payload);
			});
		});
		
		socket.send(
			JSON.stringify(['update', 'my', '<div id="my"><p>Goodbye World!</p></div>', {reply: true}])
		);
		
		await reply;
		
		strictEqual(dom.window.document.getElementById('my').innerHTML, '<p>Goodbye World!</p>');
		
		live.disconnect();
	});
});
