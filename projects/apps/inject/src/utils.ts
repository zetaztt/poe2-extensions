export function ensureBodyReady(callback: () => void): void {
	if (document.body) {
		callback();
		return;
	}

	document.addEventListener("DOMContentLoaded", callback, {
		once: true,
	});
}
