import assert from 'node:assert/strict';
import { magnitudeSpectrum } from './helpers/fft.mjs';
// Compare against the previous direct transform, including an original-sized
// 4096-sample window. This checks bin order, sign, and normalization independently.
for (const n of [16, 64, 4096]) {
  const input = Float64Array.from({ length: n }, (_, i) =>
    (Math.sin(i * .723) + .4 * Math.cos(i * .173) + .01 * ((i * 17) % 23)) * (.5 - .5 * Math.cos(2 * Math.PI * i / (n - 1))));
  const actual = magnitudeSpectrum(input);
  for (let k = 0; k < n / 2; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      re += input[i] * Math.cos(-2 * Math.PI * k * i / n);
      im += input[i] * Math.sin(-2 * Math.PI * k * i / n);
    }
    const expected = Math.hypot(re, im);
    assert.ok(Math.abs(actual[k] - expected) < 1e-8 * Math.max(1, expected), `n=${n}, bin=${k}`);
  }
}
console.log('ok - test FFT agrees with the direct DFT through 4096 samples');
