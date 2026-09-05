// Test-only radix-2 FFT. Input is already windowed; output is unnormalized.
export function magnitudeSpectrum(input) {
  const n = input.length;
  if (n < 2 || (n & (n - 1))) throw new Error('FFT length must be a power of two');
  const re = Float64Array.from(input), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    for (let base = 0; base < n; base += len) {
      for (let k = 0; k < len / 2; k++) {
        const a = base + k, b = a + len / 2;
        const c = Math.cos(-2 * Math.PI * k / len), s = Math.sin(-2 * Math.PI * k / len);
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  return re.slice(0, n / 2).map((value, i) => Math.hypot(value, im[i]));
}
