import React, { useEffect, useRef, useState } from 'react';
import { AccentColorId, Song, TimeSignature } from '../types';
import {
  PitchDetectionResult,
  PianoKeyDefinition,
  PianoTimbre,
  TWO_OCTAVE_KEYS,
  detectPitchAutocorrelate,
  frequencyToPitchData,
  getAudioContext,
  playMetronomeClick,
  playPianoNote,
} from '../utils/audioEngine';
import { getAccentClasses } from './IdentityModal';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Gauge,
  Mic,
  MicOff,
  Minus,
  Music,
  Pause,
  Piano,
  Play,
  Plus,
  Volume2,
} from 'lucide-react';

interface ToolsModuleProps {
  accentColor: AccentColorId;
  songs: Song[];
  initialBpm?: number | null;
  initialTimeSignature?: TimeSignature | null;
}

const PITCH_PIPE_NOTES = [
  { label: 'C4 (Do)', freq: 261.63 },
  { label: 'C#4', freq: 277.18 },
  { label: 'D4 (Re)', freq: 293.66 },
  { label: 'Eb4', freq: 311.13 },
  { label: 'E4 (Mi)', freq: 329.63 },
  { label: 'F4 (Fa)', freq: 349.23 },
  { label: 'F#4', freq: 369.99 },
  { label: 'G4 (Sol)', freq: 392.0 },
  { label: 'Ab4', freq: 415.3 },
  { label: 'A4 (440Hz)', freq: 440.0 },
  { label: 'Bb4', freq: 466.16 },
  { label: 'B4 (Si)', freq: 493.88 },
];

