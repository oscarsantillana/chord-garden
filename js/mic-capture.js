/* Local microphone capture and spectral polling. */

const MicCapture = (() => {
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let dataArray = null; // Float32Array of dB values, filled by getFloatFrequencyData
  let pollHandle = null; // the current listenForChord() round's pending setTimeout, if any
  let activeListen = null;
  let captureGeneration = 0;
  const MAX_BIN_WIDTH_HZ = 5.86;

  function defaultFftSize(sampleRate) {
    let size = 32;
    while (sampleRate / size > MAX_BIN_WIDTH_HZ && size < 32768) size *= 2;
    return size;
  }

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      (window.AudioContext || window.webkitAudioContext));
  }

  function cancelledStart() {
    const error = new Error('Microphone startup was cancelled.');
    error.name = 'AbortError';
    return error;
  }

  async function start({ fftSize } = {}) {
    stop();
    const generation = captureGeneration;
    if (!isSupported()) {
      const error = new Error('This browser cannot access the microphone here.');
      error.code = 'UNAVAILABLE';
      throw error;
    }
    const acquiredStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    if (generation !== captureGeneration) {
      acquiredStream.getTracks().forEach(track => track.stop());
      throw cancelledStart();
    }
    stream = acquiredStream;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const context = new Ctx();
      audioCtx = context;
      if (context.state === 'suspended') await context.resume();
      if (generation !== captureGeneration) throw cancelledStart();
      const source = context.createMediaStreamSource(acquiredStream);
      analyser = context.createAnalyser();
      analyser.fftSize = fftSize || defaultFftSize(context.sampleRate);
      analyser.smoothingTimeConstant = 0.2;
      dataArray = new Float32Array(analyser.frequencyBinCount);
      source.connect(analyser);
      return { stop() { if (generation === captureGeneration) stop(); } };
    } catch (error) {
      if (generation === captureGeneration) stop();
      throw error;
    }
  }

  // Releases the microphone (MediaStream tracks) and tears down the audio
  // graph. Safe to call multiple times / when nothing was ever started.
  function stop() {
    captureGeneration += 1;
    if (activeListen) activeListen.cancel();
    if (pollHandle != null) { clearTimeout(pollHandle); pollHandle = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    analyser = null;
    dataArray = null;
  }

  // Debounced, stabilised chord listening for ONE round. Polls the live
  // spectrum every `pollMs`, folds it into a chroma vector and matches it
  // against `chords` via ChordDetect.identifyWithBass (see that module for why
  // confidence is margin-primary, not absolute-score-primary). A single
  // lucky/unlucky frame is never enough either way — this requires
  // `stableFrames` CONSECUTIVE confident reads that all agree on the same
  // chord before calling onHeard, since a real piano attack, pedal noise, or
  // a stray hand on the keys can easily produce one noisy frame.
  //
  // If nothing stabilises within `timeoutMs`, calls onLowConfidence() —
  // js/app.js's "never a failure" safety valve (see decision #1 in the
  // feature notes): this deliberately covers BOTH "confidence genuinely
  // stayed low" and "nothing ever got played/heard", since from the child's
  // practice session both should read as one gentle retry, not two
  // different kinds of failure.
  function listenForChord(chords, onHeard, onLowConfidence, opts = {}) {
    const pollMs = opts.pollMs || 120;
    const stableFrames = opts.stableFrames || 3;
    const confThreshold = opts.confThreshold != null ? opts.confThreshold : 0.55;
    const timeoutMs = opts.timeoutMs || 7000;

    if (activeListen) activeListen.cancel();

    let cancelled = false;
    let gate = null;
    let startedAt = null;
    let previousLinear = null;

    const handle = {
      cancel() {
        if (cancelled) return;
        cancelled = true;
        if (gate) gate.cancel();
        if (pollHandle != null) {
          clearTimeout(pollHandle);
          pollHandle = null;
        }
        if (activeListen === handle) activeListen = null;
      },
    };
    activeListen = handle;

    function finishActive() {
      if (pollHandle != null) {
        clearTimeout(pollHandle);
        pollHandle = null;
      }
      if (activeListen === handle) activeListen = null;
    }

    function lowConfidence() {
      if (cancelled) return;
      finishActive();
      onLowConfidence();
    }

    function heard(result) {
      if (cancelled) return;
      finishActive();
      const chord = chords.find((candidate) => candidate.name === result.best.name);
      if (chord) onHeard(chord, result.confidence);
      else onLowConfidence();
    }

    function poll() {
      if (cancelled || !analyser || !dataArray || !audioCtx) return;

      analyser.getFloatFrequencyData(dataArray);
      const linear = new Array(dataArray.length);
      for (let i = 0; i < dataArray.length; i++) linear[i] = ChordDetect.dbToLinear(dataArray[i]);

      const result = ChordDetect.identifyWithBass(linear, {
        sampleRate: audioCtx.sampleRate,
        fftSize: analyser.fftSize,
        chords,
      });

      let positiveFlux = 0;
      if (previousLinear) {
        let risingPower = 0;
        let currentPower = 0;
        for (let i = 0; i < linear.length; i++) {
          const current = linear[i] * linear[i];
          const previous = previousLinear[i] * previousLinear[i];
          if (current > previous) risingPower += current - previous;
          currentPower += current;
        }
        positiveFlux = currentPower > 0 ? risingPower / currentPower : 0;
      }
      previousLinear = linear;

      gate.pushFrame({
        at: Date.now(),
        energy: result.energy,
        positiveFlux,
        result,
      });
      if (gate.getState() === 'DONE') return;

      if (Date.now() - startedAt >= timeoutMs) {
        gate.timeout();
        return;
      }

      pollHandle = setTimeout(poll, pollMs);
    }

    function beginPolling() {
      if (cancelled) return;
      if (!analyser || !dataArray || !audioCtx) {
        lowConfidence();
        return;
      }
      startedAt = Date.now();
      gate = FreshChordGate.create({
        onHeard: heard,
        onLowConfidence: lowConfidence,
        onReady: opts.onReady,
        onOnset: opts.onOnset,
        stableFrames,
        confThreshold,
        baselineFrames: opts.baselineFrames,
        fluxThreshold: opts.fluxThreshold,
        energyRiseRatio: opts.energyRiseRatio,
        captureMs: opts.captureMs,
      });
      poll();
    }

    Promise.resolve(opts.armAfter).then(beginPolling, lowConfidence);
    return handle;
  }

  return { isSupported, start, stop, listenForChord };
})();
