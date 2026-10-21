// Web Audio API Synthesizer, Metronome, Pitch Pipe, and Microphone Pitch Detection Engine

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

export interface PianoKeyDefinition {
  note: string;
  solfege: string;
  octave: number;
  fullNote: string;
  freq: number;
  isSharp: boolean;
}

// 2 Full Octaves: 24 keys from C3 (midi 48) to B4 (midi 71)
export const TWO_OCTAVE_KEYS: PianoKeyDefinition[] = (() => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const solfeges = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  const keys: PianoKeyDefinition[] = [];
  for (let midi = 48; midi <= 71; midi++) {
    const noteIndex = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const note = names[noteIndex];
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    keys.push({
      note,
      solfege: solfeges[noteIndex],
      octave,
      fullNote: `${note}${octave}`,
      freq: Number(freq.toFixed(2)),
      isSharp: note.includes('#'),
    });
  }
  return keys;
})();

export type PianoTimbre = 'piano' | 'worshipPad' | 'electricRhodes';

export function playPianoNote(
  freq: number,
  timbre: PianoTimbre = 'piano',
  sustain = true
): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const duration = sustain ? 2.4 : 0.85;

  const masterGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';

  if (timbre === 'piano') {
    filter.frequency.setValueAtTime(2800, now);
    filter.frequency.exponentialRampToValueAtTime(650, now + duration);

    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.36, now + 0.012);
    masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.28);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    // Fundamental + warm harmonics
    const harmonics = [
      { mult: 1, gain: 0.7, type: 'triangle' as OscillatorType },
      { mult: 2, gain: 0.22, type: 'sine' as OscillatorType },
      { mult: 3, gain: 0.08, type: 'sine' as OscillatorType },
    ];

    harmonics.forEach((h) => {
      const osc = ctx.createOscillator();
      const hGain = ctx.createGain();
      osc.type = h.type;
      osc.frequency.setValueAtTime(freq * h.mult, now);
      hGain.gain.setValueAtTime(h.gain, now);
      osc.connect(hGain);
      hGain.connect(filter);
      osc.start(now);
      osc.stop(now + duration);
    });
  } else if (timbre === 'worshipPad') {
    const padDur = sustain ? 3.4 : 1.5;
    filter.frequency.setValueAtTime(1400, now);
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.28, now + 0.18);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + padDur);

    [-4, 0, 4].forEach((detuneCents) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detuneCents, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + padDur);
    });
  } else {
    // Electric Rhodes
    filter.frequency.setValueAtTime(2100, now);
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.34, now + 0.015);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const bellGain = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 4, now);
    bellGain.gain.setValueAtTime(0.12, now);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(filter);
    osc2.connect(bellGain);
    bellGain.connect(filter);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  filter.connect(masterGain);
  masterGain.connect(ctx.destination);
}

// Play a warm triad chord for Spotify/Song reference preview
const ROOT_FREQS: Record<string, number> = {
  C: 261.63,
  'C#': 277.18,
  Db: 277.18,
  D: 293.66,
  'D#': 311.13,
  Eb: 311.13,
  E: 329.63,
  F: 349.23,
  'F#': 369.99,
  Gb: 369.99,
  G: 392.0,
  'G#': 415.3,
  Ab: 415.3,
  A: 440.0,
  'A#': 466.16,
  Bb: 466.16,
  B: 493.88,
};