export const ToolsModule: React.FC<ToolsModuleProps> = ({
  accentColor,
  songs,
  initialBpm,
  initialTimeSignature,
}) => {
  const accent = getAccentClasses(accentColor);

  // null = Pantalla Principal de Selección de Herramienta; 'tuner' | 'piano' | 'metronome' = Pantalla individual propia de cada herramienta
  const [selectedToolScreen, setSelectedToolScreen] = useState<
    null | 'tuner' | 'piano' | 'metronome'
  >(() => (initialBpm ? 'metronome' : null));

  // =========================================================================
  // 1. CHROMATIC TUNER & PITCH PIPE STATE
  // =========================================================================
  const [isMicListening, setIsMicListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [referenceA4, setReferenceA4] = useState<number>(440);
  const [pitchData, setPitchData] = useState<PitchDetectionResult>({
    frequency: 440.0,
    noteName: 'A',
    solfegeName: 'La',
    octave: 4,
    cents: 0,
    isInTune: true,
  });
  const [activePitchPipeFreq, setActivePitchPipeFreq] = useState<number | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pitchPipeOscRef = useRef<OscillatorNode | null>(null);

  const stopMicrophone = () => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsMicListening(false);
  };

  const startMicrophone = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });
      mediaStreamRef.current = stream;
      const ctx = getAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      setIsMicListening(true);

      const buffer = new Float32Array(analyser.fftSize);
      const updatePitch = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buffer);
        const detectedFreq = detectPitchAutocorrelate(buffer, ctx.sampleRate);
        if (detectedFreq !== -1) {
          setPitchData(frequencyToPitchData(detectedFreq, referenceA4));
        }
        rafIdRef.current = requestAnimationFrame(updatePitch);
      };
      rafIdRef.current = requestAnimationFrame(updatePitch);
    } catch {
      setMicError(
        'No se pudo acceder al micrófono. Verifica los permisos o usa el Generador de Tono (Pitch Pipe) inferior.'
      );
      setIsMicListening(false);
    }
  };

  const togglePitchPipeTone = (freq: number) => {
    if (pitchPipeOscRef.current) {
      try {
        pitchPipeOscRef.current.stop();
      } catch {
        // ignore
      }
      pitchPipeOscRef.current = null;
    }

    if (activePitchPipeFreq === freq) {
      setActivePitchPipeFreq(null);
      return;
    }

    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    pitchPipeOscRef.current = osc;
    setActivePitchPipeFreq(freq);
    setPitchData(frequencyToPitchData(freq, referenceA4));
  };

  useEffect(() => {
    return () => {
      stopMicrophone();
      if (pitchPipeOscRef.current) {
        try {
          pitchPipeOscRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const clampedCents = Math.max(-25, Math.min(25, pitchData.cents));
  const needleAngleDeg = (clampedCents / 25) * 65;

  // =========================================================================
  // 2. INTERACTIVE 2-OCTAVE PIANO STATE (24 keys: C3 to B4)
  // =========================================================================
  const [pianoTimbre, setPianoTimbre] = useState<PianoTimbre>('piano');
  const [sustainEnabled, setSustainEnabled] = useState<boolean>(true);
  const [showSolfegeLabels, setShowSolfegeLabels] = useState<boolean>(true);
  const [activeKeyNote, setActiveKeyNote] = useState<string>('C4');
  const [lastPlayedKeyInfo, setLastPlayedKeyInfo] = useState<PianoKeyDefinition>(
    TWO_OCTAVE_KEYS.find((k) => k.fullNote === 'C4') || TWO_OCTAVE_KEYS[12]
  );
  const isMouseDownRef = useRef<boolean>(false);

  const triggerPianoKey = (keyDef: PianoKeyDefinition) => {
    setActiveKeyNote(keyDef.fullNote);
    setLastPlayedKeyInfo(keyDef);
    playPianoNote(keyDef.freq, pianoTimbre, sustainEnabled);
  };

  const whiteKeys = TWO_OCTAVE_KEYS.filter((k) => !k.isSharp);

  // =========================================================================
  // 3. PROFESSIONAL METRONOME STATE (30 to 250 BPM)
  // =========================================================================
  const [bpm, setBpm] = useState<number>(initialBpm || 120);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>(
    initialTimeSignature || '4/4'
  );
  const [isMetronomePlaying, setIsMetronomePlaying] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const tapTimesRef = useRef<number[]>([]);
  const metroTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialBpm) {
      setBpm(Math.max(30, Math.min(250, initialBpm)));
      setSelectedToolScreen('metronome');
    }
    if (initialTimeSignature) {
      setTimeSignature(initialTimeSignature);
    }
  }, [initialBpm, initialTimeSignature]);

  const beatsPerMeasure = (() => {
    switch (timeSignature) {
      case '2/4':
        return 2;
      case '3/4':
        return 3;
      case '6/8':
        return 6;
      case '4/4':
      default:
        return 4;
    }
  })();

  useEffect(() => {
    if (!isMetronomePlaying) {
      if (metroTimerRef.current) {
        window.clearInterval(metroTimerRef.current);
        metroTimerRef.current = null;
      }
      setCurrentBeat(0);
      return;
    }

    let beatIndex = 0;
    setCurrentBeat(1);
    playMetronomeClick(true);

    const intervalMs = Math.round((60 / bpm) * 1000);
    metroTimerRef.current = window.setInterval(() => {
      beatIndex = (beatIndex + 1) % beatsPerMeasure;
      const humanBeat = beatIndex + 1;
      setCurrentBeat(humanBeat);
      const isAccent =
        humanBeat === 1 || (timeSignature === '6/8' && humanBeat === 4);
      playMetronomeClick(isAccent);
    }, intervalMs);

    return () => {
      if (metroTimerRef.current) {
        window.clearInterval(metroTimerRef.current);
        metroTimerRef.current = null;
      }
    };
  }, [isMetronomePlaying, bpm, timeSignature, beatsPerMeasure]);

  const handleTapTempo = () => {
    const now = performance.now();
    const recent = tapTimesRef.current.filter((t) => now - t < 3000);
    recent.push(now);
    tapTimesRef.current = recent;

    playMetronomeClick(false);

    if (recent.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgMs);
      setBpm(Math.max(30, Math.min(250, calculatedBpm)));
    }
  };

  // =========================================================================
  // VISTA 0: MENÚ PRINCIPAL DE SELECCIÓN DE HERRAMIENTA (BOTONES GRANDES)
  // =========================================================================
  if (selectedToolScreen === null) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Selecciona tu Herramienta Musical
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Toca cualquiera de las 3 herramientas para abrirla en su propia pantalla dedicada
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Botón Gigante 1: Afinador Cromático */}
          <button
            type="button"
            onClick={() => setSelectedToolScreen('tuner')}
            className="min-h-[240px] p-6 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-amber-500 shadow-md flex flex-col justify-between text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-md ${accent.bgClass}`}>
                <Gauge className="w-8 h-8" />
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                -25 a +25 cents
              </span>
            </div>

            <div className="space-y-1.5 my-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                Afinador Cromático
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Detección por micrófono en tiempo real, aguja de precisión, frecuencia en Hz y generador Pitch Pipe.
              </p>
            </div>

            <div className={`w-full py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between ${accent.softBgClass}`}>
              <span>Abrir Afinador</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Botón Gigante 2: Piano Interactivo 2 Octavas */}
          <button
            type="button"
            onClick={() => setSelectedToolScreen('piano')}
            className="min-h-[240px] p-6 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 shadow-md flex flex-col justify-between text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Piano className="w-8 h-8" />
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                24 Teclas (C3–B4)
              </span>
            </div>

            <div className="space-y-1.5 my-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                Teclado / Piano 2 Octavas
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                24 teclas táctiles de C3 a B4 con sonidos de Grand Piano, Worship Pad y Rhodes para entonar voces.
              </p>
            </div>

            <div className="w-full py-3 px-4 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-bold text-xs sm:text-sm flex items-center justify-between">
              <span>Abrir Teclado / Piano</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>

          {/* Botón Gigante 3: Metrónomo Profesional */}
          <button
            type="button"
            onClick={() => setSelectedToolScreen('metronome')}
            className="min-h-[240px] p-6 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-emerald-500 shadow-md flex flex-col justify-between text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <Activity className="w-8 h-8" />
              </div>
              <span className="text-xs font-mono font-bold text-slate-400">
                30 a 250 BPM
              </span>
            </div>

            <div className="space-y-1.5 my-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                Metrónomo Profesional
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Control de BPM, Tap Tempo, compases (2/4, 3/4, 4/4, 6/8), acento en tiempo 1 y tempos de canciones.
              </p>
            </div>

            <div className="w-full py-3 px-4 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-bold text-xs sm:text-sm flex items-center justify-between">
              <span>Abrir Metrónomo</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PANTALLAS INDIVIDUALES DEDICADAS PARA CADA HERRAMIENTA
  // =========================================================================
  return (
    <div
      className="space-y-5 select-none"
      onMouseUp={() => {
        isMouseDownRef.current = false;
      }}
    >
      {/* Barra Superior de Navegación para Volver al Menú de Herramientas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            stopMicrophone();
            setSelectedToolScreen(null);
          }}
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Menú de Herramientas</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedToolScreen('tuner')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              selectedToolScreen === 'tuner'
                ? accent.bgClass
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Afinador
          </button>
          <button
            type="button"
            onClick={() => setSelectedToolScreen('piano')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              selectedToolScreen === 'piano'
                ? accent.bgClass
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Piano 2 Octavas
          </button>
          <button
            type="button"
            onClick={() => setSelectedToolScreen('metronome')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              selectedToolScreen === 'metronome'
                ? accent.bgClass
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Metrónomo
          </button>
        </div>
      </div>

      {/* PANTALLA PROPIA 1: AFINADOR CROMÁTICO */}
      {selectedToolScreen === 'tuner' && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${accent.bgClass}`}>
                <Gauge className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Afinador Cromático + Pitch Pipe
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Aguja de precisión (-25 a +25 cents) · Calibración A4 = {referenceA4} Hz
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => (isMicListening ? stopMicrophone() : startMicrophone())}
              className={`min-h-[52px] px-6 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all ${
                isMicListening
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : accent.bgClass
              }`}
            >
              {isMicListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  Detener Micrófono
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Activar Micrófono Ahora
                </>
              )}
            </button>
          </div>

          {micError && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs sm:text-sm text-amber-700 dark:text-amber-300">
              {micError}
            </div>
          )}

          <div className="p-6 sm:p-8 rounded-3xl bg-slate-950 text-white border border-slate-800 flex flex-col items-center">
            <div className="w-full max-w-md flex items-center justify-between text-xs font-mono text-slate-400 px-2 mb-2">
              <span>-25c</span>
              <span>-15c</span>
              <span className="text-emerald-400 font-bold">0 CENTS</span>
              <span>+15c</span>
              <span>+25c</span>
            </div>

            <div className="relative w-72 sm:w-80 h-36 flex items-end justify-center overflow-hidden">
              <svg viewBox="0 0 220 110" className="w-full h-full">
                <path
                  d="M 20 100 A 90 90 0 0 1 200 100"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M 94 12 A 90 90 0 0 1 126 12"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <g transform={`translate(110, 100) rotate(${needleAngleDeg})`}>
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="-82"
                    stroke={pitchData.isInTune ? '#10B981' : '#F59E0B'}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="0"
                    cy="0"
                    r="8"
                    fill={pitchData.isInTune ? '#10B981' : '#F59E0B'}
                  />
                </g>
              </svg>
            </div>

            <div className="text-center mt-3 space-y-1">
              <div className="flex items-baseline justify-center gap-2">
                <span
                  className={`text-5xl sm:text-6xl font-bold font-mono tracking-tight ${
                    pitchData.isInTune ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {pitchData.noteName}
                  <sub className="text-2xl">{pitchData.octave}</sub>
                </span>
                <span className="text-xl font-semibold text-slate-400">
                  ({pitchData.solfegeName}
                  {pitchData.octave})
                </span>
              </div>

              <div className="flex items-center justify-center gap-3 text-sm font-mono tabular-nums text-slate-300">
                <span>{pitchData.frequency.toFixed(1)} Hz</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    pitchData.isInTune ? 'text-emerald-400 font-bold' : 'text-amber-400'
                  }
                >
                  {pitchData.cents > 0 ? `+${pitchData.cents}` : pitchData.cents} cents
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-500" />
                Generador de Tono de Referencia (Pitch Pipe):
              </span>
              <div className="flex items-center gap-2 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setReferenceA4((r) => Math.max(432, r - 1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800"
                >
                  -
                </button>
                <span>A4={referenceA4}Hz</span>
                <button
                  type="button"
                  onClick={() => setReferenceA4((r) => Math.min(446, r + 1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {PITCH_PIPE_NOTES.map((item) => {
                const isPlayingThis = activePitchPipeFreq === item.freq;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => togglePitchPipeTone(item.freq)}
                    className={`min-h-[48px] py-2.5 px-3 rounded-2xl font-mono text-xs font-bold border transition-all ${
                      isPlayingThis
                        ? `${accent.bgClass} border-transparent shadow-sm`
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PANTALLA PROPIA 2: TECLADO / PIANO INTERACTIVO DE 2 OCTAVAS (24 TECLAS C3–B4) */}
      {selectedToolScreen === 'piano' && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
                <Piano className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Teclado / Piano Interactivo (2 Octavas: C3 a B4)
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  24 teclas táctiles con etiquetas de nota y sonido sintetizado en tiempo real
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'piano', label: 'Grand Piano' },
                { id: 'worshipPad', label: 'Worship Pad' },
                { id: 'electricRhodes', label: 'Rhodes' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPianoTimbre(t.id as PianoTimbre)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                    pianoTimbre === t.id
                      ? accent.bgClass
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSustainEnabled(!sustainEnabled)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                Sustain: {sustainEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => setShowSolfegeLabels(!showSolfegeLabels)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                {showSolfegeLabels ? 'C3 / Do3' : 'Solo C3'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-3.5 rounded-2xl bg-slate-950 text-white border border-slate-800 font-mono text-xs sm:text-sm">
            <span>
              NOTA ACTIVA:{' '}
              <strong className="text-amber-400">
                {lastPlayedKeyInfo.fullNote} ({lastPlayedKeyInfo.solfege}
                {lastPlayedKeyInfo.octave})
              </strong>
            </span>
            <span className="tabular-nums text-slate-400">
              {lastPlayedKeyInfo.freq} Hz · 24 TECLAS
            </span>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="relative min-w-[720px] h-64 bg-slate-950 p-3.5 rounded-3xl border border-slate-800 select-none">
              <div className="relative w-full h-full flex">
                {whiteKeys.map((wk) => {
                  const isActive = activeKeyNote === wk.fullNote;
                  const sharpNoteName = `${wk.note}#${wk.octave}`;
                  const sharpKeyObj = TWO_OCTAVE_KEYS.find(
                    (k) => k.fullNote === sharpNoteName
                  );
                  const isSharpActive = activeKeyNote === sharpNoteName;

                  return (
                    <div key={wk.fullNote} className="relative flex-1 h-full px-[1.5px]">
                      <button
                        type="button"
                        onMouseDown={() => {
                          isMouseDownRef.current = true;
                          triggerPianoKey(wk);
                        }}
                        onMouseEnter={() => {
                          if (isMouseDownRef.current) triggerPianoKey(wk);
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          triggerPianoKey(wk);
                        }}
                        className={`w-full h-full rounded-b-2xl border border-slate-300 flex flex-col items-center justify-end pb-3 transition-transform ${
                          isActive
                            ? 'bg-amber-100 scale-[0.99] border-amber-500'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {wk.fullNote}
                        </span>
                        {showSolfegeLabels && (
                          <span className="text-[10px] font-medium text-slate-500">
                            {wk.solfege}
                            {wk.octave}
                          </span>
                        )}
                      </button>

                      {sharpKeyObj && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            isMouseDownRef.current = true;
                            triggerPianoKey(sharpKeyObj);
                          }}
                          onMouseEnter={(e) => {
                            e.stopPropagation();
                            if (isMouseDownRef.current) triggerPianoKey(sharpKeyObj);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            triggerPianoKey(sharpKeyObj);
                          }}
                          className={`absolute top-0 -right-[32%] z-20 w-[64%] h-[60%] rounded-b-xl border border-slate-950 flex flex-col items-center justify-end pb-2.5 shadow-lg transition-transform ${
                            isSharpActive
                              ? 'bg-amber-500 text-slate-950 scale-[0.98]'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-200'
                          }`}
                        >
                          <span className="font-mono text-[10px] font-bold leading-none">
                            {sharpKeyObj.fullNote}
                          </span>
                          {showSolfegeLabels && (
                            <span className="text-[9px] opacity-75 mt-0.5">
                              {sharpKeyObj.solfege}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PANTALLA PROPIA 3: METRÓNOMO PROFESIONAL */}
      {selectedToolScreen === 'metronome' && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Metrónomo Profesional (30 a 250 BPM)
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Tap Tempo, selección de compás y acento en el primer tiempo
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTapTempo}
              className="min-h-[52px] px-6 py-3 rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-bold active:scale-95 transition-all"
            >
              TOCAR TAP TEMPO
            </button>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-slate-950 text-white border border-slate-800 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  VELOCIDAD ACTUAL
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl sm:text-6xl font-bold font-mono tabular-nums text-white">
                    {bpm}
                  </span>
                  <span className="text-base font-mono text-amber-400 font-bold">
                    BPM · Compás {timeSignature}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMetronomePlaying(!isMetronomePlaying)}
                className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform active:scale-95 shadow-lg ${
                  isMetronomePlaying
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                {isMetronomePlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-6 gap-2.5">
              {Array.from({ length: beatsPerMeasure }).map((_, idx) => {
                const beatNum = idx + 1;
                const isActiveBeat = isMetronomePlaying && currentBeat === beatNum;
                const isAccentBeat =
                  beatNum === 1 || (timeSignature === '6/8' && beatNum === 4);
                return (
                  <div
                    key={beatNum}
                    className={`h-12 rounded-2xl font-mono text-sm font-bold flex items-center justify-center border transition-all ${
                      isActiveBeat
                        ? isAccentBeat
                          ? 'bg-amber-500 border-amber-300 text-slate-950 scale-105'
                          : 'bg-emerald-500 border-emerald-300 text-slate-950 scale-105'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    {beatNum}
                  </div>
                );
              })}
            </div>

            <div className="space-y-4">
              <input
                type="range"
                min={30}
                max={250}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBpm((b) => Math.max(30, b - 5))}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono font-bold"
                  >
                    -5 BPM
                  </button>
                  <button
                    type="button"
                    onClick={() => setBpm((b) => Math.max(30, b - 1))}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {(['2/4', '3/4', '4/4', '6/8'] as TimeSignature[]).map((sig) => (
                    <button
                      key={sig}
                      type="button"
                      onClick={() => setTimeSignature(sig)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl font-mono text-xs font-bold transition-colors ${
                        timeSignature === sig
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      {sig}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBpm((b) => Math.min(250, b + 1))}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBpm((b) => Math.min(250, b + 5))}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono font-bold"
                  >
                    +5 BPM
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Music className="w-4 h-4 text-amber-500" />
              Cargar Tempo desde una Canción del Repertorio:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {songs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setBpm(s.bpm);
                    setTimeSignature(s.timeSignature);
                  }}
                  className="min-h-[52px] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:border-amber-500 text-left flex items-center justify-between"
                >
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate pr-2">
                    {s.title}
                  </span>
                  <span className="font-mono text-xs text-amber-500 font-bold shrink-0">
                    {s.bpm} BPM
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
