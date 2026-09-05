import { magnitudeSpectrum } from './fft.mjs';
// Independent, deterministic waveform oracle using the Web Audio Blackman window.
export const SAMPLE_RATE = 48000;
export const FFT_SIZE = 8192;
export function noteMidi(note) {
  const [, letter, accidental, octave] = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  return (Number(octave) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter]
    + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}
export function pianoSpectrum(notes, {
  fundamentals = notes.map(() => 1), weights = notes.map(() => 1),
  inharmonicity = 0.00035, octaveShift = 0, partials = [1, .62, .38, .25, .17, .12, .085, .06],
} = {}) {
  const n = FFT_SIZE, re = new Float64Array(n);
  notes.forEach((note, j) => {
    const f0 = 440 * 2 ** ((noteMidi(note) + octaveShift * 12 - 69) / 12);
    partials.forEach((amplitude, k) => {
      const h = k + 1, frequency = f0 * h * Math.sqrt(1 + inharmonicity * h * h);
      if (frequency >= SAMPLE_RATE / 2) return;
      const gain = amplitude * weights[j] * (k === 0 ? fundamentals[j] : 1);
      for (let i = 0; i < n; i++) re[i] += gain * Math.sin(2 * Math.PI * frequency * i / SAMPLE_RATE + .37 * j + .19 * h);
    });
  });
  for (let i = 0; i < n; i++) re[i] *= .42 - .5 * Math.cos(2 * Math.PI * i / n) + .08 * Math.cos(4 * Math.PI * i / n);
  return magnitudeSpectrum(re).map(value => value / n);
}