export function playChordVoicing(chordSymbol: string): void {
  const match = chordSymbol.match(/^([A-G][#b]?)(m)?/);
  if (!match) return;
  const root = match[1];
  const isMinor = Boolean(match[2]) && !chordSymbol.includes('maj');
  const baseFreq = ROOT_FREQS[root] || 261.63;

  const thirdSemitones = isMinor ? 3 : 4;
  const thirdFreq = baseFreq * Math.pow(2, thirdSemitones / 12);
  const fifthFreq = baseFreq * Math.pow(2, 7 / 12);

  playPianoNote(baseFreq / 2, 'piano', true);
  playPianoNote(baseFreq, 'worshipPad', true);
  playPianoNote(thirdFreq, 'piano', true);
  playPianoNote(fifthFreq, 'piano', true);
}

// Metronome Synthesized Click (Accent on Beat 1)
export function playMetronomeClick(isAccent: boolean): void {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = isAccent ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(isAccent ? 1200 : 800, now);
  osc.frequency.exponentialRampToValueAtTime(isAccent ? 600 : 400, now + 0.045);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(isAccent ? 0.55 : 0.32, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

// Chromatic Pitch Detection Result
export interface PitchDetectionResult {
  frequency: number;
  noteName: string;
  solfegeName: string;
  octave: number;
  cents: number; // -50 to +50 exact float/rounded
  rawCents: number; // unrounded float cents (-50 to +50) for smooth 60fps needle
  isInTune: boolean;
  clarity?: number; // 0..1 pitch confidence
  rms?: number; // 0..1 microphone input level
}

const CHROMATIC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export function frequencyToPitchData(
  freq: number,
  referenceA4 = 440,
  clarity = 1,
  rms = 0.1
): PitchDetectionResult {
  const noteNum = 12 * (Math.log(freq / referenceA4) / Math.log(2));
  const midi = Math.round(noteNum) + 69;
  const standardFreq = referenceA4 * Math.pow(2, (midi - 69) / 12);
  const exactCents = 1200 * Math.log2(freq / standardFreq);
  const clampedRawCents = Math.max(-50, Math.min(50, exactCents));
  const cents = Math.round(clampedRawCents);
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  return {
    frequency: Number(freq.toFixed(1)),
    noteName: CHROMATIC_NAMES[noteIndex],
    solfegeName: CHROMATIC_SOLFEGE[noteIndex],
    octave,
    cents,
    rawCents: clampedRawCents,
    isInTune: Math.abs(exactCents) <= 4.5,
    clarity,
    rms,
  };
}

export interface RawPitchReadout {
  frequency: number;
  clarity: number;
  rms: number;
}

/**
 * Studio-grade real-time McLeod Pitch Method (NSDF - Normalized Square Difference Function)
 * Detects fundamental frequencies from 38 Hz (Low Bass B0/E1) up to 1200 Hz (High Soprano/Guitar)
 * with sub-cent parabolic interpolation and high sensitivity for mobile microphones.
 */
export function detectPitchDetailed(
  buffer: Float32Array,
  sampleRate: number
): RawPitchReadout {
  const size = buffer.length;

  // 1. Compute DC offset and RMS signal energy
  let mean = 0;
  for (let i = 0; i < size; i++) {
    mean += buffer[i];
  }
  mean /= size;

  let rms = 0;
  for (let i = 0; i < size; i++) {
    const centered = buffer[i] - mean;
    rms += centered * centered;
  }
  rms = Math.sqrt(rms / size);

  // Sensitive noise floor so sustained acoustic guitar strings & soft vocals keep tracking smoothly
  if (rms < 0.0022) {
    return { frequency: -1, clarity: 0, rms };
  }

  // Use a focused analysis window (up to 2048 samples) for fast 60fps execution (< 0.8ms)
  const analysisSize = Math.min(size, 2048);
  const minFreq = 38; // Bass E1 (41.2Hz) and down-tuned D1
  const maxFreq = 1250; // High vocals / high guitar frets
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxTau = Math.min(Math.floor(analysisSize * 0.55), Math.ceil(sampleRate / minFreq));

  const nsdf = new Float32Array(maxTau + 1);

  for (let tau = minTau; tau <= maxTau; tau++) {
    let acf = 0;
    let divisorM = 0;
    const limit = analysisSize - tau;
    for (let i = 0; i < limit; i++) {
      const a = buffer[i] - mean;
      const b = buffer[i + tau] - mean;
      acf += a * b;
      divisorM += a * a + b * b;
    }
    nsdf[tau] = divisorM > 0 ? (2 * acf) / divisorM : 0;
  }

  // Find all positive-region peaks in NSDF (after each zero crossing from negative to positive)
  const peaks: { tau: number; val: number }[] = [];
  let inPositiveRegion = false;
  let currentMaxTau = 0;
  let currentMaxVal = -1;

  // Start searching after the initial decay from tau=0
  let startTau = minTau;
  while (startTau < maxTau && nsdf[startTau] > 0) {
    startTau++;
  }

  for (let tau = startTau; tau <= maxTau; tau++) {
    const val = nsdf[tau];
    if (val > 0) {
      if (!inPositiveRegion) {
        inPositiveRegion = true;
        currentMaxTau = tau;
        currentMaxVal = val;
      } else if (val > currentMaxVal) {
        currentMaxTau = tau;
        currentMaxVal = val;
      }
    } else if (inPositiveRegion) {
      peaks.push({ tau: currentMaxTau, val: currentMaxVal });
      inPositiveRegion = false;
    }
  }
  if (inPositiveRegion && currentMaxVal > 0) {
    peaks.push({ tau: currentMaxTau, val: currentMaxVal });
  }

  if (peaks.length === 0) {
    return { frequency: -1, clarity: 0, rms };
  }

  // McLeod First-Peak Selection: pick the first peak that reaches at least 82% of the highest peak
  // This prevents locking onto the 2nd/3rd harmonic (octave jumping) on guitar and piano notes.
  let highestPeakVal = 0;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i].val > highestPeakVal) {
      highestPeakVal = peaks[i].val;
    }
  }

  // Require minimum pitch clarity so random room noise doesn't move the needle
  if (highestPeakVal < 0.48) {
    return { frequency: -1, clarity: highestPeakVal, rms };
  }

  const threshold = highestPeakVal * 0.82;
  const chosenPeak = peaks.find((p) => p.val >= threshold) || peaks[0];
  let refinedTau = chosenPeak.tau;
  let refinedClarity = chosenPeak.val;

  // Parabolic interpolation around chosenPeak.tau for sub-cent accuracy
  if (chosenPeak.tau > minTau && chosenPeak.tau < maxTau) {
    const y1 = nsdf[chosenPeak.tau - 1];
    const y2 = nsdf[chosenPeak.tau];
    const y3 = nsdf[chosenPeak.tau + 1];
    const denom = y1 + y3 - 2 * y2;
    if (Math.abs(denom) > 1e-9) {
      const delta = (y1 - y3) / (2 * denom);
      if (Math.abs(delta) < 1) {
        refinedTau = chosenPeak.tau + delta;
        refinedClarity = y2 - 0.25 * (y1 - y3) * delta;
      }
    }
  }

  const freq = sampleRate / refinedTau;
  if (freq < minFreq || freq > maxFreq || !Number.isFinite(freq)) {
    return { frequency: -1, clarity: 0, rms };
  }

  return {
    frequency: freq,
    clarity: Math.min(1, Math.max(0, refinedClarity)),
    rms,
  };
}

// Backwards-compatible helper returning frequency or -1
export function detectPitchAutocorrelate(
  buffer: Float32Array,
  sampleRate: number
): number {
  return detectPitchDetailed(buffer, sampleRate).frequency;
}

// Generates a playable WAV Data URL (warm musical guide / voice note audio) as fallback when microphone hardware is unavailable
export function generateDemoVoiceClipDataUrl(
  durationSec = 4,
  baseFreq = 261.63
): string {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.min(durationSec, 15)) * sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const chordMultipliers = [1, 1.25, 1.5, 2]; // Major triad + octave arpeggio
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const stepIdx = Math.floor(t * 2) % chordMultipliers.length;
    const freq = baseFreq * chordMultipliers[stepIdx];
    const localT = (t * 2) % 1;
    const env = Math.exp(-localT * 3.2) * Math.min(1, localT * 40);
    const wave =
      Math.sin(2 * Math.PI * freq * t) * 0.6 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.25 +
      Math.sin(2 * Math.PI * (freq / 2) * t) * 0.15;
    const sample = Math.max(-1, Math.min(1, wave * env * 0.55));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

