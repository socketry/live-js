// Apply an update using the View Transition API when it is available. The update
// always runs exactly once; view transitions are a visual enhancement and must
// not determine whether application state is updated.
export async function transitionView(update, {document = globalThis.document, signal = null} = {}) {
	if (typeof update !== 'function') {
		throw new TypeError('View transition update must be a function.');
	}

	let updateStarted = false;
	let updatePromise = null;
	const runUpdate = () => {
		if (!updateStarted) {
			updateStarted = true;

			try {
				updatePromise = Promise.resolve(update());
			} catch (error) {
				updatePromise = Promise.reject(error);
			}
		}

		return updatePromise;
	};

	if (!document?.startViewTransition || document.hidden || signal?.aborted) {
		return await runUpdate();
	}

	let transition;
	try {
		transition = document.startViewTransition(runUpdate);
	} catch (error) {
		// Starting a visual transition can fail because document state changed.
		// The application update must still be applied.
		return await runUpdate();
	}

	const skipTransition = () => {
		try {
			transition.skipTransition();
		} catch (error) {
			// The transition may already have completed or been skipped.
		}
	};

	signal?.addEventListener('abort', skipTransition, {once: true});

	// A visual transition may be rejected independently of a successful update.
	transition.ready.catch(() => {});
	const finished = transition.finished.catch(() => {});

	try {
		await transition.updateCallbackDone;
		await finished;
		return await updatePromise;
	} finally {
		signal?.removeEventListener('abort', skipTransition);
	}
}
