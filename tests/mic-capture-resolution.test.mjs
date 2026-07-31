import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const micSource = fs.readFileSync(new URL('../js/mic-capture.js', import.meta.url), 'utf8');

async function defaultAnalyserResolution(sampleRate) {
  let liveAnalyser = null;

  class FakeAnalyser {
    constructor() {
      this.fftSize = 2048;
      this.smoothingTimeConstant = 0;
    }

    get frequencyBinCount() {
      return this.fftSize / 2;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.sampleRate = sampleRate;
      this.state = 'running';
    }

    createMediaStreamSource() {
      return { connect() {} };
    }

    createAnalyser() {
      liveAnalyser = new FakeAnalyser();
      return liveAnalyser;
    }

    async close() {}
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    navigator: {
      mediaDevices: {
        async getUserMedia() {
          return { getTracks: () => [{ stop() {} }] };
        },
      },
    },
    window: { AudioContext: FakeAudioContext },
    ChordDetect: {},
    FreshChordGate: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(`${micSource}\nthis.MicCapture = MicCapture;`, sandbox);
  await sandbox.MicCapture.start();
  const fftSize = liveAnalyser.fftSize;
  sandbox.MicCapture.stop();
  return fftSize;
}

for (const sampleRate of [44100, 48000, 88200, 96000]) {
  const fftSize = await defaultAnalyserResolution(sampleRate);
  assert.ok(
    sampleRate / fftSize <= 5.86,
    `default analyser bins must be no wider than 5.86 Hz; ` +
      `${sampleRate} Hz / FFT ${fftSize} = ${(sampleRate / fftSize).toFixed(2)} Hz`
  );
}

console.log('ok - mic capture: default FFT resolution scales with AudioContext sample rate');
