
import morphdom from 'morphdom';

export class Live {
	static start(options = {}) {
		let window = options.window || globalThis;
		let path = options.path || 'live'
		let base = options.base || window.location.href;
		
		let url = new URL(path, base);
		url.protocol = url.protocol.replace('http', 'ws');
		
		return new this(window, url);
	}
	
	constructor(window, url) {
		this.window = window;
		this.document = window.document;
		
		this.url = url;
		this.events = [];
		
		this.failures = 0;
		
		// Track visibility state and connect if required:
		this.document.addEventListener("visibilitychange", () => this.handleVisibilityChange());
		this.handleVisibilityChange();
	}
	
	// -- Connection Handling --
	
	connect() {
		if (this.server) return this.server;
		
		let server = this.server = new this.window.WebSocket(this.url);
		
		server.onopen = () => {
			this.failures = 0;
			this.attach();
		};
		
		server.onmessage = (message) => {
			const [name, ..._arguments] = JSON.parse(message.data);
			
			this[name](..._arguments);
		};
		
		// The remote end has disconnected:
		server.addEventListener('error', () => {
			this.failures += 1;
		});
		
		server.addEventListener('close', () => {
			// Explicit disconnect will clear `this.server`:
			if (this.server) {
				// We need a minimum delay otherwise this can end up immediately invoking the callback:
				const delay = Math.max(100 * (this.failures + 1) ** 2, 60000);
				setTimeout(() => this.connect(), delay);
			}
			
			this.server = null;
		});
		
		return server;
	}
	
	disconnect() {
		if (this.server) {
			const server = this.server;
			this.server = null;
			server.close();
		}
	}
	
	send(message) {
		try {
			this.server.send(message);
		} catch (error) {
			this.events.push(message);
		}
	}
	
	flush() {
		if (this.events.length === 0) return;
		
		let events = this.events;
		this.events = [];
		
		for (var event of events) {
			this.send(event);
		}
	}
	
	bind(elements) {
		for (var element of elements) {
			this.send(JSON.stringify({bind: element.id, data: element.dataset}));
		}
	}
	
	bindElementsByClassName(selector = 'live') {
		this.bind(
			this.document.getElementsByClassName(selector)
		);
		
		this.flush();
	}
	
	handleVisibilityChange() {
		if (this.document.hidden) {
			this.disconnect();
		} else {
			this.connect();
		}
	}
	
	attach() {
		if (this.document.readyState === 'loading') {
			this.document.addEventListener('DOMContentLoaded', () => this.bindElementsByClassName());
		} else {
			this.bindElementsByClassName();
		}
	}
	
	createDocumentFragment(html) {
		return this.document.createRange().createContextualFragment(html);
	}
	
	reply(payload) {
		this.send(JSON.stringify(payload));
	}
	
	// -- RPC Methods --
	
	update(id, html, options) {
		let element = this.document.getElementById(id);
		let fragment = this.createDocumentFragment(html);
		
		morphdom(element, fragment);
		
		if (options.reply) this.reply({reply: options.reply});
	}
	
	replace(selector, html, options) {
		let elements = this.document.querySelectorAll(selector);
		let fragment = this.createDocumentFragment(html);
		
		elements.forEach(element => morphdom(element, fragment.cloneNode(true)));
		
		if (options.reply) this.reply({reply: options.reply});
	}
	
	prepend(selector, html, options) {
		let elements = this.document.querySelectorAll(selector);
		let fragment = this.createDocumentFragment(html);
		
		elements.forEach(element => element.prepend(fragment.cloneNode(true)));
		
		if (options.reply) this.reply({reply: options.reply});
	}
	
	append(selector, html, options) {
		let elements = this.document.querySelectorAll(selector);
		let fragment = this.createDocumentFragment(html);
		
		elements.forEach(element => element.append(fragment.cloneNode(true)));
		
		if (options.reply) this.reply({reply: options.reply});
	}
	
	remove(selector, options) {
		let elements = this.document.querySelectorAll(selector);
		
		elements.forEach(element => element.remove());
		
		if (options.reply) this.reply({reply: options.reply});
	}
	
	dispatchEvent(selector, type, options) {
		let element = this.document.querySelector(selector);
		
		elements.forEach(element => element.dispatchEvent(
			new CustomEvent(type, options)
		));
	}
	
	// -- Event Handling --
	
	trigger(id, event) {
		this.connect();
		
		this.send(
			JSON.stringify({id: id, event: event})
		);
	}
	
	forward(id, event, detail) {
		event.preventDefault();
		
		this.trigger(id, {type: event.type, detail: detail});
	}
	
	forwardFormData(id, event, detail) {
		event.preventDefault();
		
		let form = event.form;
		let formData = new FormData(form);
		
		this.trigger(id, {type: event.type, detail: detail, formData: [...formData]});
	}
}
