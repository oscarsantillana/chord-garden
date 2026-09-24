/*
 * Chord Garden — pure fresh-onset gate for real-piano capture.
 *
 * This module owns no browser APIs or timers. MicCapture feeds it timestamped
 * spectral-frame observations; tests can feed the same public interface
 * deterministically in Node.
 */

const FreshChordGate = {
  create({
    onHeard,
    onLowConfidence,
    onReady,
    onOnset,
    baselineFrames = 3,
    stableFrames = 3,
    confThreshold = 0.55,
    fluxThreshold = 0.12,
    energyRiseRatio = 1.2,
    captureMs = 900,
  } = {}) {
    let state = 'WAIT_BASELINE';
    let calmFrames = 0;
    let baselineEnergy = null;
    let streakName = null;
    let streak = 0;
    let terminal = false;
    let attackStartedAt = null;
    let readySignalled = false;
    let previousEnergy = null;

    function signalReady() {
      if (readySignalled) return;
      readySignalled = true;
      if (typeof onReady === 'function') onReady();
    }

    function updateBaseline(energy) {
      if (!Number.isFinite(energy)) return;
      baselineEnergy = baselineEnergy == null
        ? energy
        : baselineEnergy * 0.8 + energy * 0.2;
    }

    function observeCandidate(result) {
      if (!result || result.silence || result.incomplete || !result.best ||
          result.confidence < confThreshold) {
        streak = 0;
        streakName = null;
        return;
      }
      if (result.best.name === streakName) streak += 1;
      else {
        streakName = result.best.name;
        streak = 1;
      }
      if (streak < stableFrames) return;
      terminal = true;
      state = 'DONE';
      if (typeof onHeard === 'function') onHeard(result);
    }

    function pushFrame({ at = Date.now(), energy = 0, positiveFlux = 0, result = null } = {}) {
      if (terminal) return state;
      const freshRise = positiveFlux >= fluxThreshold && previousEnergy != null &&
        (previousEnergy > 0 ? energy >= previousEnergy * energyRiseRatio : energy > 0);
      previousEnergy = Number.isFinite(energy) ? energy : null;

      if (state === 'WAIT_BASELINE') {
        // Stationary room noise changes individual FFT bins even when its
        // overall level is steady. Require a level rise as well as flux to
        // treat it as activity that should delay baseline readiness.
        const steadyLevel = baselineEnergy != null && Number.isFinite(energy) &&
          energy <= baselineEnergy * energyRiseRatio;
        const calm = positiveFlux < fluxThreshold || steadyLevel;
        updateBaseline(energy);
        if (calm) calmFrames += 1;
        else calmFrames = 0;
        if (calmFrames >= baselineFrames) {
          state = 'WAIT_ONSET';
          signalReady();
        }
        return state;
      }

      if (state === 'WAIT_ONSET') {
        const enoughEnergy = baselineEnergy == null || baselineEnergy <= 0
          ? energy > 0
          : energy >= baselineEnergy * energyRiseRatio;
        if (positiveFlux >= fluxThreshold && enoughEnergy) {
          startAttack(at, result);
        } else {
          updateBaseline(energy);
        }
        return state;
      }

      if (state === 'CAPTURE_ATTACK') {
        // A noise transient must not consume the window for a later piano
        // strike. A new rise resets agreement as well as the capture clock.
        if (freshRise) {
          startAttack(at, result);
        } else if (attackStartedAt != null && at - attackStartedAt > captureMs) {
          state = 'WAIT_BASELINE';
          calmFrames = positiveFlux < fluxThreshold ? 1 : 0;
          baselineEnergy = Number.isFinite(energy) ? energy : null;
          streak = 0;
          streakName = null;
          attackStartedAt = null;
        } else {
          observeCandidate(result);
        }
      }
      return state;
    }

    function startAttack(at, result) {
      state = 'CAPTURE_ATTACK';
      attackStartedAt = at;
      streak = 0;
      streakName = null;
      if (typeof onOnset === 'function') onOnset(at);
      observeCandidate(result);
    }

    function timeout() {
      if (terminal) return state;
      terminal = true;
      state = 'TIMED_OUT';
      if (typeof onLowConfidence === 'function') onLowConfidence();
      return state;
    }

    function cancel() {
      if (terminal) return state;
      terminal = true;
      state = 'CANCELLED';
      return state;
    }

    return {
      pushFrame,
      timeout,
      cancel,
      getState: () => state,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = FreshChordGate;
