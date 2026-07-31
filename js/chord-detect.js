/*
 * Rainbow Pitch — pure real-piano spectrum classification.
 *
 * No DOM, Web Audio, or microphone access lives here. A caller supplies a
 * linear magnitude spectrum and receives a selective chord result. The same
 * code therefore runs against an AnalyserNode in the browser and against
 * deterministic spectra in Node.
 *
 * The classifier keeps two kinds of evidence instead of folding everything
 * into chroma:
 *   1. chroma identifies the three-note pitch-class family;
 *   2. the spectrum's low-frequency edge proves that all three keys are
 *      present and identifies the bass pitch class for inversion ties.
 *
 * This matters because the nine core colours are three inversions of three
 * triads. Chroma alone is intentionally octave-invariant and cannot separate
 * Red/Orange/Brown, Yellow/Black/Purple, or Blue/Green/Pink. The low edge
 * retains exactly the register information that chroma discards.
 *
 * The release contract is selective: incomplete or ambiguous evidence returns
 * confidence 0 rather than a guess. Fresh-attack and multi-frame agreement are
 * separate temporal concerns owned by FreshChordGate. See
 * REAL-PIANO-MODE-NOTES.md for the discarded harmonic-inference experiments
 * and the evidence behind the shipped design.
 *
 * Tests cover full-pool synthetic adversarial spectra, live analyser
 * resolution, and onset-aligned Salamander sampled-piano spectra. Those are
 * useful regression evidence, not a claim that every acoustic piano, room,
 * and device microphone has been validated.
 */

