
class Live {
	constructor(document, url) {
		this.document = document;
		
		this.url = url;
		this.events = [];
		
		this.failures = 0;
	}
	
	connect() {
		if (this.server) return;
		
		let server = new WebSocket(this.url.href);
		this.server = server;
		
		server.onopen = () => {
			this.failures = 0;
			this.attach();
		}
		
		server.onmessage = (message) => this.handle(JSON.parse(message.data));
		
		server.onerror = () => {
			this.failures += 1;
			server.close();
		}
		
		server.onclose = () => {
			this.server = null;
			let delay = 100 * this.failures ** 2;
			setTimeout(() => this.connect(), delay > 60000 ? 60000 : delay);
		};
	}
	
	handle(message) {
		if (message.id) {
			let element = document.getElementById(message.id);
			
			let html = message.html;
			if (html) {
				morphdom(element, html);
			}
			
			let event = message.event;
			if (event) {
				element.dispatchEvent(
					new CustomEvent(event.type, event)
				)
			}
		}
	}
	
	trigger(id, event) {
		this.connect();
		
		this.send(
			JSON.stringify({id: id, event: event})
		);
	}
	
	forward(id, event, details) {
		this.trigger(id, {type: event.type, details: details})
	}
	
	send(message) {
		try {
			this.server.send(message);
		} catch (error) {
			this.events.push(message)
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
	
	bindElementsByClassName(className = 'live') {
		this.bind(
			this.document.getElementsByClassName(className)
		);
		
		this.flush();
	}
	
	attach() {
		if (this.document.readyState === 'loading') {
			this.document.addEventListener('DOMContentLoaded', this.bindElementsByClassName);
		} else {
			this.bindElementsByClassName();
		}
	}
}

let url = new URL('live', window.location.href);
url.protocol = url.protocol.replace('http', 'ws');

let live = new Live(document, url);
live.connect();

export default live;
