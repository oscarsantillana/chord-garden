/*
 * Rainbow Pitch — isolated physical real-piano acceptance harness.
 *
 * This file intentionally owns only the manual test protocol and its DOM.
 * Detection, onset gating, microphone capture, and result recording continue
 * to use the production globals loaded by index.html.
 */

(function initAcceptanceHarness(root) {
  'use strict';

  const CANDIDATE_NAMES = Object.freeze([
    'red', 'yellow', 'blue', 'black', 'green',
    'orange', 'purple', 'pink', 'brown',
    'gray', 'tan', 'lightgreen', 'lightpurple', 'skyblue',
  ]);

  const POSITIVE_CONDITIONS = Object.freeze([
    Object.freeze({
      id: 'normal',
      label: 'Normal attack',
      instruction: 'Play the shown three-note chord once at a comfortable volume. Release naturally.',
    }),
    Object.freeze({
      id: 'weak',
      label: 'Weak attack',
      instruction: 'Play the shown three-note chord once with a weak attack, keeping all three keys together.',
    }),
    Object.freeze({
      id: 'sustained',
      label: 'Sustained with pedal',
      instruction: 'Hold the sustain pedal, play the shown chord once, and let it ring.',
    }),
  ]);

  const NEGATIVE_SCENARIOS = Object.freeze([
    Object.freeze({
      id: 'silence',
      label: 'Silence',
      instruction: 'Do not play or speak. Let the listening window expire.',
    }),
    Object.freeze({
      id: 'single-key',
      label: 'Single piano key',
      instruction: 'Play one piano key once. Do not add any other key.',
    }),
    Object.freeze({
      id: 'dyad',
      label: 'Two piano keys',
      instruction: 'Play any two piano keys together. Do not complete a triad.',
    }),
    Object.freeze({
      id: 'speech',
      label: 'Speech',
      instruction: 'Say a short sentence at normal speaking volume. Do not touch the piano.',
    }),
    Object.freeze({
      id: 'room-transient',
      label: 'Room noise or transient',
      instruction: 'Make one ordinary non-musical room sound, such as a clap or chair movement.',
    }),
    Object.freeze({
      id: 'previous-chord-tail',
      label: 'Previous chord tail',
      instruction: 'Let the previously played piano chord keep ringing. Do not strike the keys again.',
    }),
    Object.freeze({
      id: 'red-reward-tail',
      label: 'Rainbow Pitch Red reward tail',
      instruction: 'Do not play the piano. The harness will reproduce the production Red reward-to-next-round sequence through this device.',
      notes: Object.freeze(['C4', 'E4', 'G4']),
    }),
    Object.freeze({
      id: 'gray-first-inversion',
      label: 'Unwritten Gray inversion',
      instruction: 'Play C#4, E4, and A4 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['C#4', 'E4', 'A4']),
    }),
    Object.freeze({
      id: 'gray-second-inversion',
      label: 'Unwritten Gray inversion',
      instruction: 'Play E4, A4, and C#5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['E4', 'A4', 'C#5']),
    }),
    Object.freeze({
      id: 'tan-first-inversion',
      label: 'Unwritten Tan inversion',
      instruction: 'Play F#4, A4, and D5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['F#4', 'A4', 'D5']),
    }),
    Object.freeze({
      id: 'tan-second-inversion',
      label: 'Unwritten Tan inversion',
      instruction: 'Play A4, D5, and F#5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['A4', 'D5', 'F#5']),
    }),
    Object.freeze({
      id: 'lightgreen-first-inversion',
      label: 'Unwritten Light Green inversion',
      instruction: 'Play G#4, B4, and E5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['G#4', 'B4', 'E5']),
    }),
    Object.freeze({
      id: 'lightgreen-second-inversion',
      label: 'Unwritten Light Green inversion',
      instruction: 'Play B4, E5, and G#5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['B4', 'E5', 'G#5']),
    }),
    Object.freeze({
      id: 'lightpurple-first-inversion',
      label: 'Unwritten Light Purple inversion',
      instruction: 'Play D4, F4, and Bb4 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['D4', 'F4', 'Bb4']),
    }),
    Object.freeze({
      id: 'lightpurple-second-inversion',
      label: 'Unwritten Light Purple inversion',
      instruction: 'Play F4, Bb4, and D5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['F4', 'Bb4', 'D5']),
    }),
    Object.freeze({
      id: 'skyblue-first-inversion',
      label: 'Unwritten Sky Blue inversion',
      instruction: 'Play G4, Bb4, and Eb5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['G4', 'Bb4', 'Eb5']),
    }),
    Object.freeze({
      id: 'skyblue-second-inversion',
      label: 'Unwritten Sky Blue inversion',
      instruction: 'Play Bb4, Eb5, and G5 together. This pitch-class match has the wrong written bass and must be rejected.',
      notes: Object.freeze(['Bb4', 'Eb5', 'G5']),
    }),
  ]);

  function positiveInteger(value, field, maximum) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > maximum) {
      throw new Error(`${field} must be an integer from 1 to ${maximum}`);
    }
    return number;
  }

  function abortReason(signal) {
    if (signal && signal.reason instanceof Error) return signal.reason;
    return new Error('Output-tail preparation was cancelled.');
  }

  function waitWithAbort(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(abortReason(signal));
        return;
      }
      let settled = false;
      const timer = root.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);
      function onAbort() {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        reject(abortReason(signal));
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function prepareProductionOutputTail(audio, notes, {
    wait = waitWithAbort,
    signal = null,
  } = {}) {
    if (!audio || typeof audio.playReward !== 'function' ||
        typeof audio.stopAll !== 'function' ||
        typeof audio.whenOutputSilent !== 'function') {
      throw new Error('The production playback engine is unavailable.');
    }

    // Production starts reward playback and its next-round timer together:
    // playReward() is deliberately fire-and-forget in app.js. Attach both
    // fulfillment and rejection handlers immediately so a cold sample load
    // cannot become an unhandled rejection while the 1100 ms timer runs.
    let reward;
    try {
      reward = audio.playReward(notes);
    } catch (error) {
      reward = Promise.reject(error);
    }
    const playbackOutcome = Promise.resolve(reward).then(
      () => {
        if (signal && signal.aborted) {
          // stopForSafety may have run while samples were loading. Stop once
          // more after that stale operation settles so it cannot ring later.
          try { audio.stopAll(); } catch (error) { /* reported by the active path */ }
        }
        return { error: null };
      },
      (error) => {
        if (signal && signal.aborted) {
          try { audio.stopAll(); } catch (stopError) { /* best effort */ }
        }
        return { error };
      }
    );

    await wait(1100, signal);
    if (signal && signal.aborted) {
      try { audio.stopAll(); } catch (error) { /* cancellation remains primary */ }
      throw abortReason(signal);
    }
    audio.stopAll();
    const silenceBarrier = audio.whenOutputSilent();
    return {
      armAfter: Promise.all([playbackOutcome, silenceBarrier]).then(([outcome]) => {
        if (signal && signal.aborted) throw abortReason(signal);
        if (outcome.error) throw outcome.error;
      }),
    };
  }

  function selectCandidateChords(chords) {
    if (!Array.isArray(chords)) throw new Error('chords must be an array');
    const byName = new Map(chords.map((chord) => [chord.name, chord]));
    return Object.freeze(CANDIDATE_NAMES.map((name) => {
      const chord = byName.get(name);
      if (!chord || !Array.isArray(chord.notes) || chord.notes.length !== 3) {
        throw new Error(`missing candidate chord: ${name}`);
      }
      return chord;
    }));
  }

  function buildQueue(chords, {
    positiveRepetitions = 3,
    negativeRepetitions = 1,
  } = {}) {
    const positiveCount = positiveInteger(positiveRepetitions, 'positiveRepetitions', 20);
    const negativeCount = positiveInteger(negativeRepetitions, 'negativeRepetitions', 10);
    const candidateChords = selectCandidateChords(chords);
    const queue = [];

    for (let pass = 0; pass < positiveCount; pass += 1) {
      const condition = POSITIVE_CONDITIONS[pass % POSITIVE_CONDITIONS.length];
      candidateChords.forEach((chord, chordIndex) => {
        queue.push(Object.freeze({
          id: `positive-${pass + 1}-${chordIndex + 1}`,
          kind: 'chord',
          condition: condition.id,
          conditionLabel: condition.label,
          instruction: condition.instruction,
          notes: Object.freeze([...chord.notes]),
          stimulus: Object.freeze({
            kind: 'chord',
            expected: chord.name,
            label: chord.label,
            technique: condition.id,
          }),
        }));
      });
    }

    for (let pass = 0; pass < negativeCount; pass += 1) {
      NEGATIVE_SCENARIOS.forEach((scenario, scenarioIndex) => {
        queue.push(Object.freeze({
          id: `negative-${pass + 1}-${scenarioIndex + 1}`,
          kind: 'negative',
          condition: scenario.id,
          conditionLabel: scenario.label,
          instruction: scenario.instruction,
          notes: scenario.notes || null,
          stimulus: Object.freeze({
            kind: 'negative',
            case: scenario.id,
            label: scenario.label,
          }),
        }));
      });
    }

    return Object.freeze(queue);
  }

  function createPhaseMachine(onChange) {
    const allowed = Object.freeze({
      SETUP: Object.freeze(['PREVIEW']),
      PREVIEW: Object.freeze(['ARMING']),
      ARMING: Object.freeze(['READY', 'RESULT']),
      READY: Object.freeze(['RESULT']),
      RESULT: Object.freeze(['PREVIEW']),
    });
    let phase = 'SETUP';

    function announce() {
      if (typeof onChange === 'function') onChange(phase);
    }

    return Object.freeze({
      current() {
        return phase;
      },
      move(next) {
        if (!allowed[phase].includes(next)) {
          throw new Error(`cannot move from ${phase} to ${next}`);
        }
        phase = next;
        announce();
        return phase;
      },
      reset() {
        phase = 'SETUP';
        announce();
        return phase;
      },
    });
  }

  function checkEnvironment({
    isSecureContext,
    protocol,
    serviceWorkerControlled,
    capabilities = {},
    micSupported,
  } = {}) {
    if (protocol !== 'http:' && protocol !== 'https:') {
      return {
        ok: false,
        reason: 'Open this harness from an HTTP server; file URLs cannot request the microphone.',
      };
    }
    if (!isSecureContext) {
      return {
        ok: false,
        reason: 'Microphone validation requires a secure context (HTTPS or loopback localhost).',
      };
    }
    if (serviceWorkerControlled) {
      return {
        ok: false,
        reason: 'A service worker controls this page. Unregister it or use a clean origin before testing.',
      };
    }
    const missing = Object.entries(capabilities)
      .filter(([, present]) => !present)
      .map(([name]) => name);
    if (missing.length) {
      return {
        ok: false,
        reason: `Required local modules did not load: ${missing.join(', ')}.`,
      };
    }
    if (!micSupported) {
      return {
        ok: false,
        reason: 'This browser does not expose the required microphone and Web Audio APIs.',
      };
    }
    return { ok: true, reason: '' };
  }

  function boot() {
    const documentRef = root.document;
    const byId = (id) => documentRef.getElementById(id);
    const setupPanel = byId('setup-panel');
    const previewPanel = byId('preview-panel');
    const activePanel = byId('active-panel');
    const resultPanel = byId('result-panel');
    const panels = [setupPanel, previewPanel, activePanel, resultPanel];
    const setupForm = byId('setup-form');
    const setupError = byId('setup-error');
    const startButton = byId('start-session');
    const stopButton = byId('stop-session');
    const liveStatus = byId('live-status');
    const stoppedCard = byId('stopped-session');
    const phaseSteps = [...documentRef.querySelectorAll('[data-phase-step]')];

    let phases;
    let recorder = null;
    let stoppedRecorder = null;
    let queue = Object.freeze([]);
    let candidates = Object.freeze([]);
    let queueIndex = 0;
    let currentTrial = null;
    let activeTrialId = null;
    let listenHandle = null;
    let micStarted = false;
    let generation = 0;
    let repeatCurrent = false;
    let outputTailAbort = null;
    const protocols = new WeakMap();

    function cancelOutputTail(reason) {
      if (!outputTailAbort) return;
      const controller = outputTailAbort;
      outputTailAbort = null;
      if (!controller.signal.aborted) {
        controller.abort(new Error(reason || 'Output-tail preparation was cancelled.'));
      }
    }

    function showPanel(panel) {
      panels.forEach((candidate) => {
        candidate.hidden = candidate !== panel;
      });
    }

    function focusHeading(id) {
      root.requestAnimationFrame(() => {
        const heading = byId(id);
        if (heading) heading.focus();
      });
    }

    function announce(message) {
      liveStatus.textContent = '';
      root.requestAnimationFrame(() => {
        liveStatus.textContent = message;
      });
    }

    function updatePhase(phase) {
      documentRef.body.dataset.phase = phase;
      phaseSteps.forEach((step) => {
        if (step.dataset.phaseStep === phase) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
    }

    phases = createPhaseMachine(updatePhase);

    function progressText() {
      return `Trial ${queueIndex + 1} of ${queue.length}`;
    }

    function updateProgress(prefix) {
      const countId = prefix === 'trial' ? 'trial-count' : `${prefix}-trial-count`;
      byId(countId).textContent = progressText();
      const progress = byId(prefix === 'trial' ? 'trial-progress' : `${prefix}-progress`);
      progress.value = queueIndex + 1;
      progress.max = queue.length;
      progress.textContent = `${queueIndex + 1} of ${queue.length}`;
    }

    function renderQueueSummary() {
      try {
        const positive = Number(byId('positive-repetitions').value) * CANDIDATE_NAMES.length;
        const negative = Number(byId('negative-repetitions').value) * NEGATIVE_SCENARIOS.length;
        byId('queue-summary').textContent =
          `Planned session: ${positive + negative} trials (${positive} written chords and ${negative} negative scenarios).`;
      } catch (error) {
        byId('queue-summary').textContent = 'Choose protocol passes to calculate the session size.';
      }
    }

    function renderPreview() {
      currentTrial = queue[queueIndex];
      updateProgress('trial');
      const positive = currentTrial.kind === 'chord';
      byId('scenario-kind').textContent = positive ? 'Written chord' : 'Must reject';
      byId('scenario-kind').dataset.tone = positive ? '' : 'abstain';
      byId('scenario-condition').textContent = currentTrial.conditionLabel;
      byId('scenario-name').textContent = currentTrial.stimulus.label;
      byId('scenario-notes').textContent = currentTrial.notes
        ? currentTrial.notes.join(' · ')
        : 'No prescribed piano notes';
      byId('scenario-instruction').textContent = currentTrial.instruction;
      byId('expected-behavior').textContent = positive
        ? `Expected: accept only ${currentTrial.stimulus.label}.`
        : 'Expected: abstain without accepting any chord.';
      showPanel(previewPanel);
      focusHeading('preview-heading');
      announce(`${progressText()}. Ground truth is locked. Review the scenario before arming.`);
    }

    function renderArming() {
      updateProgress('active');
      byId('active-step').textContent = 'Step 3 of 5';
      const reproducingOutput = currentTrial.condition === 'red-reward-tail';
      byId('active-heading').textContent = reproducingOutput
        ? 'Reproducing the production reward tail'
        : 'Arming microphone';
      byId('active-status').textContent = reproducingOutput
        ? 'Do not play. Capture will remain blocked through the same next-round delay and sample-release barrier used by the app.'
        : 'Keep the room quiet while a fresh baseline is measured.';
      byId('active-target').textContent = currentTrial.notes
        ? `${currentTrial.stimulus.label}: ${currentTrial.notes.join(' · ')}`
        : currentTrial.stimulus.label;
      byId('active-instruction').textContent =
        'Wait. The instruction will be announced when the detector is ready.';
      showPanel(activePanel);
      focusHeading('active-heading');
      announce(`${progressText()}. Arming. Keep quiet and do not perform the scenario yet.`);
    }

    function renderReady() {
      byId('active-step').textContent = 'Step 4 of 5';
      byId('active-heading').textContent = 'Ready — perform the scenario';
      byId('active-status').textContent = currentTrial.instruction;
      byId('active-instruction').textContent = currentTrial.instruction;
      focusHeading('active-heading');
      announce(`Ready. ${currentTrial.instruction}`);
    }

    function createMetric(label, value) {
      const wrapper = documentRef.createElement('div');
      const metricLabel = documentRef.createElement('div');
      const metricValue = documentRef.createElement('div');
      metricLabel.className = 'metric-label';
      metricValue.className = 'metric-value';
      metricLabel.textContent = label;
      metricValue.textContent = value;
      wrapper.append(metricLabel, metricValue);
      return wrapper;
    }

    function percentage(value) {
      return value == null ? '—' : `${Math.round(value * 100)}%`;
    }

    function renderMetrics(summary) {
      const metrics = byId('metrics-grid');
      metrics.replaceChildren(
        createMetric(
          'Written coverage',
          `${summary.positive.correctAccepted} / ${summary.positive.total} · ${percentage(summary.positive.correctCoverage)}`
        ),
        createMetric('Wrong accepts', String(summary.positive.wrongAccepted)),
        createMetric('False accepts', String(summary.negative.falseAccepted)),
        createMetric('Invalid attempts', String(summary.invalid.total)),
        createMetric(
          'Negative rejection',
          `${summary.negative.correctRejected} / ${summary.negative.total} · ${percentage(summary.negative.rejectionRate)}`
        )
      );
    }

    function resultPresentation(trial) {
      const presentations = {
        'correct-accept': {
          tone: 'safe',
          badge: 'Correct acceptance',
          heading: 'Detector accepted the written chord',
          copy: 'The accepted name matches the ground truth fixed before listening.',
        },
        'wrong-accept': {
          tone: 'unsafe',
          badge: 'Unsafe wrong acceptance',
          heading: 'Detector accepted the wrong chord',
          copy: 'Treat this as a safety failure. Preserve the JSON and note the physical setup.',
        },
        abstain: {
          tone: 'abstain',
          badge: 'Abstained',
          heading: 'Detector made no chord claim',
          copy: 'This is safe, but it lowers written-chord coverage.',
        },
        'correct-reject': {
          tone: 'safe',
          badge: 'Correct rejection',
          heading: 'Detector rejected the negative scenario',
          copy: 'No chord name was accepted during the listening window.',
        },
        'false-accept': {
          tone: 'unsafe',
          badge: 'Unsafe false acceptance',
          heading: 'Detector accepted a negative scenario',
          copy: 'Treat this as a safety failure. Preserve the JSON and note the physical setup.',
        },
        invalid: {
          tone: 'abstain',
          badge: 'Invalid attempt retained',
          heading: 'This attempt will be repeated',
          copy: 'The invalid record stays in the export but is excluded from safety and coverage metrics.',
        },
      };
      return presentations[trial.classification];
    }

    function renderResult(trial) {
      const presentation = resultPresentation(trial);
      const summary = recorder.summary();
      updateProgress('result');
      byId('result-classification').textContent = presentation.badge;
      byId('result-classification').dataset.tone = presentation.tone;
      byId('result-heading').textContent = presentation.heading;
      byId('result-copy').textContent = presentation.copy;
      byId('result-expected').textContent = currentTrial.kind === 'chord'
        ? `${currentTrial.stimulus.label} · ${currentTrial.notes.join(' · ')}`
        : `Reject ${currentTrial.stimulus.label}`;
      byId('result-detected').textContent = trial.outcome.status === 'accepted'
        ? trial.outcome.detected
        : trial.outcome.status === 'invalid'
          ? `Not scored (${trial.outcome.reason})`
          : `No chord accepted (${trial.outcome.reason})`;
      byId('result-confidence').textContent = trial.outcome.status === 'accepted'
        ? percentage(trial.outcome.confidence)
        : '—';
      byId('result-latency').textContent = trial.latencyMs == null
        ? trial.outcome.status === 'invalid' ? 'Not measured' : 'No onset recorded'
        : `${Math.round(trial.latencyMs)} ms`;
      renderMetrics(summary);

      repeatCurrent = trial.classification === 'invalid';
      byId('next-trial').textContent = repeatCurrent
        ? 'Repeat same trial'
        : 'Preview next trial';
      const isLast = !repeatCurrent && queueIndex >= queue.length - 1;
      byId('next-trial').hidden = isLast;
      if (isLast) {
        MicCapture.stop();
        micStarted = false;
      }
      showPanel(resultPanel);
      focusHeading('result-heading');
      announce(`${presentation.badge}. ${presentation.heading}.`);
    }

    function failSafely(error) {
      stopForSafety('harness-error');
      setupError.textContent = error && error.message
        ? error.message
        : 'The harness stopped after an unexpected error.';
      setupError.hidden = false;
    }

    function finishTrial(outcome, token) {
      if (token !== generation || !recorder || !activeTrialId) return;
      try {
        if (phases.current() !== 'ARMING' && phases.current() !== 'READY') return;
        const trial = recorder.completeTrial(activeTrialId, outcome);
        activeTrialId = null;
        listenHandle = null;
        outputTailAbort = null;
        phases.move('RESULT');
        renderResult(trial);
      } catch (error) {
        failSafely(error);
      }
    }

    async function armTrial() {
      if (!recorder || !currentTrial || phases.current() !== 'PREVIEW') return;
      try {
        activeTrialId = recorder.beginTrial(currentTrial.stimulus);
        phases.move('ARMING');
        renderArming();
        const token = ++generation;
        let armAfter;
        if (currentTrial.condition === 'red-reward-tail') {
          const controller = new AbortController();
          outputTailAbort = controller;
          try {
            const prepared = await prepareProductionOutputTail(
              PianoAudio,
              currentTrial.notes,
              { signal: controller.signal }
            );
            if (token !== generation || !activeTrialId) return;
            armAfter = prepared.armAfter.catch((error) => {
              if (token === generation && activeTrialId) {
                if (listenHandle) {
                  listenHandle.cancel();
                  listenHandle = null;
                }
                try { PianoAudio.stopAll(); } catch (stopError) { /* best effort */ }
                outputTailAbort = null;
                finishTrial({
                  status: 'invalid',
                  reason: 'playback-error',
                }, token);
              }
              // MicCapture treats a rejected armAfter as low confidence.
              // Keep its barrier pending after recording the invalid attempt
              // so playback failure can never masquerade as a correct reject.
              return new Promise(() => {});
            });
          } catch (error) {
            if (token !== generation || !activeTrialId) return;
            if (!controller.signal.aborted) {
              controller.abort(
                error instanceof Error ? error : new Error('Output-tail preparation failed.')
              );
            }
            try { PianoAudio.stopAll(); } catch (stopError) { /* best effort */ }
            outputTailAbort = null;
            finishTrial({
              status: 'invalid',
              reason: 'playback-error',
            }, token);
            return;
          }
        }
        if (token !== generation || !activeTrialId) return;
        listenHandle = MicCapture.listenForChord(
          candidates,
          (chord, confidence) => {
            finishTrial({
              status: 'accepted',
              detected: chord.name,
              confidence,
            }, token);
          },
          () => {
            finishTrial({ status: 'abstained', reason: 'timeout-or-low-confidence' }, token);
          },
          {
            armAfter,
            timeoutMs: 7000,
            confThreshold: 0.55,
            onReady() {
              if (token !== generation || phases.current() !== 'ARMING') return;
              try {
                outputTailAbort = null;
                recorder.markReady(activeTrialId);
                phases.move('READY');
                renderReady();
              } catch (error) {
                failSafely(error);
              }
            },
            onOnset() {
              if (token !== generation || !activeTrialId) return;
              try {
                recorder.markOnset(activeTrialId);
              } catch (error) {
                failSafely(error);
              }
            },
          }
        );
      } catch (error) {
        failSafely(error);
      }
    }

    function invalidateTrial() {
      if (!recorder || !activeTrialId ||
          (phases.current() !== 'ARMING' && phases.current() !== 'READY')) {
        return;
      }
      try {
        generation += 1;
        cancelOutputTail('Operator invalidated the trial.');
        if (listenHandle) {
          listenHandle.cancel();
          listenHandle = null;
        }
        if (typeof PianoAudio !== 'undefined') {
          try { PianoAudio.stopAll(); } catch (error) { /* best effort */ }
        }
        const trial = recorder.completeTrial(activeTrialId, {
          status: 'invalid',
          reason: 'operator-error',
        });
        activeTrialId = null;
        phases.move('RESULT');
        renderResult(trial);
      } catch (error) {
        failSafely(error);
      }
    }

    function nextTrial() {
      if (phases.current() !== 'RESULT') return;
      if (!repeatCurrent && queueIndex >= queue.length - 1) return;
      if (!repeatCurrent) queueIndex += 1;
      repeatCurrent = false;
      phases.move('PREVIEW');
      renderPreview();
    }

    function makeSessionId() {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') {
        return `rp-${root.crypto.randomUUID()}`;
      }
      return `rp-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }

    function exportRecorder(targetRecorder) {
      if (!targetRecorder) return;
      try {
        const data = targetRecorder.exportData();
        const protocol = protocols.get(targetRecorder);
        if (protocol) data.protocol = protocol;
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = documentRef.createElement('a');
        link.href = url;
        link.download = `rainbow-pitch-real-piano-${data.sessionId}.json`;
        link.rel = 'noopener';
        documentRef.body.append(link);
        link.click();
        link.remove();
        root.setTimeout(() => URL.revokeObjectURL(url), 0);
        announce('Session JSON exported. No audio or spectral frames were included.');
      } catch (error) {
        setupError.textContent = error.message;
        setupError.hidden = false;
      }
    }

    function stoppedSummary(targetRecorder, reason) {
      const summary = targetRecorder.summary();
      const total = summary.positive.total + summary.negative.total + summary.invalid.total;
      return `Stopped after ${total} completed trial${total === 1 ? '' : 's'} (${reason}). Export before starting another setup if you need this partial evidence.`;
    }

    function stopForSafety(reason) {
      generation += 1;
      cancelOutputTail('The acceptance session stopped.');
      if (listenHandle) {
        listenHandle.cancel();
        listenHandle = null;
      }
      if (micStarted || typeof MicCapture !== 'undefined') {
        MicCapture.stop();
        micStarted = false;
      }
      if (typeof PianoAudio !== 'undefined') {
        try { PianoAudio.stopAll(); } catch (error) { /* best effort */ }
      }
      if (!recorder) return;

      if (activeTrialId) {
        try {
          recorder.completeTrial(activeTrialId, {
            status: 'invalid',
            reason: 'cancelled',
          });
        } catch (error) {
          // The session still remains local; export will explain if an active
          // recorder transaction could not be closed.
        }
        activeTrialId = null;
      }

      stoppedRecorder = recorder;
      recorder = null;
      stoppedCard.hidden = false;
      byId('stopped-summary').textContent = stoppedSummary(stoppedRecorder, reason);
      stopButton.hidden = true;
      phases.reset();
      showPanel(setupPanel);
      focusHeading('setup-heading');
      announce('Microphone stopped. A partial session is available to export.');
    }

    async function startSession(event) {
      event.preventDefault();
      if (!setupForm.reportValidity()) return;
      setupError.hidden = true;
      startButton.disabled = true;
      const startToken = ++generation;
      const originalLabel = startButton.textContent;
      startButton.textContent = 'Preparing audio and microphone…';
      announce('Preparing the production piano and requesting microphone permission.');

      try {
        const form = new FormData(setupForm);
        candidates = selectCandidateChords(CHORDS);
        queue = buildQueue(CHORDS, {
          positiveRepetitions: Number(form.get('positiveRepetitions')),
          negativeRepetitions: Number(form.get('negativeRepetitions')),
        });
        recorder = RealPianoAcceptance.createSession({
          instrument: form.get('instrument'),
          device: form.get('device'),
          environment: form.get('environment'),
        }, {
          sessionId: makeSessionId(),
          coverageTarget: 0.9,
          confidenceThreshold: 0.55,
          candidateNames: CANDIDATE_NAMES,
        });
        protocols.set(recorder, Object.freeze({
          version: 1,
          candidateNames: Object.freeze([...CANDIDATE_NAMES]),
          plannedQueue: Object.freeze(queue.map((trial) => Object.freeze({
            id: trial.id,
            kind: trial.kind,
            condition: trial.condition,
            conditionLabel: trial.conditionLabel,
            instruction: trial.instruction,
            notes: trial.notes ? Object.freeze([...trial.notes]) : null,
            stimulus: Object.freeze({ ...trial.stimulus }),
          }))),
          exclusions: Object.freeze([]),
        }));
        // Match production: unlock and fully load the sampled piano from this
        // explicit user gesture before microphone acceptance begins. Keep
        // these sequential so an audio failure cannot strand a microphone
        // request that settles after the catch path has already cleaned up.
        await PianoAudio.unlock();
        if (startToken !== generation || !recorder) {
          PianoAudio.stopAll();
          return;
        }
        await MicCapture.start();
        if (startToken !== generation || !recorder) {
          MicCapture.stop();
          micStarted = false;
          return;
        }
        micStarted = true;
        queueIndex = 0;
        currentTrial = queue[0];
        stoppedCard.hidden = true;
        stopButton.hidden = false;
        phases.move('PREVIEW');
        renderPreview();
      } catch (error) {
        if (startToken !== generation) {
          if (typeof MicCapture !== 'undefined') MicCapture.stop();
          if (typeof PianoAudio !== 'undefined') {
            try { PianoAudio.stopAll(); } catch (stopError) { /* best effort */ }
          }
          return;
        }
        if (typeof MicCapture !== 'undefined') MicCapture.stop();
        micStarted = false;
        recorder = null;
        phases.reset();
        setupError.textContent = error && error.message
          ? error.message
          : 'Microphone access failed. Check permission and try again.';
        setupError.hidden = false;
        announce('Session did not start. Review the error and try again.');
      } finally {
        startButton.disabled = false;
        startButton.textContent = originalLabel;
      }
    }

    const capabilities = {
      chords: typeof CHORDS !== 'undefined',
      chordDetect: typeof ChordDetect !== 'undefined',
      freshChordGate: typeof FreshChordGate !== 'undefined',
      micCapture: typeof MicCapture !== 'undefined',
      recorder: typeof RealPianoAcceptance !== 'undefined',
      pianoAudio: typeof PianoAudio !== 'undefined',
      tone: typeof Tone !== 'undefined',
    };
    const environment = checkEnvironment({
      isSecureContext: root.isSecureContext,
      protocol: root.location.protocol,
      hostname: root.location.hostname,
      serviceWorkerControlled: Boolean(
        root.navigator.serviceWorker && root.navigator.serviceWorker.controller
      ),
      capabilities,
      micSupported: capabilities.micCapture && MicCapture.isSupported(),
    });

    if (!environment.ok) {
      byId('guard-message').textContent = environment.reason;
      byId('guard-error').hidden = false;
      setupPanel.hidden = true;
      documentRef.querySelector('.phase-list').hidden = true;
      return;
    }

    setupForm.addEventListener('submit', startSession);
    byId('positive-repetitions').addEventListener('change', renderQueueSummary);
    byId('negative-repetitions').addEventListener('change', renderQueueSummary);
    byId('arm-trial').addEventListener('click', armTrial);
    byId('invalidate-trial').addEventListener('click', invalidateTrial);
    byId('next-trial').addEventListener('click', nextTrial);
    byId('export-session').addEventListener('click', () => exportRecorder(recorder));
    byId('export-stopped').addEventListener('click', () => exportRecorder(stoppedRecorder));
    stopButton.addEventListener('click', () => stopForSafety('operator-stopped'));
    root.addEventListener('pagehide', () => stopForSafety('page-hidden'));
    documentRef.addEventListener('visibilitychange', () => {
      if (documentRef.hidden) stopForSafety('page-hidden');
    });
    renderQueueSummary();
  }

  const api = Object.freeze({
    CANDIDATE_NAMES,
    POSITIVE_CONDITIONS,
    NEGATIVE_SCENARIOS,
    selectCandidateChords,
    buildQueue,
    createPhaseMachine,
    checkEnvironment,
    prepareProductionOutputTail,
    boot,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AcceptanceHarness = api;
  if (root && root.document) {
    root.document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