const ChordDetect = {
  PITCH_CLASSES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

  // 'C#4' -> 1, 'Bb3' -> 10. Scientific pitch name: letter, optional
  // accidental, octave digit (octave is ignored — only the pitch class,
  // 0-11 with C=0, matters for chord identity here).
  noteNameToPitchClass(note) {
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
    if (!m) throw new Error(`Not a scientific pitch name: ${note}`);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    return ((base + accidental) % 12 + 12) % 12;
  },

  // {notes:[...]} -> number[12], one-hot per distinct pitch class present,
  // weight 1.0. Deliberately NOT harmonic-weighted (no boosted 5th/3rd
  // bins) — that weighting belongs to the observation side
  // (chromaFromSpectrum), not the template, or two different chords'
  // templates would converge on shared overtone-heavy bins.
  chordTemplate(chord) {
    const template = new Array(12).fill(0);
    chord.notes.forEach((note) => {
      template[ChordDetect.noteNameToPitchClass(note)] = 1.0;
    });
    return template;
  },

  // Cosine similarity between two same-length non-negative vectors, clamped
  // to [0, 1] (both inputs are non-negative here, so the raw cosine is
  // already >= 0, but we clamp defensively against float noise).
  cosineSimilarity(a, b) {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB));
    return Math.max(0, Math.min(1, sim));
  },

  // Helper for callers reading AnalyserNode.getFloatFrequencyData (dB,
  // typically negative) back into linear magnitude.
  dbToLinear(db) {
    return Math.pow(10, db / 20);
  },

  // Return the pitch classes of the first few salient spectral peaks, ordered
  // from low to high frequency. A real three-note close-position chord puts
  // the three played notes below the notes' upper harmonics; a single piano
  // key instead repeats its own harmonic series. Keeping octave/register here
  // provides the chord-completeness evidence that a folded chroma vector
  // deliberately cannot retain.
  lowEdgePitchClasses(magnitudes, {
    sampleRate,
    fftSize,
    minFreq = 55,
    maxFreq = 2200,
    relativePeakFloor = 0.04,
    peakCount = 4,
  } = {}) {
    const binHz = sampleRate / fftSize;
    const lo = Math.max(1, Math.ceil(minFreq / binHz));
    const hi = Math.min(magnitudes.length - 2, Math.floor(maxFreq / binHz));
    let maxMagnitude = 0;
    for (let i = lo; i <= hi; i++) {
      if (magnitudes[i] > maxMagnitude) maxMagnitude = magnitudes[i];
    }
    if (maxMagnitude <= 0) return [];

    const floor = maxMagnitude * relativePeakFloor;
    const peaks = [];
    for (let i = lo; i <= hi; i++) {
      const magnitude = magnitudes[i];
      if (magnitude < floor || magnitude < magnitudes[i - 1] || magnitude <= magnitudes[i + 1]) continue;
      const freq = i * binHz;
      const midi = 69 + 12 * Math.log2(freq / 440);
      peaks.push(((Math.round(midi) % 12) + 12) % 12);
      if (peaks.length >= peakCount) break;
    }
    return peaks;
  },

  hasCompleteChordEvidence(magnitudes, chord, opts = {}) {
    const observed = ChordDetect.lowEdgePitchClasses(magnitudes, opts);
    const expected = new Set(chord.notes.map((note) => ChordDetect.noteNameToPitchClass(note)));
    return [...expected].every((pitchClass) => observed.includes(pitchClass));
  },

  // magnitudes: LINEAR-magnitude array, length fftSize/2 (the AnalyserNode
  // frequencyBinCount convention — dB->linear conversion is the caller's
  // job via dbToLinear, so this function is source-agnostic: it works the
  // same whether the spectrum came from a real AnalyserNode or a synthetic
  // DFT in a Node test).
  chromaFromSpectrum(magnitudes, { sampleRate, fftSize, minFreq = 55, maxFreq = 5000 } = {}) {
    const chroma = new Array(12).fill(0);
    let energy = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const freq = (i * sampleRate) / fftSize;
      if (freq < minFreq || freq > maxFreq) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      const power = magnitudes[i] * magnitudes[i];
      chroma[pc] += power;
      energy += power;
    }
    const max = Math.max(...chroma);
    if (max > 0) {
      for (let i = 0; i < 12; i++) chroma[i] /= max;
    }
    return { chroma, energy };
  },

  // score = cosine similarity between the observed chroma and each
  // candidate chord's template. `chords` should be ONLY the profile's
  // active colours (not the full CHORDS table) — both a correctness
  // measure (only active colours are things the child could actually
  // answer) and a non-issue for cost at <=14 candidates.
  //
  // Confidence is MARGIN-primary, gated by an absolute floor:
  //
  //   confidence = best.score < minAbsScore
  //     ? 0
  //     : clamp01((margin - noiseFloorMargin) / (targetMargin - noiseFloorMargin))
  //
  // Rationale (load-bearing): a sparse 3-of-12 template scores only
  // "middling" even when correct, because real piano overtones bleed
  // energy outside the template's 3 bins, capping the ceiling on ANY
  // candidate's absolute score — and because several of these chords share
  // 1-2 pitch classes, a wrong candidate can ride the same overtone bleed to
  // a near-identical absolute score. What actually distinguishes "correct
  // and confident" from "genuinely ambiguous" is how far the winner pulls
  // ahead of the runner-up, hence margin-primary.
  //
  // minAbsScore/noiseFloorMargin/targetMargin are explicit `opts`
  // overrides. The defaults are protected by the synthetic and
  // sampled-piano regression corpora; re-evaluate them only with preserved
  // failures from the remaining physical piano/device-mic acceptance pass.
  matchChord(chroma, chords, { minAbsScore = 0.35, noiseFloorMargin = 0.03, targetMargin = 0.25 } = {}) {
    const scores = chords
      .map((chord) => ({ name: chord.name, score: ChordDetect.cosineSimilarity(chroma, ChordDetect.chordTemplate(chord)) }))
      .sort((a, b) => b.score - a.score);

    const best = scores[0] || { name: null, score: 0 };
    const second = scores[1] || { name: null, score: 0 };
    const margin = best.score - second.score;

    let confidence;
    if (best.score < minAbsScore) {
      confidence = 0;
    } else {
      const raw = (margin - noiseFloorMargin) / (targetMargin - noiseFloorMargin);
      confidence = Math.max(0, Math.min(1, raw));
    }

    return { best, second, margin, confidence, scores };
  },

  // One-shot pipeline: the single entry point both js/mic-capture.js (real
  // AnalyserNode data) and tests/chord-detect.test.mjs (synthetic DFT data)
  // call — identical code path either way.
  identify(magnitudes, { sampleRate, fftSize, chords, minFreq, maxFreq, minEnergy = 1e-6, ...matchOpts } = {}) {
    const { chroma, energy } = ChordDetect.chromaFromSpectrum(magnitudes, { sampleRate, fftSize, minFreq, maxFreq });

    if (energy < minEnergy) {
      // Distinguishes "heard nothing" from "heard something, couldn't
      // tell" for any future debug view — the app's mic-capture state
      // machine currently collapses both into the same gentle retry state.
      return { chroma, energy, silence: true, confidence: 0, best: null, second: null, margin: 0, scores: [] };
    }

    const match = ChordDetect.matchChord(chroma, chords, matchOpts);
    const winnerChord = chords.find((chord) => chord.name === match.best.name);
    if (winnerChord && !ChordDetect.hasCompleteChordEvidence(magnitudes, winnerChord, {
      sampleRate,
      fftSize,
      minFreq,
      maxFreq,
    })) {
      return { chroma, energy, silence: false, ...match, confidence: 0, incomplete: true };
    }
    return { chroma, energy, silence: false, ...match };
  },

  // ===========================================================================
  // Retired harmonic-inference research helpers.
  //
  // None of the functions down through disambiguateBassVoicing() participates
  // in identifyWithBass() or the live microphone path. They remain only so
  // the failed 37% whole-voicing experiment in REAL-PIANO-MODE-NOTES.md stays
  // reproducible. Do not use their relative score as detector confidence.
  // ===========================================================================

  // 'C4' -> 60 (MIDI, middle C == 60, same convention as
  // 440*2^((midi-69)/12) == A4 == 69). Octave-AWARE (unlike
  // noteNameToPitchClass above) because bass disambiguation needs the actual
  // semitone distance between a chord's notes, not just their pitch classes.
  noteNameToMidi(note) {
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
    if (!m) throw new Error(`Not a scientific pitch name: ${note}`);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
    const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    const octave = parseInt(m[3], 10);
    return (octave + 1) * 12 + base + accidental;
  },

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  // A chord's notes, re-expressed as semitone offsets ABOVE its own bass
  // note (chord.notes[0] — js/data.js always lists a chord's notes
  // low-to-high, so this needs no separate mapping table). E.g. yellow
  // (C4,F4,A4) -> [0,5,9]; purple (F4,A4,C5) -> [0,4,7]. This is what makes
  // the joint search below transposition-INVARIANT: the same 3 offsets
  // describe that voicing wherever on a real keyboard it's actually played.
  chordSemitoneOffsets(chord) {
    const bassMidi = ChordDetect.noteNameToMidi(chord.notes[0]);
    return chord.notes.map((note) => ChordDetect.noteNameToMidi(note) - bassMidi);
  },

  // One-sided per-harmonic search window in Hz: piano string inharmonicity
  // always stretches partials SHARP of k*f0, never flat, so the window is
  // [k*f0*(1-detuneSlack), k*f0*sqrt(1+maxB*k^2)], not a symmetric band
  // around k*f0. maxB=0.0006 is a generous upper bound for real piano
  // inharmonicity in the B3-G4-ish register (published coefficients for
  // mid-register notes typically run ~0.0002-0.0005); detuneSlack=0.01
  // covers ordinary tuning drift/DFT picket-fence below k*f0.
  harmonicWindow(f0, k, { maxB = 0.0006, detuneSlack = 0.01 } = {}) {
    const lower = k * f0 * (1 - detuneSlack);
    const upper = k * f0 * Math.sqrt(1 + maxB * k * k);
    return [lower, upper];
  },

  // Peak magnitude within [loFreq,hiFreq], padded by 1 bin on each side so a
  // narrow low-k window that falls between bin centres (DFT picket-fence)
  // doesn't silently miss the true peak.
  peakInRange(magnitudes, sampleRate, fftSize, loFreq, hiFreq) {
    const binHz = sampleRate / fftSize;
    const lo = Math.max(0, Math.floor(loFreq / binHz) - 1);
    const hi = Math.min(magnitudes.length - 1, Math.ceil(hiFreq / binHz) + 1);
    let peak = 0;
    for (let i = lo; i <= hi; i++) if (magnitudes[i] > peak) peak = magnitudes[i];
    return peak;
  },

  // Harmonic-series evidence for ONE f0 hypothesis: sum of squared peak
  // magnitudes at harmonics k=1..harmonics, each found within an
  // inharmonicity/detune-tolerant window (harmonicWindow). SUMMED, not
  // multiplied — a product-style HPS collapses to zero the instant any one
  // harmonic bin is weak, which is exactly the missing-fundamental failure
  // mode this function exists to survive; k=1 is included but a near-zero
  // contribution there only costs 1 of `harmonics` terms, never zeroes the
  // whole score.
  harmonicSeriesScore(magnitudes, f0, { sampleRate, fftSize, harmonics = 8, maxB, detuneSlack } = {}) {
    let score = 0;
    const nyquist = (sampleRate / 2);
    for (let k = 1; k <= harmonics; k++) {
      const [lo, hi] = ChordDetect.harmonicWindow(f0, k, { maxB, detuneSlack });
      if (lo > nyquist) break; // higher k would only go further past Nyquist
      const peak = ChordDetect.peakInRange(magnitudes, sampleRate, fftSize, lo, Math.min(hi, nyquist));
      score += peak * peak;
    }
    return score;
  },

  // Total power in the spectrum within [minFreq,maxFreq] — the denominator
  // for an ABSOLUTE (not just relative/ranking) evidence floor in
  // disambiguateBassVoicing, so low-level noise (every candidate's score
  // near-zero, but still nominally rankable against each other) can't
  // produce a falsely confident bass call. Found necessary empirically: the
  // first cut of this feature ranked candidates by margin alone and returned
  // confidence 1.0 on pure noise, because a relative gap can look "large"
  // even when every candidate's underlying evidence is meaningless.
  bandPower(magnitudes, { sampleRate, fftSize, minFreq = 80, maxFreq = 900 } = {}) {
    let total = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      const freq = (i * sampleRate) / fftSize;
      if (freq < minFreq || freq > maxFreq) continue;
      total += magnitudes[i] * magnitudes[i];
    }
    return total;
  },

  // Joint score for ONE candidate voicing (its semitoneOffsets, from
  // chordSemitoneOffsets) at ONE hypothesized bass MIDI value: the average,
  // across all of the voicing's notes, of harmonicSeriesScore at each note's
  // expected frequency. All notes are scored at the SAME shared
  // transposition — this is the load-bearing difference from an earlier,
  // empirically-broken version that searched each note independently (see
  // file header): a false transposition now has to coincidentally explain
  // every one of the voicing's notes at once, not just one.
  voicingScoreAtBass(magnitudes, semitoneOffsets, bassMidi, opts) {
    let total = 0;
    for (const offset of semitoneOffsets) {
      total += ChordDetect.harmonicSeriesScore(magnitudes, ChordDetect.midiToFreq(bassMidi + offset), opts);
    }
    return total / semitoneOffsets.length;
  },

  // Best-fit transposition for one candidate voicing: scans a plausible bass
  // register (minMidi..maxMidi, default ~A1-E6 — wide enough to comfortably
  // cover an adult playing wherever is comfortable on a real keyboard, at
  // least an octave either side of any of js/data.js's own digital
  // registers — deliberately NOT anchored to one specific digital octave)
  // and returns whichever bass MIDI value gives this voicing the strongest
  // joint harmonic support.
  bestTranspositionForVoicing(magnitudes, semitoneOffsets, opts = {}) {
    const { minMidi = 33, maxMidi = 88 } = opts;
    let best = null;
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      const score = ChordDetect.voicingScoreAtBass(magnitudes, semitoneOffsets, midi, opts);
      if (!best || score > best.score) best = { midi, score };
    }
    return best;
  },

  // Retired research entry point: given 2-3 ALREADY-KNOWN candidate
  // chords that share one chroma template (a same-family tie — see
  // identifyWithBass below), scores each candidate's WHOLE relative voicing
  // at its own best-fit transposition and returns whichever explains the
  // observed spectrum best, with a margin-based confidence in the same
  // spirit as matchChord's (see that function's comment) but calibrated on
  // THIS module's own score scale via tests/chord-detect-bass.test.mjs, not
  // reused from matchChord's chroma-cosine scale.
  //
  // Two gates before a call is trusted, exactly analogous to matchChord's
  // minAbsScore/margin split:
  //   - absolute floor: the winner's score must be a meaningful multiple of
  //     the spectrum's own in-band background power (bandPower), or there's
  //     no real evidence at all — this is what stops pure noise from ever
  //     producing a confident call (two meaningless numbers can still have a
  //     "clear" relative gap between them).
  //   - relative margin: how far the winning voicing's score pulls ahead of
  //     the runner-up's, relative to the winner's own score. Small margin ==
  //     genuinely ambiguous registration == low confidence, same
  //     margin-primary reasoning as matchChord.
  disambiguateBassVoicing(magnitudes, candidateChords, opts = {}) {
    const { minAbsScore = 0.02, noiseFloorMargin = 0.02, targetMargin = 0.12 } = opts;

    const results = candidateChords.map((chord) => ({
      name: chord.name,
      best: ChordDetect.bestTranspositionForVoicing(magnitudes, ChordDetect.chordSemitoneOffsets(chord), opts),
    })).sort((a, b) => b.best.score - a.best.score);

    const best = results[0] || { name: null, best: { midi: null, score: 0 } };
    const second = results[1] || { name: null, best: { midi: null, score: 0 } };
    const relMargin = best.best.score > 0 ? (best.best.score - second.best.score) / best.best.score : 0;

    const power = ChordDetect.bandPower(magnitudes, opts);
    const absOk = power > 0 && best.best.score > power * minAbsScore;

    let confidence = 0;
    if (absOk) {
      confidence = Math.max(0, Math.min(1, (relMargin - noiseFloorMargin) / (targetMargin - noiseFloorMargin)));
    }

    return {
      best: { name: best.name, score: best.best.score },
      second: { name: second.name, score: second.best.score },
      margin: relMargin,
      confidence,
      results,
    };
  },

  // Shipped selective pipeline. Run chroma/completeness first, then require
  // the lowest salient component's pitch class to match a candidate's
  // written bass. For a shared chroma family this selects the one configured
  // inversion; for a unique family it prevents an unwritten inversion from
  // inheriting the configured colour. Missing or non-matching direct evidence
  // produces confidence 0—never a fallback guess from the retired scorer.
  identifyWithBass(magnitudes, { sampleRate, fftSize, chords, minFreq, maxFreq, minEnergy, bassOpts = {}, ...matchOpts } = {}) {
    const result = ChordDetect.identify(magnitudes, { sampleRate, fftSize, chords, minFreq, maxFreq, minEnergy, ...matchOpts });
    if (result.silence || result.incomplete || !result.best) return result;

    const winnerChord = chords.find((c) => c.name === result.best.name);
    if (!winnerChord) return result;
    const winnerKey = ChordDetect.chordTemplate(winnerChord).join('');
    const tiedChords = chords.filter((c) => ChordDetect.chordTemplate(c).join('') === winnerKey);
    let resolvedConfidence = result.confidence;

    if (tiedChords.length > 1) {
      // Remove duplicate inversion templates and recompute confidence between
      // genuinely different triad families. The original match's runner-up is
      // another byte-identical inversion, so its zero margin says nothing
      // about whether this family clearly beat the next family. Direct bass
      // evidence may break an inversion tie, but it must never erase a
      // Red-family-vs-Yellow-family near-tie.
      const familyRepresentatives = [];
      const seenTemplates = new Set();
      for (const chord of chords) {
        const key = ChordDetect.chordTemplate(chord).join('');
        if (seenTemplates.has(key)) continue;
        seenTemplates.add(key);
        familyRepresentatives.push(chord);
      }
      // Completeness has already established three direct low-edge pitch
      // classes, so this is a narrower "did the winning family at least pull
      // clear of the next distinct family?" check—not the original
      // chroma-only decision. Sampled-piano onsets need a smaller target
      // margin than the 0.25 chroma-only default, while a near-tie below 0.02
      // still maps to zero confidence.
      const familyMatch = ChordDetect.matchChord(result.chroma, familyRepresentatives, {
        ...matchOpts,
        noiseFloorMargin: bassOpts.familyNoiseFloorMargin != null
          ? bassOpts.familyNoiseFloorMargin
          : 0.02,
        targetMargin: bassOpts.familyTargetMargin != null
          ? bassOpts.familyTargetMargin
          : 0.12,
      });
      const familyWinner = chords.find((chord) => chord.name === familyMatch.best.name);
      const familyWinnerKey = familyWinner
        ? ChordDetect.chordTemplate(familyWinner).join('')
        : null;
      resolvedConfidence = familyWinnerKey === winnerKey ? familyMatch.confidence : 0;
    }

    // Chroma has already established the pitch-class family. Preserve the
    // octave information long enough to read the lowest salient component,
    // then map that bass pitch class to the one configured candidate in this
    // family whose written voicing starts on the same pitch class.
    const lowEdge = ChordDetect.lowEdgePitchClasses(magnitudes, {
      sampleRate,
      fftSize,
      minFreq: bassOpts.minFreq,
      maxFreq: bassOpts.maxFreq,
      relativePeakFloor: bassOpts.relativePeakFloor,
      peakCount: 1,
    });
    const bassPitchClass = lowEdge[0];
    const directMatches = tiedChords.filter(
      (chord) => ChordDetect.noteNameToPitchClass(chord.notes[0]) === bassPitchClass
    );
    if (directMatches.length === 1) {
      const direct = directMatches[0];
      return {
        ...result,
        best: { name: direct.name, score: result.best.score },
        confidence: resolvedConfidence,
        bass: {
          best: { name: direct.name, score: 1 },
          second: { name: null, score: 0 },
          margin: 1,
          confidence: 1,
          pitchClass: bassPitchClass,
          method: 'low-edge',
        },
      };
    }

    // No direct lower-edge evidence means "can't tell." Do not fall back to
    // the old inferred-harmonic scorer: the adversarial suite documents that
    // it can become confidently wrong on missing-fundamental cases.
    return {
      ...result,
      confidence: 0,
      bass: {
        best: { name: null, score: 0 },
        second: { name: null, score: 0 },
        margin: 0,
        confidence: 0,
        pitchClass: bassPitchClass == null ? null : bassPitchClass,
        method: 'low-edge',
      },
    };
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ChordDetect;
