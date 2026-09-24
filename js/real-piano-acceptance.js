/*
 * Chord Garden — ground-truth acceptance-session recorder.
 *
 * Pure state and metrics only: no DOM, microphone, storage, or downloads.
 * The manual browser harness fixes the intended stimulus before listening,
 * then records the detector outcome through this small public interface.
 */

const RealPianoAcceptance = (() => {
  const SCHEMA = 'rainbow-pitch.real-piano-acceptance';
  const SCHEMA_VERSION = 1;

  function requiredText(value, field) {
    const text = String(value == null ? '' : value).trim();
    if (!text) throw new Error(`${field} is required`);
    return text;
  }

  function assertOnlyKeys(value, allowedKeys, label) {
    for (const key of Object.keys(value || {})) {
      if (!allowedKeys.includes(key)) {
        throw new Error(`unknown ${label} field: ${key}`);
      }
    }
  }

  function normalizeMetadata(metadata) {
    assertOnlyKeys(metadata, ['instrument', 'device', 'environment'], 'metadata');
    return {
      instrument: requiredText(metadata && metadata.instrument, 'instrument'),
      device: requiredText(metadata && metadata.device, 'device'),
      environment: requiredText(metadata && metadata.environment, 'environment'),
    };
  }

  function normalizeStimulus(stimulus) {
    if (stimulus && stimulus.kind === 'negative') {
      assertOnlyKeys(stimulus, ['kind', 'case', 'label'], 'stimulus');
      return {
        kind: 'negative',
        case: requiredText(stimulus.case, 'stimulus.case'),
        label: requiredText(stimulus.label || stimulus.case, 'stimulus.label'),
      };
    }
    if (!stimulus || stimulus.kind !== 'chord') {
      throw new Error('stimulus.kind must be "chord" or "negative"');
    }
    assertOnlyKeys(stimulus, ['kind', 'expected', 'label', 'technique'], 'stimulus');
    return {
      kind: 'chord',
      expected: requiredText(stimulus.expected, 'stimulus.expected'),
      label: requiredText(stimulus.label || stimulus.expected, 'stimulus.label'),
      technique: requiredText(stimulus.technique || 'unspecified', 'stimulus.technique'),
    };
  }

  function normalizeOutcome(outcome) {
    if (outcome && outcome.status === 'invalid') {
      assertOnlyKeys(outcome, ['status', 'reason'], 'outcome');
      const reason = requiredText(outcome.reason, 'outcome.reason');
      const allowedReasons = [
        'operator-error',
        'external-noise',
        'wrong-technique',
        'microphone-error',
        'playback-error',
        'cancelled',
      ];
      if (!allowedReasons.includes(reason)) {
        throw new Error(`unsupported invalid reason: ${reason}`);
      }
      return { status: 'invalid', reason };
    }
    if (outcome && outcome.status === 'abstained') {
      assertOnlyKeys(outcome, ['status', 'reason'], 'outcome');
      return {
        status: 'abstained',
        reason: requiredText(outcome.reason || 'timeout', 'outcome.reason'),
      };
    }
    if (!outcome || outcome.status !== 'accepted') {
      throw new Error('outcome.status must be "accepted" or "abstained"');
    }
    assertOnlyKeys(outcome, ['status', 'detected', 'confidence'], 'outcome');
    const confidence = Number(outcome.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('outcome.confidence must be between 0 and 1');
    }
    return {
      status: 'accepted',
      detected: requiredText(outcome.detected, 'outcome.detected'),
      confidence,
    };
  }

  function metricSummary(trials, coverageTarget, confidenceThreshold) {
    const invalidTrials = trials.filter((trial) => trial.classification === 'invalid');
    const validTrials = trials.filter((trial) => trial.classification !== 'invalid');
    const positiveTrials = validTrials.filter((trial) => trial.stimulus.kind === 'chord');
    const negativeTrials = validTrials.filter((trial) => trial.stimulus.kind === 'negative');
    const accepted = positiveTrials.filter((trial) => trial.outcome.status === 'accepted').length;
    const correctAccepted = positiveTrials.filter(
      (trial) => trial.classification === 'correct-accept'
    ).length;
    const wrongAccepted = positiveTrials.filter(
      (trial) => trial.classification === 'wrong-accept'
    ).length;
    const abstained = positiveTrials.filter(
      (trial) => trial.classification === 'abstain'
    ).length;
    const correctRejected = negativeTrials.filter(
      (trial) => trial.classification === 'correct-reject'
    ).length;
    const falseAccepted = negativeTrials.filter(
      (trial) => trial.classification === 'false-accept'
    ).length;
    const correctCoverage = positiveTrials.length
      ? correctAccepted / positiveTrials.length
      : null;
    const unsafeAccepts = wrongAccepted + falseAccepted;

    return {
      positive: {
        total: positiveTrials.length,
        accepted,
        correctAccepted,
        wrongAccepted,
        abstained,
        acceptedAccuracy: accepted ? correctAccepted / accepted : null,
        correctCoverage,
      },
      negative: {
        total: negativeTrials.length,
        correctRejected,
        falseAccepted,
        rejectionRate: negativeTrials.length
          ? correctRejected / negativeTrials.length
          : null,
      },
      invalid: {
        total: invalidTrials.length,
        byReason: invalidTrials.reduce((counts, trial) => {
          counts[trial.outcome.reason] = (counts[trial.outcome.reason] || 0) + 1;
          return counts;
        }, {}),
      },
      gates: {
        coverageTarget,
        confidenceThreshold,
        unsafeAccepts,
        zeroWrongAccepted: unsafeAccepts === 0,
        positiveCoveragePass: correctCoverage == null
          ? null
          : correctCoverage >= coverageTarget,
      },
    };
  }

  function summarizeSessions(sessionExports, { coverageTarget = 0.9 } = {}) {
    if (!Array.isArray(sessionExports)) {
      throw new Error('sessionExports must be an array');
    }
    if (!Number.isFinite(coverageTarget) || coverageTarget < 0 || coverageTarget > 1) {
      throw new Error('coverageTarget must be between 0 and 1');
    }

    const rows = [];
    const instruments = new Set();
    const devices = new Set();
    const environments = new Set();
    const candidateNames = new Set();
    const confidenceThresholds = new Set();

    for (const session of sessionExports) {
      if (!session || session.schema !== SCHEMA || session.schemaVersion !== SCHEMA_VERSION) {
        throw new Error('unsupported acceptance-session export');
      }
      if (!session.metadata || !Array.isArray(session.trials)) {
        throw new Error('invalid acceptance-session export');
      }
      const metadata = normalizeMetadata(session.metadata);
      instruments.add(metadata.instrument);
      devices.add(metadata.device);
      environments.add(metadata.environment);
      for (const name of (session.settings && session.settings.candidateNames) || []) {
        candidateNames.add(requiredText(name, 'candidateNames entry'));
      }
      if (Number.isFinite(session.settings && session.settings.confidenceThreshold)) {
        confidenceThresholds.add(session.settings.confidenceThreshold);
      }
      for (const trial of session.trials) rows.push({ trial, metadata });
    }

    const confidenceThreshold = confidenceThresholds.size === 1
      ? [...confidenceThresholds][0]
      : null;
    const summarizeRows = (groupedRows) => metricSummary(
      groupedRows.map((row) => row.trial),
      coverageTarget,
      confidenceThreshold
    );
    const group = (eligibleRows, keyForRow) => {
      const buckets = {};
      for (const row of eligibleRows) {
        const key = keyForRow(row);
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(row);
      }
      const result = {};
      for (const key of Object.keys(buckets).sort()) result[key] = summarizeRows(buckets[key]);
      return result;
    };

    const byInstrument = group(rows, (row) => row.metadata.instrument);
    const byDevice = group(rows, (row) => row.metadata.device);
    const byEnvironment = group(rows, (row) => row.metadata.environment);
    const chordRows = rows.filter((row) => row.trial.stimulus.kind === 'chord');
    const negativeRows = rows.filter((row) => row.trial.stimulus.kind === 'negative');
    const byChord = group(chordRows, (row) => row.trial.stimulus.expected);
    const byTechnique = group(
      chordRows,
      (row) => row.trial.stimulus.technique || 'unspecified'
    );
    const byNegativeCase = group(negativeRows, (row) => row.trial.stimulus.case);
    const weakKeys = (buckets) => Object.keys(buckets).filter((key) => {
      const positive = buckets[key].positive;
      return positive.total > 0 && positive.correctCoverage < coverageTarget;
    });

    return {
      overall: summarizeRows(rows),
      byInstrument,
      byDevice,
      byEnvironment,
      byChord,
      byTechnique,
      byNegativeCase,
      weakBuckets: {
        instrument: weakKeys(byInstrument),
        device: weakKeys(byDevice),
        environment: weakKeys(byEnvironment),
      },
      coverage: {
        sessions: sessionExports.length,
        instruments: [...instruments].sort(),
        devices: [...devices].sort(),
        environments: [...environments].sort(),
        candidateNames: [...candidateNames].sort(),
      },
    };
  }

  function createSession(metadata, options = {}) {
    assertOnlyKeys(
      options,
      ['clock', 'sessionId', 'coverageTarget', 'confidenceThreshold', 'candidateNames'],
      'option'
    );
    const {
      clock = () => Date.now(),
      sessionId = `rp-${Math.random().toString(36).slice(2, 10)}`,
      coverageTarget = 0.9,
      confidenceThreshold = 0.55,
      candidateNames = [],
    } = options;
    const safeMetadata = normalizeMetadata(metadata);
    const safeSessionId = requiredText(sessionId, 'sessionId');
    if (!Number.isFinite(coverageTarget) || coverageTarget < 0 || coverageTarget > 1) {
      throw new Error('coverageTarget must be between 0 and 1');
    }
    if (!Number.isFinite(confidenceThreshold) ||
        confidenceThreshold < 0 || confidenceThreshold > 1) {
      throw new Error('confidenceThreshold must be between 0 and 1');
    }
    if (!Array.isArray(candidateNames)) {
      throw new Error('candidateNames must be an array');
    }
    const safeCandidateNames = candidateNames.map((name) =>
      requiredText(name, 'candidateNames entry')
    );
    if (new Set(safeCandidateNames).size !== safeCandidateNames.length) {
      throw new Error('candidateNames must be unique');
    }
    const trials = [];
    let activeTrial = null;

    function beginTrial(stimulus) {
      if (activeTrial) throw new Error('complete the active trial before beginning another');
      activeTrial = {
        id: `${safeSessionId}-t${trials.length + 1}`,
        stimulus: normalizeStimulus(stimulus),
        startedAt: clock(),
        readyAt: null,
        onsetAt: null,
        onsetCount: 0,
      };
      return activeTrial.id;
    }

    function markReady(trialId) {
      if (!activeTrial || trialId !== activeTrial.id) {
        throw new Error('trialId does not match the active trial');
      }
      if (activeTrial.readyAt != null) throw new Error('ready is already recorded');
      const readyAt = clock();
      if (readyAt < activeTrial.startedAt) throw new Error('ready cannot precede trial start');
      activeTrial.readyAt = readyAt;
    }

    function markOnset(trialId) {
      if (!activeTrial || trialId !== activeTrial.id) {
        throw new Error('trialId does not match the active trial');
      }
      const onsetAt = clock();
      if (onsetAt < activeTrial.startedAt) throw new Error('onset cannot precede trial start');
      activeTrial.onsetAt = onsetAt;
      activeTrial.onsetCount += 1;
    }

    function completeTrial(trialId, outcome) {
      if (!activeTrial || trialId !== activeTrial.id) {
        throw new Error('trialId does not match the active trial');
      }
      const completedAt = clock();
      const safeOutcome = normalizeOutcome(outcome);
      if (safeOutcome.status === 'accepted' &&
          safeOutcome.confidence < confidenceThreshold) {
        throw new Error('accepted outcome confidence is below the session threshold');
      }
      if (safeOutcome.status === 'accepted' && activeTrial.onsetAt == null) {
        throw new Error('an accepted outcome requires a recorded onset');
      }
      let classification;
      if (safeOutcome.status === 'invalid') {
        classification = 'invalid';
      } else if (activeTrial.stimulus.kind === 'negative') {
        classification = safeOutcome.status === 'abstained'
          ? 'correct-reject'
          : 'false-accept';
      } else {
        classification = safeOutcome.status === 'abstained'
          ? 'abstain'
          : safeOutcome.detected === activeTrial.stimulus.expected
            ? 'correct-accept'
            : 'wrong-accept';
      }
      const trial = {
        id: activeTrial.id,
        stimulus: { ...activeTrial.stimulus },
        outcome: safeOutcome,
        classification,
        observationMs: Math.max(0, completedAt - activeTrial.startedAt),
        readyMs: activeTrial.readyAt == null
          ? null
          : Math.max(0, activeTrial.readyAt - activeTrial.startedAt),
        onsetMs: activeTrial.onsetAt == null
          ? null
          : Math.max(0, activeTrial.onsetAt - activeTrial.startedAt),
        onsetCount: activeTrial.onsetCount,
        latencyMs: safeOutcome.status === 'invalid' || activeTrial.onsetAt == null
          ? null
          : Math.max(0, completedAt - activeTrial.onsetAt),
      };
      trials.push(trial);
      activeTrial = null;
      return {
        ...trial,
        stimulus: { ...trial.stimulus },
        outcome: { ...trial.outcome },
      };
    }

    function summary() {
      const validTrials = trials.filter((trial) => trial.classification !== 'invalid');
      const invalidTrials = trials.filter((trial) => trial.classification === 'invalid');
      const positiveTrials = validTrials.filter((trial) => trial.stimulus.kind === 'chord');
      const negativeTrials = validTrials.filter((trial) => trial.stimulus.kind === 'negative');
      const accepted = positiveTrials.filter((trial) => trial.outcome.status === 'accepted').length;
      const correctAccepted = positiveTrials.filter((trial) => trial.classification === 'correct-accept').length;
      const wrongAccepted = positiveTrials.filter((trial) => trial.classification === 'wrong-accept').length;
      const abstained = positiveTrials.filter((trial) => trial.classification === 'abstain').length;
      const correctRejected = negativeTrials.filter((trial) => trial.classification === 'correct-reject').length;
      const falseAccepted = negativeTrials.filter((trial) => trial.classification === 'false-accept').length;
      const correctCoverage = positiveTrials.length ? correctAccepted / positiveTrials.length : null;
      const unsafeAccepts = wrongAccepted + falseAccepted;
      const stimulusGroups = new Map();
      for (const trial of validTrials) {
        const key = trial.stimulus.kind === 'chord'
          ? `chord:${trial.stimulus.expected}`
          : `negative:${trial.stimulus.case}`;
        if (!stimulusGroups.has(key)) stimulusGroups.set(key, []);
        stimulusGroups.get(key).push(trial);
      }
      const byStimulus = [...stimulusGroups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, groupedTrials]) => {
          const kind = groupedTrials[0].stimulus.kind;
          if (kind === 'negative') {
            const groupedCorrectRejected = groupedTrials.filter(
              (trial) => trial.classification === 'correct-reject'
            ).length;
            const groupedFalseAccepted = groupedTrials.length - groupedCorrectRejected;
            return {
              key,
              kind,
              total: groupedTrials.length,
              correctRejected: groupedCorrectRejected,
              falseAccepted: groupedFalseAccepted,
              rejectionRate: groupedCorrectRejected / groupedTrials.length,
            };
          }
          const groupedCorrect = groupedTrials.filter(
            (trial) => trial.classification === 'correct-accept'
          ).length;
          const groupedWrong = groupedTrials.filter(
            (trial) => trial.classification === 'wrong-accept'
          ).length;
          const groupedAccepted = groupedCorrect + groupedWrong;
          return {
            key,
            kind,
            total: groupedTrials.length,
            accepted: groupedAccepted,
            correctAccepted: groupedCorrect,
            wrongAccepted: groupedWrong,
            abstained: groupedTrials.length - groupedAccepted,
            acceptedAccuracy: groupedAccepted ? groupedCorrect / groupedAccepted : null,
            correctCoverage: groupedCorrect / groupedTrials.length,
          };
        });
      return {
        positive: {
          total: positiveTrials.length,
          accepted,
          correctAccepted,
          wrongAccepted,
          abstained,
          acceptedAccuracy: accepted ? correctAccepted / accepted : null,
          correctCoverage,
        },
        negative: {
          total: negativeTrials.length,
          correctRejected,
          falseAccepted,
          rejectionRate: negativeTrials.length ? correctRejected / negativeTrials.length : null,
        },
        invalid: {
          total: invalidTrials.length,
          byReason: invalidTrials.reduce((counts, trial) => {
            counts[trial.outcome.reason] = (counts[trial.outcome.reason] || 0) + 1;
            return counts;
          }, {}),
        },
        gates: {
          coverageTarget,
          confidenceThreshold,
          unsafeAccepts,
          zeroWrongAccepted: unsafeAccepts === 0,
          positiveCoveragePass: correctCoverage == null
            ? null
            : correctCoverage >= coverageTarget,
        },
        byStimulus,
      };
    }

    return {
      beginTrial,
      markReady,
      markOnset,
      completeTrial,
      summary,
      exportData() {
        if (activeTrial) throw new Error('complete the active trial before exporting');
        return {
          schema: SCHEMA,
          schemaVersion: SCHEMA_VERSION,
          sessionId: safeSessionId,
          metadata: { ...safeMetadata },
          settings: {
            coverageTarget,
            confidenceThreshold,
            candidateNames: [...safeCandidateNames],
          },
          trials: trials.map((trial) => ({
            ...trial,
            stimulus: { ...trial.stimulus },
            outcome: { ...trial.outcome },
          })),
          summary: summary(),
          privacy: {
            audioStored: false,
            spectraStored: false,
            microphoneIdentifiersStored: false,
            exactTimestampsStored: false,
          },
        };
      },
    };
  }

  return { SCHEMA, SCHEMA_VERSION, createSession, summarizeSessions };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RealPianoAcceptance;
