import {describe, before, after, it} from 'node:test';
import {ok, strict, strictEqual} from 'node:assert';

import {WebSocket} from 'ws';
import {JSDOM} from 'jsdom';
import {Live} from '../Live.js';

describe('Live', function () {
	let dom;
	let live;
	let webSocketServer;

	const webSocketServerConfig = {port: 3000};
	const webSocketServerURL = `ws://localhost:${webSocketServerConfig.port}/live`;

	before(async function () {
		const listening = new Promise(resolve => {
			webSocketServer = new WebSocket.Server(webSocketServerConfig, resolve);
		});
		
		dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
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
});
