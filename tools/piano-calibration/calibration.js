/* Local, opt-in diagnostics. No microphone content leaves this page. */
(() => {
  const $ = id => document.getElementById(id);
  const scenarios = [
    ...CHORDS.map(chord => ({ name: chord.name, label: chord.label, notes: chord.notes, expected: chord.name })),
    { name: 'dyad', label: 'Two-key check (should be rejected)', notes: ['C4', 'E4'], expected: null },
  ];
  for (const scenario of scenarios) {
    const option = document.createElement('option');
    option.value = scenario.name;
    option.textContent = `${scenario.label} · ${scenario.notes.join(' – ')}`;
    $('target').appendChild(option);
  }
  const selected = () => scenarios.find(scenario => scenario.name === $('target').value);
  const updateNotes = () => { $('notes').textContent = selected().notes.join(' + '); };
  $('target').addEventListener('change', updateNotes);
  updateNotes();
  let generation = 0, running = false, attempt = null;

  function controls(active) {
    running = active;
    $('start').disabled = active;
    $('target').disabled = active;
    $('stop').disabled = !active;
  }
  function reason(result) {
    if (result.silence) return 'below detector sound threshold';
    if (result.incomplete) return 'missing three-note evidence';
    if (result.ambiguousBass) return 'ambiguous lower harmonics';
    if (result.confidence < .55) return 'uncertain chord or inversion';
    return 'confident frame';
  }
  function noteName(midi) {
    return ChordDetect.PITCH_CLASSES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }
  function finish(outcome) {
    if (!running) return;
    MicCapture.stop();
    controls(false);
    attempt.outcome = outcome;
    $('status').textContent = 'Listen finished';
    $('level').value = 0;
    $('input').textContent = 'Microphone off';
    $('outcome').textContent = outcome.detected
      ? `Recognised ${CHORD_BY_NAME[outcome.detected].label}${outcome.detected === attempt.target.expected ? ' — correct.' : ' — different from the intended keys.'}`
      : outcome.reason === 'cancelled' ? 'Stopped.' : 'No chord accepted.';
    const counts = {};
    for (const frame of attempt.frames) { const key = reason(frame.result); counts[key] = (counts[key] || 0) + 1; }
    const strongest = attempt.frames.reduce((best, frame) => !best || frame.energy > best.energy ? frame : best, null);
    const lines = [
      `Intended keys: ${attempt.target.notes.join(' + ')}`,
      `Ready reached: ${attempt.readyAt == null ? 'no' : 'yes'}`,
      `Fresh attacks detected: ${attempt.onsets.length}`,
      `Frames checked: ${attempt.frames.length}`,
      ...Object.entries(counts).map(([key, count]) => `${key}: ${count}`),
    ];
    if (strongest) {
      const result = strongest.result;
      const peaks = ChordDetect.spectralPeaks(strongest.magnitudes, attempt);
      const max = Math.max(0, ...peaks.filter(peak => peak.frequency <= 2200).map(peak => peak.magnitude));
      lines.push('', 'Loudest frame:',
        `Top candidate: ${result.best?.name || 'none'}`,
        `Confidence: ${result.confidence.toFixed(3)}`,
        `Evidence: ${(result.noteEvidence?.notes || []).map(note => noteName(note.midi)).join(', ') || 'none'}`,
        `Low peaks: ${peaks.filter(peak => peak.frequency <= 2200 && peak.magnitude >= max * .04).slice(0, 10).map(peak => `${noteName(peak.midi)} (${peak.frequency.toFixed(1)} Hz)`).join(', ')}`);
    }
    $('summary').textContent = lines.join('\n');
    $('result').hidden = false;
  }
  $('start').addEventListener('click', async () => {
    const token = ++generation;
    attempt = { schemaVersion: 1, candidateNames: CHORDS.map(chord => chord.name), target: selected(),
      sampleRate: null, fftSize: null, frames: [], readyAt: null, onsets: [], outcome: null };
    controls(true);
    $('result').hidden = true;
    $('status').textContent = 'Opening microphone…';
    try {
      await MicCapture.start();
      if (token !== generation) return;
      $('status').textContent = 'Release the keys — getting ready…';
      let firstAt = null;
      MicCapture.listenForChord(CHORDS,
        (chord, confidence) => { if (token === generation) finish({ detected: chord.name, confidence }); },
        diagnostic => { if (token === generation) finish({ detected: null, reason: diagnostic?.reason || 'unrecognised' }); },
        { timeoutMs: 15000,
          onInput(input) {
            if (token !== generation) return;
            $('level').value = input.level;
            $('input').textContent = { quiet: 'Input quiet', sound: 'Sound detected', unavailable: 'Input unavailable' }[input.state];
          },
          onReady() {
            if (token !== generation) return;
            attempt.readyAt = attempt.frames.at(-1)?.at ?? 0;
            $('status').textContent = 'Play now — hold the keys for two seconds';
          },
          onOnset(at) { if (token === generation) attempt.onsets.push(at - firstAt); },
          onFrame(frame) {
            if (token !== generation) return;
            if (firstAt == null) firstAt = frame.at;
            attempt.sampleRate = frame.sampleRate;
            attempt.fftSize = frame.fftSize;
            attempt.frames.push({ at: frame.at - firstAt, energy: frame.energy, positiveFlux: frame.positiveFlux,
              state: frame.state, result: frame.result, magnitudes: frame.magnitudes });
          },
        });
    } catch (error) {
      if (token !== generation) return;
      MicCapture.stop(); controls(false);
      $('status').textContent = 'Could not open microphone';
      $('input').textContent = error.message;
    }
  });
  function stop() { generation++; if (running) finish({ detected: null, reason: 'cancelled' }); else MicCapture.stop(); }
  $('stop').addEventListener('click', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  $('save').addEventListener('click', () => {
    if (!attempt?.outcome) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(attempt)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `rainbow-piano-${attempt.target.name}-${Date.now()}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
