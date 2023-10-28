import {describe, before, after, it} from 'node:test';
import {ok} from 'node:assert';

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
		
		live = new Live(dom.window, webSocketServerURL);
	});

	after(function () {
		webSocketServer.close();
	});

	it('should connect to the WebSocket server', function () {
		const server = live.connect();
		ok(server);
		live.disconnect();
	});
});