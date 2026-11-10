let audio: AudioContext | null = null;

/** Two short tones: rising for UP, falling for DOWN. Generated locally; no audio files. */
export function playSignalTone(direction: 'UP' | 'DOWN'): void {
  try {
    audio ??= new AudioContext();
    const [a, b] = direction === 'UP' ? [660, 880] : [880, 520];
    [a, b].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      const start = audio!.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.17);
    });
  } catch {
    // Audio unavailable: the visual flash still shows the signal.
  }
}

/** Pulses an element's outline three times, unless the user prefers reduced motion. */
export function flash(element: HTMLElement | null, direction: 'UP' | 'DOWN'): void {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const color = direction === 'UP' ? 'rgba(52, 211, 153, 0.9)' : 'rgba(244, 63, 94, 0.9)';
  element.animate([{ boxShadow: `0 0 0 3px ${color}` }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700, iterations: 3 });
}
