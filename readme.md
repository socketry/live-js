# Live.js

A JavaScript client library for building interactive web applications with Ruby Live framework.

[![Development Status](https://github.com/socketry/live-js/workflows/Test/badge.svg)](https://github.com/socketry/live-js/actions?workflow=Test)

## Features

- **Real-time Communication**: WebSocket-based client-server communication.
- **DOM Manipulation**: Efficient updating, replacing, and modifying HTML elements.
- **Event Forwarding**: Forward client events to server for processing.
- **Controller Loading**: Declarative JavaScript controller loading with `data-live-controller`.
- **Automatic Cleanup**: Proper lifecycle management and memory cleanup.
- **Live Elements**: Automatic binding and unbinding of live elements.
- **Lifecycle-aware Views**: Connection-scoped cancellation for listeners and asynchronous work.
- **View Transitions**: Optional progressive enhancement for coordinated UI updates.

## Usage

### Installation

```bash
npm install @socketry/live
```

### Basic Setup

```javascript
import { Live } from '@socketry/live';

// Start the live connection
const live = Live.start({
  path: 'live',  // WebSocket endpoint
  base: window.location.href
});
```

### Lifecycle-aware Live Views

`ViewElement` provides an `AbortSignal` scoped to its current connection to the document. The signal is aborted when the element disconnects and renewed if it reconnects.

```javascript
import {ViewElement} from '@socketry/live';

class SearchResults extends ViewElement {
  connectedCallback() {
    super.connectedCallback();

    this.addEventListener('input', this.refresh, {signal: this.signal});
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
```

Subclasses implementing `connectedCallback()` or `disconnectedCallback()` must invoke the corresponding superclass method. Pass `this.signal` to browser APIs which accept an `AbortSignal`, and explicitly settle promises waiting for APIs which do not.

### Customizing Live View Updates

When an update target implements `morph(fragment, options)`, Live.js delegates reconciliation to that method. Otherwise, it updates the target directly with morphdom. `ViewElement` provides the standard morphdom implementation, while other elements may opt in without inheriting from a particular class.

```javascript
class PresentationView extends ViewElement {
  morph(fragment, options = {}) {
    super.morph(fragment, options);
    this.updateLayout();
  }
}
```

`morph()` is synchronous: implementations should complete DOM reconciliation before returning, after which Live.js sends any requested protocol reply.

The hook belongs to the element directly targeted by `Live.update()`. A parent morph reconciles its light-DOM descendants as one operation; morphdom preserves nested elements with stable IDs and matching tag names. Components requiring an isolated rendering boundary can use Shadow DOM.

### View Transitions

The optional `transitionView(update, options)` helper applies an update through the browser View Transition API. The update may return a promise; the browser does not capture the new visual state until it settles.

```javascript
import {ViewElement} from '@socketry/live';
import {transitionView} from '@socketry/live/Transition';

class AudioPlayer extends ViewElement {
  async load(source) {
    await transitionView(async () => {
      this.audio.src = source;
      await mediaReady(this.audio, this.signal);
    }, {document: this.ownerDocument, signal: this.signal});
  }
}
```

The helper treats View Transitions as progressive enhancement:

- The application update always runs exactly once.
- Hidden documents and browsers without View Transitions update immediately.
- Disconnecting the owning view skips the visual transition without undoing the update.
- Errors from the application update are still reported to the caller.

#### Best Practices

- Render a stable structure first; transitions should not conceal avoidable layout shifts.
- Use morphdom to preserve element identity, and transitions only for meaningful visual state changes.
- Resolve asynchronous readiness from lifecycle events rather than arbitrary timeouts.
- Keep transition names, animation timing, and reduced-motion behavior in application CSS.
- Let the outermost view coordinating an update own its transition; avoid nested View Transitions.
- Keep the transition owner connected for the complete update. When replacing a child, its stable parent should own the transition.
- Initial rendering has no previous browser snapshot. Render complete markup or a correctly sized stable shell.

### Controller Loading

Live.js supports declarative controller loading using the `data-live-controller` attribute:

```html
<div class="live" id="game" data-live-controller="/static/game_controller.mjs">
  <!-- Game content -->
</div>
```

```javascript
// game_controller.mjs
export default function(element) {
  console.log('Controller loaded for:', element);
  
  // Setup your controller logic
  element.addEventListener('click', handleClick);
  
  // Return a controller object with cleanup
  return {
    dispose() {
      element.removeEventListener('click', handleClick);
    }
  };
}
```

## API Reference

### ViewElement Class

- `signal` - `AbortSignal` for the element's current connection lifetime.
- `morph(fragment, options)` - Synchronously reconcile the view with a new document fragment. The default implementation uses morphdom directly.

### View Transition Extension

Import this optional helper from `@socketry/live/Transition`.

- `transitionView(update, options)` - Apply a synchronous or asynchronous update with progressive View Transition enhancement.
  - `update` - Function performing the application update. Its return value is returned to the caller; a returned promise delays capture of the new visual state.
  - `options.document` - Document which owns the transition (defaults to `globalThis.document`).
  - `options.signal` - Optional lifecycle signal. Aborting it skips the visual transition without suppressing the update.

### Live Class

#### Static Methods

- `Live.start(options)` - Create and start a new Live instance
  - `options.window` - Window object (defaults to globalThis)
  - `options.path` - WebSocket path (defaults to 'live')
  - `options.base` - Base URL (defaults to window.location.href)

#### Instance Methods

##### Connection Management
- `connect()` - Establish WebSocket connection
- `disconnect()` - Close WebSocket connection

##### DOM Manipulation
- `update(id, html, options)` - Update element content
- `replace(selector, html, options)` - Replace elements
- `prepend(selector, html, options)` - Prepend content
- `append(selector, html, options)` - Append content  
- `remove(selector, options)` - Remove elements

##### Event Handling
- `forward(id, event)` - Forward event to server
- `forwardEvent(id, event, detail, preventDefault)` - Forward DOM event
- `forwardFormEvent(id, event, detail, preventDefault)` - Forward form event

##### Script Execution
- `script(id, code, options)` - Execute JavaScript code
- `loadController(id, path, options)` - Load JavaScript controller

##### Event Dispatching
- `dispatchEvent(selector, type, options)` - Dispatch custom events

### Options Parameter

Most methods accept an `options` parameter with:
- `options.reply` - If truthy, server will reply with `{reply: options.reply}`

### Controller Pattern

Controllers are JavaScript modules that manage view-specific behavior:

```javascript
// Simple controller
export default function(element) {
  // Setup code
  return {
    dispose() {
      // Cleanup code
    }
  };
}

// With options
export default function(element, options) {
  const config = options.config || {};
  // Use config...
}
```

## Live Elements

Elements with the `live` CSS class are automatically managed:

```html
<div class="live" id="my-element">
  Content that can be updated
</div>
```

## Event Examples

### Basic Event Forwarding

```javascript
// Forward click events
element.addEventListener('click', (event) => {
  live.forwardEvent('my-element', event, { button: 'clicked' });
});

// Forward form submissions
form.addEventListener('submit', (event) => {
  live.forwardFormEvent('my-form', event, { action: 'submit' });
});
```

## Contributing

We welcome contributions to this project.

1.  Fork it.
2.  Create your feature branch (`git checkout -b my-new-feature`).
3.  Commit your changes (`git commit -am 'Add some feature'`).
4.  Push to the branch (`git push origin my-new-feature`).
5.  Create new Pull Request.

### Developer Certificate of Origin

In order to protect users of this project, we require all contributors to comply with the [Developer Certificate of Origin](https://developercertificate.org/). This ensures that all contributions are properly licensed and attributed.

### Community Guidelines

This project is best served by a collaborative and respectful environment. Treat each other professionally, respect differing viewpoints, and engage constructively. Harassment, discrimination, or harmful behavior is not tolerated. Communicate clearly, listen actively, and support one another. If any issues arise, please inform the project maintainers.

## See Also

  - [lively](https://github.com/socketry/lively) — Ruby framework for building interactive web applications.
  - [live](https://github.com/socketry/live) — Provides client-server communication using websockets.
  - [live-audio-js](https://github.com/socketry/live-audio-js) — Web Audio API-based game audio synthesis library.
