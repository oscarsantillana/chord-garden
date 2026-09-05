/*
 * Pure spectrum classifier for the configured close-position piano chords.
 * Chroma selects a family; frequency/register and harmonic residuals check
 * whether the apparent notes could instead be partials of a lower string.
 * Ambiguous evidence abstains. FreshChordGate owns temporal stability.
 * Confidence is a heuristic margin, not a probability of correctness.
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

  // Keep frequency and register until note evidence has been checked. Peaks
  // describe partials of strings, not necessarily separately pressed keys.
  spectralPeaks(magnitudes, { sampleRate, fftSize, minFreq = 55, maxFreq = 8000 } = {}) {
    const binHz = sampleRate / fftSize;
    const lo = Math.max(1, Math.ceil(minFreq / binHz));
    const hi = Math.min(magnitudes.length - 2, Math.floor(maxFreq / binHz));
    const peaks = [];
    for (let i = lo; i <= hi; i++) {
      const magnitude = magnitudes[i];
      if (magnitude <= 0 || magnitude < magnitudes[i - 1] || magnitude <= magnitudes[i + 1]) continue;
      const frequency = i * binHz;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      peaks.push({ frequency, magnitude, midi, pitchClass: ((midi % 12) + 12) % 12 });
    }
    return peaks;
  },

  noteEvidence(magnitudes, chord, opts) {
    const peaks = ChordDetect.spectralPeaks(magnitudes, opts);
    const lowPeaks = peaks.filter(peak => peak.frequency <= 2200);
    const maximum = Math.max(0, ...lowPeaks.map(peak => peak.magnitude));
    // Select apparent keys from prominent peaks. Quieter components remain
    // available below as lower-string evidence; they cannot displace a key
    // solely because their frequency comes first.
    const edge = lowPeaks.filter(peak => peak.magnitude >= maximum * .1).slice(0, 4);
    const expected = new Set(chord.notes.map(ChordDetect.noteNameToPitchClass));
    const notes = [];
    for (const peak of edge) {
      if (expected.has(peak.pitchClass) && !notes.some(note => note.pitchClass === peak.pitchClass)) notes.push(peak);
    }
    // Every configured voicing is close-position: its three fundamentals fit
    // inside one octave. An open dyad's third/fifth harmonics must not fill
    // in a missing key above that octave (for example C4 + E5 -> phantom G5).
    const complete = notes.length === 3 && edge[0].pitchClass === notes[0].pitchClass &&
      notes[2].midi - notes[0].midi < 12;
    if (!complete) return { complete: false, ambiguousBass: false, notes };

    const binHz = opts.sampleRate / opts.fftSize;
    const findPartial = (frequency, floor) => peaks.find(peak =>
      peak.magnitude >= maximum * floor && Math.abs(peak.frequency - frequency) <= binHz * .6 + frequency * .002);
    const partialFrequency = (f0, harmonic, b) => f0 * harmonic * Math.sqrt(1 + b * harmonic * harmonic);
    const coefficients = [0, .0002, .0004, .0006, .0012, .002];
    const bass = notes[0];
    const harmonicGroups = notes.flatMap(note => {
      const f0 = 440 * 2 ** ((note.midi - 69) / 12);
      return Array.from({ length: 8 }, (_, index) => coefficients.map(b => {
        const frequency = partialFrequency(f0, index + 1, b);
        const bin = Math.round(frequency / binHz);
        const amplitude = Math.max(0, ...[-1, 0, 1].map(offset => magnitudes[bin + offset] || 0));
        return { frequency, amplitude };
      }));
    });
    const residuals = new Map();
    function residualAt(frequency) {
      const bin = Math.round(frequency / binHz);
      if (residuals.has(bin)) return residuals.get(bin);
      // Bound the leakage from each apparent note's harmonics. Both the live
      // Blackman window and the older Hann fixtures are supported. This also
      // detects a partial forming a shoulder beside a stronger peak.
      let explained = 0;
      for (const group of harmonicGroups) {
        let leakage = 0;
        for (const partial of group) {
          const distance = Math.abs(bin - partial.frequency / binHz);
          leakage = Math.max(leakage, partial.amplitude * ChordDetect.windowLeakage(distance) * 1.5);
        }
        explained += leakage;
      }
      const residual = Math.max(0, (magnitudes[bin] || 0) - explained);
      residuals.set(bin, residual);
      return residual;
    }
    let lowestSupported = bass.midi;
    // A plausible lower string invalidates both bass and completeness. Its
    // even harmonics may have supplied the apparent keys, even if it has the
    // same pitch class as the apparent bass.
    for (let midi = bass.midi - 12; midi < bass.midi; midi++) {
      if (!expected.has(((midi % 12) + 12) % 12)) continue;
      const f0 = 440 * 2 ** ((midi - 69) / 12);
      if (f0 < 55) continue;
      const supported = coefficients.some(b => {
        const thirdBin = partialFrequency(f0, 3, b) / binHz;
        // The third often merges with another key's harmonic. It corroborates
        // a lower string; it need not create a separate local maximum.
        const thirdMagnitude = Math.max(magnitudes[Math.floor(thirdBin)] || 0, magnitudes[Math.ceil(thirdBin)] || 0);
        if (!findPartial(partialFrequency(f0, 2, b), .04) || thirdMagnitude < maximum * .025) return false;
        const fundamental = findPartial(partialFrequency(f0, 1, b), .01);
        // A shared harmonic is not independent support for a lower key.
        // For example, D4's second harmonic also lies at G3's third.
        if (midi > bass.midi - 12 && fundamental?.midi === midi &&
            findPartial(partialFrequency(f0, 3, b), .025) && residualAt(f0) >= maximum * .01 &&
            residualAt(partialFrequency(f0, 3, b)) >= maximum * .005) return true;
        return [3, 5, 7].some(harmonic => {
          const frequency = partialFrequency(f0, harmonic, b);
          const residual = residualAt(frequency);
          // A windowed partial occupies adjacent bins. An isolated low-level
          // bin in a sparse fixture (or a narrow numerical spike) is insufficient.
          return residual >= maximum * .005 &&
            Math.max(residualAt(frequency - binHz), residualAt(frequency + binHz)) >= residual * .15;
        });
      });
      if (supported) { lowestSupported = midi; break; }
    }
    return { complete: true, notes, ambiguousBass: lowestSupported < bass.midi };
  },

  // Magnitude response in FFT-bin units, normalized to the window's centre.
  // Use an upper bound across Hann/Blackman so leakage never becomes a key.
  windowLeakage(distance) {
    if (distance < .7) return 1;
    const sinc = x => Math.abs(x) < 1e-8 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const centre = sinc(distance);
    const neighbours = sinc(distance - 1) + sinc(distance + 1);
    const outer = sinc(distance - 2) + sinc(distance + 2);
    return Math.max(Math.abs(centre + .5 * neighbours), Math.abs(centre + (.25 / .42) * neighbours + (.04 / .42) * outer));
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

  // Cosine similarity selects the family. The gap to the next family is a
  // heuristic confidence score; it does not establish which keys were played.
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

  // Family classification plus note evidence. identifyWithBass resolves the
  // inversion for live microphone capture.
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
    const noteEvidence = winnerChord ? ChordDetect.noteEvidence(magnitudes, winnerChord, { sampleRate, fftSize, minFreq }) : null;
    if (noteEvidence && (!noteEvidence.complete || noteEvidence.ambiguousBass)) {
      return { chroma, energy, silence: false, ...match, confidence: 0,
        incomplete: !noteEvidence.complete, ambiguousBass: noteEvidence.ambiguousBass, noteEvidence };
    }
    return { chroma, energy, silence: false, ...match, noteEvidence };
  },

  // Name an active written inversion only after note and family checks pass.
  identifyWithBass(magnitudes, { sampleRate, fftSize, chords, minFreq, maxFreq, minEnergy, bassOpts = {}, ...matchOpts } = {}) {
    const result = ChordDetect.identify(magnitudes, { sampleRate, fftSize, chords, minFreq, maxFreq, minEnergy, ...matchOpts });
    if (result.silence || result.incomplete || result.ambiguousBass || !result.best) return result;

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
      // After checking note evidence, compare distinct families using the
      // margin calibrated by the sampled-piano regression corpus.
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
    const bassPitchClass = result.noteEvidence?.notes[0]?.pitchClass;
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
          method: 'note-evidence',
        },
      };
    }

    // The observed bass must map to one active, configured voicing.
    return {
      ...result,
      confidence: 0,
      bass: {
        best: { name: null, score: 0 },
        second: { name: null, score: 0 },
        margin: 0,
        confidence: 0,
        pitchClass: bassPitchClass == null ? null : bassPitchClass,
        method: 'note-evidence',
      },
    };
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = ChordDetect;
