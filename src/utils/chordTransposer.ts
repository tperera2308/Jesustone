import {
  transposeNote,
  transposeSingleChord,
  transposeChordSheet,
  extractUniqueChordsFromSheet,
  generateLeadSheetSVGDataUrl,
} from './musicTheory';

export const MAJOR_KEYS = [
  'C',
  'C#',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export const MINOR_KEYS = [
  'Am',
  'A#m',
  'Bbm',
  'Bm',
  'Cm',
  'C#m',
  'Dm',
  'D#m',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
] as const;

export const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_ORDER_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function getSemitoneDistance(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey) return 0;
  const cleanFrom = fromKey.replace(/m$/, '');
  const cleanTo = toKey.replace(/m$/, '');

  const idxFrom = NOTE_ORDER.indexOf(cleanFrom) !== -1 ? NOTE_ORDER.indexOf(cleanFrom) : NOTE_ORDER_FLATS.indexOf(cleanFrom);
  const idxTo = NOTE_ORDER.indexOf(cleanTo) !== -1 ? NOTE_ORDER.indexOf(cleanTo) : NOTE_ORDER_FLATS.indexOf(cleanTo);

  if (idxFrom === -1 || idxTo === -1) return 0;
  return (idxTo - idxFrom + 12) % 12;
}

export function transposeKey(key: string, semitones: number): string {
  if (!key) return key;
  const isMinor = key.endsWith('m') && !key.endsWith('dim');
  const root = isMinor ? key.slice(0, -1) : key;
  const transposed = transposeNote(root, semitones);
  return isMinor ? `${transposed}m` : transposed;
}

export function transposeLineText(line: string, semitones: number, useSolfege = false): string {
  return transposeChordSheet(line, semitones, useSolfege);
}

export {
  transposeNote,
  transposeSingleChord,
  transposeChordSheet,
  extractUniqueChordsFromSheet,
  generateLeadSheetSVGDataUrl,
};
