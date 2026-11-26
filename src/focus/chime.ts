// A soft two-note chime for Focus Mode, made with Web Audio (no sound file,
// so it works offline). Browsers only play sound after the page has been
// interacted with, which starting a focus session always is.

let context: AudioContext | null = null;

/** Call from a click (e.g. starting focus) so later chimes are allowed to play. */
export function primeChime(): void {
	try {
		context ??= new AudioContext();
		if (context.state === "suspended") void context.resume();
	} catch {
		// No Web Audio: focus still works, silently.
	}
}

export function playChime(): void {
	try {
		context ??= new AudioContext();
		const ctx = context;
		if (ctx.state === "suspended") void ctx.resume();
		const start = ctx.currentTime + 0.05;
		for (const [i, freq] of [659.25, 880].entries()) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = freq;
			const t = start + i * 0.28;
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 1.2);
		}
	} catch {
		// No Web Audio.
	}
}
