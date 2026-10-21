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
  cents: number; // -50 to +50 (clamped to -25..+25 for visual needle)
  isInTune: boolean;
}

const CHROMATIC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export function frequencyToPitchData(
  freq: number,
  referenceA4 = 440
): PitchDetectionResult {
  const noteNum = 12 * (Math.log(freq / referenceA4) / Math.log(2));
  const midi = Math.round(noteNum) + 69;
  const standardFreq = referenceA4 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / standardFreq));
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  return {
    frequency: Number(freq.toFixed(1)),
    noteName: CHROMATIC_NAMES[noteIndex],
    solfegeName: CHROMATIC_SOLFEGE[noteIndex],
    octave,
    cents: Math.max(-50, Math.min(50, cents)),
    isInTune: Math.abs(cents) <= 5,
  };
}

// Autocorrelation algorithm for real-time microphone frequency detection
export function detectPitchAutocorrelate(
  buffer: Float32Array,
  sampleRate: number
): number {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.012) return -1; // Too quiet / noise floor

  let r1 = 0;
  let r2 = size - 1;
  const thres = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < thres) {
      r2 = size - i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const newSize = trimmed.length;
  const c = new Float32Array(newSize);
  for (let i = 0; i < newSize; i++) {
    let sum = 0;
    for (let j = 0; j < newSize - i; j++) {
      sum += trimmed[j] * trimmed[j + i];
    }
    c[i] = sum;
  }

  let d = 0;
  while (d < newSize - 1 && c[d] > c[d + 1]) {
    d++;
  }
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < newSize; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  let T0 = maxpos;
  if (T0 <= 0 || T0 >= newSize - 1) return -1;

  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) {
    T0 = T0 - b / (2 * a);
  }

  const freq = sampleRate / T0;
  if (freq < 55 || freq > 1400) return -1;
  return freq;
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

