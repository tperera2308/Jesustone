const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const SOLFEGE_MAP: Record<string, string> = {
  C: 'Do',
  'C#': 'Do#',
  Db: 'Reb',
  D: 'Re',
  'D#': 'Re#',
  Eb: 'Mib',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa#',
  Gb: 'Solb',
  G: 'Sol',
  'G#': 'Sol#',
  Ab: 'Lab',
  A: 'La',
  'A#': 'La#',
  Bb: 'Sib',
  B: 'Si',
};

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

export function transposeNote(note: string, semitones: number, preferFlats = false): string {
  const idx = NOTE_TO_INDEX[note];
  if (idx === undefined) return note;
  const newIndex = ((idx + semitones) % 12 + 12) % 12;
  return preferFlats ? NOTES_FLAT[newIndex] : NOTES_SHARP[newIndex];
}

export function transposeSingleChord(
  chord: string,
  semitones: number,
  useSolfege = false
): string {
  const match = chord.match(/^([A-G][#b]?)(.*?)(\/([A-G][#b]?))?$/);
  if (!match) return chord;

  const [, root, quality, , bass] = match;
  const rootTransposed = transposeNote(root, semitones);
  const preferFlats = FLAT_KEYS.has(rootTransposed + (quality.startsWith('m') && !quality.startsWith('maj') ? 'm' : ''));
  const finalRoot = transposeNote(root, semitones, preferFlats);
  const finalBass = bass ? transposeNote(bass, semitones, preferFlats) : undefined;

  const formattedRoot = useSolfege ? (SOLFEGE_MAP[finalRoot] || finalRoot) : finalRoot;
  const formattedBass = finalBass
    ? '/' + (useSolfege ? (SOLFEGE_MAP[finalBass] || finalBass) : finalBass)
    : '';

  return `${formattedRoot}${quality}${formattedBass}`;
}

const CHORD_TOKEN_REGEX = /^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:sus[24]|add[0-9]+|b[59]|#[59]|maj[79])?(?:\/[A-G][#b]?)?$/;

export function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^\[(Intro|Verso|Coro|Puente|Pre-Coro|Instrumental|Final|Tag|Estrofa|アウトロ).*\]$/i.test(trimmed)) {
    return false;
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const validChords = tokens.filter(
    (t) => CHORD_TOKEN_REGEX.test(t.replace(/[|()]/g, '')) || t === '|' || t === '/' || t === '-' || t === 'x2' || t === 'x4'
  );
  return validChords.length / tokens.length >= 0.65;
}

export function transposeChordSheet(
  sheet: string,
  semitones: number,
  useSolfege = false
): string {
  const lines = sheet.split('\n');
  return lines
    .map((line) => {
      // Handle bracketed inline chords like [G]Cantaré a [D/F#]ti
      if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
        return line.replace(/\[([A-G][#b]?[^\]]*)\]/g, (full, inner) => {
          if (CHORD_TOKEN_REGEX.test(inner)) {
            return `[${transposeSingleChord(inner, semitones, useSolfege)}]`;
          }
          return full;
        });
      }

      // Handle chord-over-lyric lines while preserving exact column spacing
      if (isChordLine(line)) {
        return line.replace(/([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|M)?[0-9]*(?:sus[24]|add[0-9]+|b[59]|#[59]|maj[79])?(?:\/[A-G][#b]?)?)/g, (match) => {
          if (CHORD_TOKEN_REGEX.test(match)) {
            return transposeSingleChord(match, semitones, useSolfege);
          }
          return match;
        });
      }

      return line;
    })
    .join('\n');
}

export function generateLeadSheetSVGDataUrl(
  title: string,
  artist: string,
  keyStr: string,
  bpm: number,
  timeSig: string,
  chordsPreview: string[]
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" width="800" height="560">
    <rect width="800" height="560" rx="16" fill="#FAF8F5"/>
    <rect x="24" y="24" width="752" height="512" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
    <text x="56" y="76" font-family="sans-serif" font-size="26" font-weight="bold" fill="#0F172A">${title.replace(/&/g, '&amp;')}</text>
    <text x="56" y="104" font-family="sans-serif" font-size="14" fill="#64748B">${artist.replace(/&/g, '&amp;')} · Guía de Acordes Oficial</text>
    <rect x="580" y="52" width="164" height="56" rx="8" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.5"/>
    <text x="662" y="76" font-family="monospace" font-size="15" font-weight="bold" fill="#B45309" text-anchor="middle">TONO: ${keyStr} · ${bpm} BPM</text>
    <text x="662" y="96" font-family="monospace" font-size="12" fill="#92400E" text-anchor="middle">COMPÁS: ${timeSig}</text>
    <line x1="56" y1="126" x2="744" y2="126" stroke="#CBD5E1" stroke-width="1.5"/>

    <text x="56" y="164" font-family="sans-serif" font-size="13" font-weight="bold" fill="#475569">ESTRUCTURA Y PROGRESIÓN PRINCIPAL (SISTEMA DE COMPASES)</text>
    
    <g transform="translate(56, 184)">
      ${[0, 1, 2, 3].map((i) => {
        const chord = chordsPreview[i % chordsPreview.length] || 'C';
        const x = i * 170;
        return `
          <rect x="${x}" y="0" width="156" height="86" rx="8" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.5"/>
          <text x="${x + 16}" y="24" font-family="monospace" font-size="11" fill="#94A3B8">COMPÁS 0${i + 1}</text>
          <text x="${x + 78}" y="58" font-family="monospace" font-size="26" font-weight="bold" fill="#0F172A" text-anchor="middle">${chord}</text>
          <text x="${x + 78}" y="76" font-family="monospace" font-size="12" fill="#64748B" text-anchor="middle">/  /  /  /</text>
        `;
      }).join('')}
    </g>

    <text x="56" y="314" font-family="sans-serif" font-size="13" font-weight="bold" fill="#475569">DIAGRAMAS DE REFERENCIA (GUITARRA / TECLADO)</text>
    <g transform="translate(56, 334)">
      ${chordsPreview.slice(0, 4).map((chord, i) => {
        const x = i * 170;
        return `
          <rect x="${x}" y="0" width="156" height="140" rx="8" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
          <text x="${x + 78}" y="28" font-family="monospace" font-size="16" font-weight="bold" fill="#D97706" text-anchor="middle">${chord}</text>
          <line x1="${x + 38}" y1="42" x2="${x + 118}" y2="42" stroke="#334155" stroke-width="3"/>
          <line x1="${x + 38}" y1="62" x2="${x + 118}" y2="62" stroke="#94A3B8" stroke-width="1"/>
          <line x1="${x + 38}" y1="82" x2="${x + 118}" y2="82" stroke="#94A3B8" stroke-width="1"/>
          <line x1="${x + 38}" y1="102" x2="${x + 118}" y2="102" stroke="#94A3B8" stroke-width="1"/>
          <line x1="${x + 38}" y1="122" x2="${x + 118}" y2="122" stroke="#94A3B8" stroke-width="1"/>
          ${[0, 1, 2, 3, 4, 5].map((s) => `<line x1="${x + 38 + s * 16}" y1="42" x2="${x + 38 + s * 16}" y2="122" stroke="#94A3B8" stroke-width="1"/>`).join('')}
          <circle cx="${x + 54 + (i % 3) * 16}" cy="${52 + (i % 2) * 20}" r="5" fill="#0F172A"/>
          <circle cx="${x + 86}" cy="${72 + (i % 2) * 20}" r="5" fill="#0F172A"/>
          <circle cx="${x + 102}" cy="52" r="5" fill="#D97706"/>
        `;
      }).join('')}
    </g>

    <text x="56" y="508" font-family="sans-serif" font-size="12" fill="#64748B">Nota de dirección: Mantener dinámica suave en Verso 1 y subir intensidad en el Puente.</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
