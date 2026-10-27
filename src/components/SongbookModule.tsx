import React, { useEffect, useRef, useState } from 'react';
import {
  AccentColorId,
  BandMember,
  EventSongItem,
  Song,
  SongStyle,
  SongVoiceNote,
  TimeSignature,
  UserRole,
  WorshipEvent,
} from '../types';
import { getAccentClasses } from './IdentityModal';
import {
  ALL_KEYS,
  MAJOR_KEYS,
  MINOR_KEYS,
  transposeKey,
  transposeLineText,
} from '../utils/chordTransposer';
import { isChordLine } from '../utils/musicTheory';
import { compressImageToDataUrl } from '../utils/imageCompressor';
import { uploadMediaDataUrlToStorage } from '../firebase';
import {
  fetchSongImageOnDemand,
  getCachedSongImageSync,
  isValidImageString,
  songHasCloudOrInlineImage,
} from '../utils/songImageCloudStore';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudDownload,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Headphones,
  Image as ImageIcon,
  ListMusic,
  Loader2,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  User,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';

interface SongbookModuleProps {
  songs: Song[];
  events: WorshipEvent[];
  members?: BandMember[];
  activeMember: BandMember;
  accentColor: AccentColorId;
  initialSongId?: string | null;
  initialTargetKey?: string | null;
  initialEventId?: string | null;
  initialAutoStageMode?: boolean;
  onBackToGroup?: () => void;
  onAddSong: (newSong: Omit<Song, 'id'>) => void;
  onUpdateSong: (updatedSong: Song) => void;
  onDeleteSong: (songId: string) => void;
  onUpdateEventPlaylist: (
    eventId: string,
    updatedSongs: EventSongItem[]
  ) => void;
  onUpdateEvent?: (updatedEvent: WorshipEvent) => void;
  onOpenMetronomeWithSong: (bpm: number, timeSignature: TimeSignature) => void;
}

const STYLES: SongStyle[] = [
  'Adoración',
  'Alabanza',
  'Contemporáneo',
  'Himno',
  'Especial',
];

const QUICK_STRUCTURE_CHIPS = [
  'Intro',
  'Verso 1',
  'Verso 2',
  'Pre-Coro',
  'Coro',
  'Interludio',
  'Puente',
  'Solo',
  'Espontáneo',
  'Final',
];

function stripChordsFromLine(line: string): string {
  return line
    .replace(/\[([^\]]+)\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Devuelve la URL de la imagen únicamente si fue subida por el usuario
 * (descarta cualquier SVG autogenerado anterior o cadena vacía).
 */
function getValidUploadedSongImage(url?: string | null): string | undefined {
  if (!isValidImageString(url)) return undefined;
  return url!;
}

/**
 * Convierte cualquier línea que aún tenga acordes entre corchetes [G]Letra
 * al formato tradicional de acordes en la línea de arriba de la letra.
 */
function convertBracketedSheetToChordsAbove(rawText: string): string {
  if (!rawText || !rawText.includes('[')) return rawText;
  const lines = rawText.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    if (!line.includes('[')) {
      out.push(line);
      continue;
    }

    // Si es un encabezado tipo [Verso 1] o [Coro]
    const trimmed = line.trim();
    if (
      /^\[(Intro|Verso|Estrofa|Pre-?Coro|Coro|Puente|Interludio|Instrumental|Solo|Espont[aá]neo|Final|Outro|Tag)[^\]]*\]$/i.test(
        trimmed
      )
    ) {
      out.push(`${trimmed.slice(1, -1)}:`);
      continue;
    }

    // Si la línea solo tiene acordes entre corchetes y espacios (ej. "[G]   [D/F#]   [Em7]   [C]")
    const withoutBrackets = line.replace(/\[[^\]]+\]/g, '').trim();
    if (!withoutBrackets) {
      out.push(line.replace(/\[([^\]]+)\]/g, '$1'));
      continue;
    }

    // Línea mixta con acordes y letra: construir línea superior de acordes y línea inferior de letra
    let chordLine = '';
    let lyricLine = '';
    const segments = line.split(/(\[[^\]]+\])/g);

    for (const seg of segments) {
      if (seg.startsWith('[') && seg.endsWith(']')) {
        const chord = seg.slice(1, -1).trim();
        if (chord) {
          while (chordLine.length < lyricLine.length) {
            chordLine += ' ';
          }
          if (chordLine.length > 0 && !chordLine.endsWith(' ')) {
            chordLine += ' ';
          }
          chordLine += chord;
        }
      } else {
        lyricLine += seg;
      }
    }

    if (chordLine.trim()) {
      out.push(chordLine);
    }
    out.push(lyricLine);
  }

  return out.join('\n');
}

const PITCH_MAP: Record<string, number> = {
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

function getSemitoneStepsBetweenKeys(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey || fromKey === toKey) return 0;
  const rootFrom = fromKey.replace(/m$/, '');
  const rootTo = toKey.replace(/m$/, '');
  const idxFrom = PITCH_MAP[rootFrom];
  const idxTo = PITCH_MAP[rootTo];
  if (idxFrom === undefined || idxTo === undefined) {
    return 0;
  }
  const diff = ((idxTo - idxFrom) % 12 + 12) % 12;
  return diff > 6 ? diff - 12 : diff;
}

function getTodayStr(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const SongbookModule: React.FC<SongbookModuleProps> = ({
  songs,
  events,
  members = [],
  activeMember,
  accentColor,
  initialSongId,
  initialTargetKey,
  initialEventId,
  initialAutoStageMode,
  onBackToGroup,
  onAddSong,
  onUpdateSong,
  onDeleteSong,
  onUpdateEventPlaylist,
  onUpdateEvent,
  onOpenMetronomeWithSong,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string>('all');
  const [selectedKeyFilter, setSelectedKeyFilter] = useState<string>('all');
  const [selectedBpmFilter, setSelectedBpmFilter] = useState<
    'all' | 'slow' | 'medium' | 'fast'
  >('all');

  const [selectedSongId, setSelectedSongId] = useState<string | null>(
    initialSongId || null
  );
  // Por defecto la vista de una canción es compacta ("a primera vista").
  // Si el usuario presiona "Abrir Hoja Completa de Acordes y Estructura", se expande.
  const [isFullSheetExpanded, setIsFullSheetExpanded] = useState<boolean>(
    Boolean(initialSongId)
  );
  const [selectedSetlistEventId, setSelectedSetlistEventId] =
    useState<string>(initialEventId || '');

  const [semitoneOffset, setSemitoneOffset] = useState<number>(0);
  const [fontSize, setFontSize] = useState<number>(15);
  const [showLyricsOnly, setShowLyricsOnly] = useState<boolean>(false);
  const [isStageMode, setIsStageMode] = useState<boolean>(
    Boolean(initialAutoStageMode)
  );
  const [sheetViewMode, setSheetViewMode] = useState<'interactive' | 'image'>(
    'interactive'
  );

  // Auto-scroll en Modo Escenario (Atril en Vivo)
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<
    'slow' | 'bpm' | 'medium' | 'fast'
  >('bpm');
  const stageScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Metrónomo rápido en vivo dentro del Modo Escenario
  const [isStageClickPlaying, setIsStageClickPlaying] =
    useState<boolean>(false);
  const stageAudioCtxRef = useRef<AudioContext | null>(null);
  const stageClickTimerRef = useRef<number | null>(null);

  // Modales de Canciones
  const [showAddSongModal, setShowAddSongModal] = useState(false);
  const [showEditSongModal, setShowEditSongModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // Estados para edición de estructura y notas de la canción activa
  const [newSectionInput, setNewSectionInput] = useState('');
  const [groupNotesDraft, setGroupNotesDraft] = useState('');
  const [personalNotesDraft, setPersonalNotesDraft] = useState('');
  const [savedFeedbackMessage, setSavedFeedbackMessage] = useState<
    string | null
  >(null);


  // Pantalla completa y zoom de imagen adjunta + Streaming bajo demanda desde la nube + Caché IndexedDB
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [streamedImageUrl, setStreamedImageUrl] = useState<string | null>(null);
  const [isLoadingStreamedImage, setIsLoadingStreamedImage] = useState(false);
  const [streamedImageError, setStreamedImageError] = useState<string | null>(
    null
  );

  // Escáner IA de Canciones (Gemini AI)
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [aiScanFeedback, setAiScanFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [attachScannedPhotoAsSongImage, setAttachScannedPhotoAsSongImage] =
    useState(true);

  // Tap Tempo para modales de Crear/Editar canción
  const tapTimestampsRef = useRef<number[]>([]);

  // Campos para Agregar Nueva Canción al Repertorio
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newKey, setNewKey] = useState('G');
  const [newBpm, setNewBpm] = useState<string>('');
  const [newTimeSig, setNewTimeSig] = useState<TimeSignature>('4/4');
  const [newStyle, setNewStyle] = useState<SongStyle>('Adoración');
  const [newTags, setNewTags] = useState('Domingo, Adoración');
  const [newStructureList, setNewStructureList] = useState<string[]>([
    'Intro',
    'Verso 1',
    'Coro',
    'Puente',
    'Final',
  ]);
  const [newCustomSection, setNewCustomSection] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSpotifyUrl, setNewSpotifyUrl] = useState('');
  const [newChordSheetUrl, setNewChordSheetUrl] = useState<string>('');
  const [newRawLyrics, setNewRawLyrics] = useState('');

  // Campos para Editar Canción Existente
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editKey, setEditKey] = useState('G');
  const [editBpm, setEditBpm] = useState<string>('');
  const [editTimeSig, setEditTimeSig] = useState<TimeSignature>('4/4');
  const [editStyle, setEditStyle] = useState<SongStyle>('Adoración');
  const [editTags, setEditTags] = useState('');
  const [editStructureList, setEditStructureList] = useState<string[]>([]);
  const [editCustomSection, setEditCustomSection] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSpotifyUrl, setEditSpotifyUrl] = useState('');
  const [editChordSheetUrl, setEditChordSheetUrl] = useState<string>('');
  const [editHadCloudImageRemoved, setEditHadCloudImageRemoved] =
    useState<boolean>(false);
  const [editRawLyrics, setEditRawLyrics] = useState('');

  const accent = getAccentClasses(accentColor);
  const isLeader = activeMember.role === 'leader';

  useEffect(() => {
    setSelectedSetlistEventId(initialEventId || '');
    if (initialSongId) {
      const targetSong = songs.find((s) => s.id === initialSongId);
      if (targetSong) {
        setSelectedSongId(targetSong.id);
        setIsFullSheetExpanded(true);
        if (initialTargetKey) {
          setSemitoneOffset(
            getSemitoneStepsBetweenKeys(targetSong.originalKey, initialTargetKey)
          );
        } else {
          setSemitoneOffset(0);
        }
      }
    } else if (!initialAutoStageMode) {
      setSelectedSongId(null);
    }
    if (initialAutoStageMode) {
      setIsStageMode(true);
    }
  }, [initialSongId, initialTargetKey, initialEventId, initialAutoStageMode, songs]);

  const filteredSongs = songs
    .filter((song) => {
      const matchesSearch =
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (song.rawLyricsAndChords || song.lyricsAndChords || '')
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      const matchesStyle =
        selectedStyle === 'all' || song.style === selectedStyle;
      const matchesKey =
        selectedKeyFilter === 'all' || song.originalKey === selectedKeyFilter;
      const matchesBpm =
        selectedBpmFilter === 'all' ||
        (selectedBpmFilter === 'slow' && song.bpm < 75) ||
        (selectedBpmFilter === 'medium' && song.bpm >= 75 && song.bpm <= 110) ||
        (selectedBpmFilter === 'fast' && song.bpm > 110);
      return matchesSearch && matchesStyle && matchesKey && matchesBpm;
    })
    .slice()
    .sort((a, b) =>
      a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
    );

  const activeSetlistEvent = selectedSetlistEventId
    ? events.find((e) => e.id === selectedSetlistEventId) || null
    : null;

  const activeSong =
    songs.find((s) => s.id === selectedSongId) || null;

  const activeSongHasImage = songHasCloudOrInlineImage(activeSong);

  // Función para descargar bajo demanda la imagen de la canción activa (con caché IndexedDB)
  const triggerOnDemandImageLoad = async (
    targetSong: Song,
    forceRefresh = false
  ) => {
    if (!songHasCloudOrInlineImage(targetSong)) {
      setStreamedImageUrl(null);
      return;
    }

    if (!forceRefresh) {
      const syncCached =
        getCachedSongImageSync(targetSong.id) ||
        getValidUploadedSongImage(targetSong.chordSheetImageUrl);
      if (syncCached) {
        setStreamedImageUrl(syncCached);
        setStreamedImageError(null);
        return;
      }
    }

    setIsLoadingStreamedImage(true);
    setStreamedImageError(null);
    try {
      const fetched = await fetchSongImageOnDemand(targetSong);
      if (fetched) {
        setStreamedImageUrl(fetched);
      } else {
        setStreamedImageError(
          'No se encontró la imagen en la nube para esta canción.'
        );
      }
    } catch {
      setStreamedImageError(
        'Error de red al descargar la imagen. Verifica tu conexión e intenta de nuevo.'
      );
    } finally {
      setIsLoadingStreamedImage(false);
    }
  };

  // Sincronizar borradores de notas e imagen en caché al cambiar de canción activa
  useEffect(() => {
    if (!activeSong) {
      setStreamedImageUrl(null);
      setStreamedImageError(null);
      return;
    }
    setGroupNotesDraft(activeSong.notes || '');
    setPersonalNotesDraft(
      (activeSong.personalNotes && activeSong.personalNotes[activeMember.id]) ||
        ''
    );
    setSavedFeedbackMessage(null);

    const hasImg = songHasCloudOrInlineImage(activeSong);
    if (!hasImg) {
      setStreamedImageUrl(null);
      setStreamedImageError(null);
      setSheetViewMode('interactive');
      setIsImageFullscreen(false);
    } else {
      const instantCached =
        getCachedSongImageSync(activeSong.id) ||
        getValidUploadedSongImage(activeSong.chordSheetImageUrl) ||
        null;
      setStreamedImageUrl(instantCached);
      setStreamedImageError(null);
    }
  }, [
    activeSong?.id,
    activeSong?.hasChordSheetImage,
    activeSong?.chordSheetImageUrl,
    activeSong?.chordSheetImageUpdatedAt,
    activeMember.id,
  ]);

  // Cuando el usuario abre la pestaña "Imagen" o el visor en Modo Escenario, descargamos bajo demanda si aún no está en memoria
  useEffect(() => {
    if (
      activeSong &&
      songHasCloudOrInlineImage(activeSong) &&
      sheetViewMode === 'image' &&
      !streamedImageUrl &&
      !isLoadingStreamedImage
    ) {
      triggerOnDemandImageLoad(activeSong);
    }
  }, [
    activeSong?.id,
    sheetViewMode,
    streamedImageUrl,
    isLoadingStreamedImage,
  ]);

  // Auto-scroll effect in Stage Mode (con sincronización a BPM de la canción)
  useEffect(() => {
    if (!isStageMode || !isAutoScrolling) return;
    const container = stageScrollContainerRef.current;
    if (!container) return;

    const songBpm = Math.max(45, Math.min(200, activeSong?.bpm || 75));
    const bpmSyncedMs = Math.max(22, Math.min(85, Math.round(4200 / songBpm)));
    const intervalMs =
      scrollSpeed === 'slow'
        ? 75
        : scrollSpeed === 'bpm'
        ? bpmSyncedMs
        : scrollSpeed === 'medium'
        ? 45
        : 25;
    const timer = window.setInterval(() => {
      if (container) {
        container.scrollBy({ top: 1, behavior: 'auto' });
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isStageMode, isAutoScrolling, scrollSpeed, activeSong?.bpm]);

  // Metrónomo en vivo dentro de Modo Escenario
  useEffect(() => {
    if (!isStageMode || !isStageClickPlaying || !activeSong) {
      if (stageClickTimerRef.current) {
        window.clearInterval(stageClickTimerRef.current);
        stageClickTimerRef.current = null;
      }
      return;
    }

    const bpm = Math.max(40, Math.min(240, activeSong.bpm || 76));
    const intervalMs = (60 / bpm) * 1000;
    let beatCount = 0;
    const beatsPerBar = parseInt(activeSong.timeSignature.split('/')[0], 10) || 4;

    const playTick = () => {
      try {
        if (!stageAudioCtxRef.current) {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          stageAudioCtxRef.current = new AudioContextClass();
        }
        const ctx = stageAudioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const isAccent = beatCount % beatsPerBar === 0;
        osc.frequency.value = isAccent ? 1100 : 750;
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.065);
        beatCount++;
      } catch {
        // Ignore audio context restriction
      }
    };

    playTick();
    stageClickTimerRef.current = window.setInterval(playTick, intervalMs);

    return () => {
      if (stageClickTimerRef.current) {
        window.clearInterval(stageClickTimerRef.current);
        stageClickTimerRef.current = null;
      }
    };
  }, [isStageMode, isStageClickPlaying, activeSong?.id, activeSong?.bpm]);

  const currentKey = activeSong
    ? transposeKey(activeSong.originalKey, semitoneOffset)
    : 'C';

  // Lista ordenada de canciones para navegar Anterior / Siguiente
  const setlistOrderIds: { songId: string; customKey?: string }[] =
    activeSetlistEvent && activeSetlistEvent.songs.length > 0
      ? activeSetlistEvent.songs.map((item) => ({
          songId: item.songId,
          customKey: item.customKey,
        }))
      : filteredSongs.map((s) => ({ songId: s.id }));

  const currentIndexInOrder = activeSong
    ? setlistOrderIds.findIndex((item) => item.songId === activeSong.id)
    : -1;

  const handleNavigateAdjacentSong = (direction: -1 | 1) => {
    if (setlistOrderIds.length <= 1 || currentIndexInOrder === -1) return;
    const nextIdx =
      (currentIndexInOrder + direction + setlistOrderIds.length) %
      setlistOrderIds.length;
    const target = setlistOrderIds[nextIdx];
    const targetSong = songs.find((s) => s.id === target.songId);
    if (!targetSong) return;

    setSelectedSongId(targetSong.id);
    if (target.customKey) {
      setSemitoneOffset(
        getSemitoneStepsBetweenKeys(targetSong.originalKey, target.customKey)
      );
    } else {
      setSemitoneOffset(0);
    }
    if (stageScrollContainerRef.current) {
      stageScrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Atajos de teclado de accesibilidad (Escape para salir de Modo Atril o Imagen Fullscreen, Flechas ←/→ para cambiar canción en vivo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (isImageFullscreen) {
          setImageZoom(1);
          setIsImageFullscreen(false);
          return;
        }
        if (isStageMode) {
          setIsStageMode(false);
          setIsAutoScrolling(false);
          setIsStageClickPlaying(false);
          return;
        }
      }

      if (isStageMode && !isTyping) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleNavigateAdjacentSong(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNavigateAdjacentSong(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStageMode, isImageFullscreen, currentIndexInOrder, setlistOrderIds.length]);

  const handleTapTempo = (mode: 'create' | 'edit') => {
    const now = performance.now();
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2800);
    recent.push(now);
    tapTimestampsRef.current = recent;

    if (recent.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgMs =
        intervals.reduce((acc, v) => acc + v, 0) / intervals.length;
      const calculatedBpm = Math.max(
        40,
        Math.min(240, Math.round(60000 / avgMs))
      );
      if (mode === 'create') {
        setNewBpm(String(calculatedBpm));
      } else {
        setEditBpm(String(calculatedBpm));
      }
    }
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'new' | 'edit' | 'direct'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Compresión instantánea en el cliente (<100KB, 1400px máx)
      const optimizedDataUrl = await compressImageToDataUrl(file);

      if (mode === 'new') {
        setNewChordSheetUrl(optimizedDataUrl);
      } else if (mode === 'edit') {
        setEditChordSheetUrl(optimizedDataUrl);
        setEditHadCloudImageRemoved(false);
      } else if (mode === 'direct' && activeSong) {
        setStreamedImageUrl(optimizedDataUrl);
        onUpdateSong({
          ...activeSong,
          hasChordSheetImage: true,
          chordSheetImageUpdatedAt: Date.now(),
          chordSheetImageUrl: optimizedDataUrl,
        });
        setSheetViewMode('image');
        showTempSavedNotice(
          'Imagen sincronizada en la nube (colección bajo demanda + caché local)'
        );
      }

      // 2. Intento opcional de Storage si está habilitado
      uploadMediaDataUrlToStorage(
        'song_sheets',
        `song_${Date.now()}.jpg`,
        optimizedDataUrl
      )
        .then((cloudUrl) => {
          if (cloudUrl && cloudUrl.startsWith('http')) {
            if (mode === 'new') setNewChordSheetUrl(cloudUrl);
            else if (mode === 'edit') setEditChordSheetUrl(cloudUrl);
            else if (mode === 'direct' && activeSong) {
              setStreamedImageUrl(cloudUrl);
              onUpdateSong({
                ...activeSong,
                hasChordSheetImage: true,
                chordSheetImageUpdatedAt: Date.now(),
                chordSheetImageUrl: cloudUrl,
              });
            }
          }
        })
        .catch(() => {
          // Si Storage no está disponible, se guarda en el documento dedicado songimg__{songId}
        });
    } catch (err) {
      console.error('Error al procesar la imagen:', err);
      showTempSavedNotice('No se pudo procesar la imagen seleccionada');
    }
  };

  /**
   * Escáner IA de Canciones (Gemini AI):
   * Analiza una foto/captura de hoja de acordes o texto pegado y rellena automáticamente
   * Título, Artista, Tono, BPM, Compás, Estilo, Estructura y Letra con Acordes arriba.
   */
  const runAISongScan = async (
    mode: 'new' | 'edit',
    options: { imageDataUrl?: string; rawTextHint?: string }
  ) => {
    if (!options.imageDataUrl && !options.rawTextHint?.trim()) {
      setAiScanFeedback({
        type: 'error',
        message:
          'Selecciona una foto de la hoja de acordes o escribe/pega la letra antes de escanear.',
      });
      return;
    }

    setIsScanningAI(true);
    setAiScanFeedback(null);

    try {
      const response = await fetch('/api/ai/scan-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: options.imageDataUrl,
          rawTextHint: options.rawTextHint,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.song) {
        throw new Error(
          payload?.error || 'No se pudo analizar la canción con el Escáner IA.'
        );
      }

      const scanned = payload.song;
      const detectedTitle = (scanned.title || '').trim();
      const detectedArtist = (scanned.artist || '').trim();
      const detectedKey = ALL_KEYS.includes(scanned.originalKey)
        ? scanned.originalKey
        : 'G';
      const detectedBpm =
        typeof scanned.bpm === 'number' && scanned.bpm >= 40 && scanned.bpm <= 240
          ? String(Math.round(scanned.bpm))
          : '75';
      const validTimeSigs: TimeSignature[] = ['4/4', '3/4', '6/8', '2/4'];
      const detectedTimeSig: TimeSignature = validTimeSigs.includes(
        scanned.timeSignature
      )
        ? scanned.timeSignature
        : '4/4';
      const detectedStyle: SongStyle = STYLES.includes(scanned.style)
        ? scanned.style
        : 'Adoración';
      const detectedStructure: string[] =
        Array.isArray(scanned.structure) && scanned.structure.length > 0
          ? scanned.structure.filter((s: unknown) => typeof s === 'string' && s.trim())
          : ['Intro', 'Verso 1', 'Coro', 'Puente', 'Final'];
      const detectedLyrics = convertBracketedSheetToChordsAbove(
        scanned.lyricsAndChords || ''
      );
      const detectedNotes = (scanned.notes || '').trim();

      if (mode === 'new') {
        if (detectedTitle) setNewTitle(detectedTitle);
        if (detectedArtist) setNewArtist(detectedArtist);
        setNewKey(detectedKey);
        setNewBpm(detectedBpm);
        setNewTimeSig(detectedTimeSig);
        setNewStyle(detectedStyle);
        setNewStructureList(detectedStructure);
        if (detectedLyrics) setNewRawLyrics(detectedLyrics);
        if (detectedNotes && !newNotes.trim()) setNewNotes(detectedNotes);
        if (options.imageDataUrl && attachScannedPhotoAsSongImage) {
          setNewChordSheetUrl(options.imageDataUrl);
        }
      } else {
        if (detectedTitle) setEditTitle(detectedTitle);
        if (detectedArtist) setEditArtist(detectedArtist);
        setEditKey(detectedKey);
        setEditBpm(detectedBpm);
        setEditTimeSig(detectedTimeSig);
        setEditStyle(detectedStyle);
        setEditStructureList(detectedStructure);
        if (detectedLyrics) setEditRawLyrics(detectedLyrics);
        if (detectedNotes && !editNotes.trim()) setEditNotes(detectedNotes);
        if (options.imageDataUrl && attachScannedPhotoAsSongImage) {
          setEditChordSheetUrl(options.imageDataUrl);
          setEditHadCloudImageRemoved(false);
        }
      }

      setAiScanFeedback({
        type: 'success',
        message: `¡Escaneo IA completado! Se detectó «${
          detectedTitle || 'Canción'
        }» en Tono ${detectedKey} · ${detectedBpm} BPM (${detectedTimeSig}) con ${
          detectedStructure.length
        } secciones.`,
      });
    } catch (err) {
      setAiScanFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Error al conectar con el Escáner IA.',
      });
    } finally {
      setIsScanningAI(false);
    }
  };

  const handleScanPhotoFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'new' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedDataUrl = await compressImageToDataUrl(file);
      await runAISongScan(mode, {
        imageDataUrl: optimizedDataUrl,
        rawTextHint: mode === 'new' ? newRawLyrics : editRawLyrics,
      });
    } catch {
      setAiScanFeedback({
        type: 'error',
        message: 'No se pudo leer la imagen para el Escáner IA.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const showTempSavedNotice = (msg: string) => {
    setSavedFeedbackMessage(msg);
    window.setTimeout(() => {
      setSavedFeedbackMessage(null);
    }, 3000);
  };

  const handleSaveGroupNotes = () => {
    if (!activeSong) return;
    onUpdateSong({
      ...activeSong,
      notes: groupNotesDraft.trim(),
    });
    showTempSavedNotice('Notas grupales guardadas para toda la banda');
  };

  const handleSavePersonalNotes = () => {
    if (!activeSong) return;
    const nextPersonal = {
      ...(activeSong.personalNotes || {}),
      [activeMember.id]: personalNotesDraft.trim(),
    };
    onUpdateSong({
      ...activeSong,
      personalNotes: nextPersonal,
    });
    showTempSavedNotice('Tus notas personales se guardaron');
  };

  const handleAddStructureSection = (labelToAdd?: string) => {
    if (!activeSong) return;
    const clean = (labelToAdd ?? newSectionInput).trim();
    if (!clean) return;
    onUpdateSong({
      ...activeSong,
      structure: [...(activeSong.structure || []), clean],
    });
    if (!labelToAdd) setNewSectionInput('');
  };

  const handleRemoveStructureSection = (indexToRemove: number) => {
    if (!activeSong) return;
    onUpdateSong({
      ...activeSong,
      structure: (activeSong.structure || []).filter((_, idx) => idx !== indexToRemove),
    });
  };

  const handleCreateSongSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const structureArr =
      newStructureList.length > 0
        ? newStructureList
        : ['Intro', 'Verso 1', 'Coro'];
    const tagsArr = newTags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedBpm = parseInt(newBpm, 10) || 75;
    const cleanSheet = convertBracketedSheetToChordsAbove(newRawLyrics);
    const uploadedImage = getValidUploadedSongImage(newChordSheetUrl);

    onAddSong({
      title: newTitle.trim(),
      artist: newArtist.trim() || 'Ministerio Local',
      originalKey: newKey,
      bpm: parsedBpm,
      timeSignature: newTimeSig,
      style: newStyle,
      characteristics: tagsArr.length > 0 ? tagsArr : [newStyle],
      tags: tagsArr.length > 0 ? tagsArr : [newStyle],
      structure: structureArr,
      notes: newNotes.trim(),
      personalNotes: {},
      lyricsAndChords: cleanSheet,
      rawLyricsAndChords: cleanSheet,
      hasChordSheetImage: Boolean(uploadedImage),
      chordSheetImageUpdatedAt: uploadedImage ? Date.now() : undefined,
      chordSheetImageUrl: uploadedImage,
      spotifyUrl: newSpotifyUrl.trim() || undefined,
      referenceDuration: '3:45',
      chordProgPreview: [],
      voiceNotes: [],
      addedByUserId: activeMember.id,
      addedByName: activeMember.name,
      addedByRole: (activeMember.role as UserRole) || 'member',
      addedAt: new Date().toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    });

    setNewTitle('');
    setNewArtist('');
    setNewBpm('');
    setNewNotes('');
    setNewSpotifyUrl('');
    setNewChordSheetUrl('');
    setNewRawLyrics('');
    setAiScanFeedback(null);
    setNewStructureList(['Intro', 'Verso 1', 'Coro', 'Puente', 'Final']);
    setShowAddSongModal(false);
  };

  const openEditModalForActiveSong = () => {
    if (!activeSong) return;
    setEditTitle(activeSong.title);
    setEditArtist(activeSong.artist);
    setEditKey(activeSong.originalKey);
    setEditBpm(activeSong.bpm ? String(activeSong.bpm) : '');
    setEditTimeSig(activeSong.timeSignature);
    setEditStyle(activeSong.style);
    setEditTags((activeSong.tags || activeSong.characteristics || []).join(', '));
    setEditStructureList(
      activeSong.structure && activeSong.structure.length > 0
        ? [...activeSong.structure]
        : ['Intro', 'Verso 1', 'Coro']
    );
    setEditNotes(activeSong.notes || '');
    setEditSpotifyUrl(activeSong.spotifyUrl || '');
    setEditHadCloudImageRemoved(false);
    setAiScanFeedback(null);

    const existingImg =
      streamedImageUrl ||
      getCachedSongImageSync(activeSong.id) ||
      getValidUploadedSongImage(activeSong.chordSheetImageUrl) ||
      '';
    setEditChordSheetUrl(existingImg);

    if (songHasCloudOrInlineImage(activeSong) && !existingImg) {
      fetchSongImageOnDemand(activeSong).then((cloudImg) => {
        if (cloudImg) {
          setStreamedImageUrl(cloudImg);
          setEditChordSheetUrl(cloudImg);
        }
      });
    }

    setEditRawLyrics(
      convertBracketedSheetToChordsAbove(
        activeSong.rawLyricsAndChords || activeSong.lyricsAndChords || ''
      )
    );
    setShowEditSongModal(true);
  };

  const handleEditSongSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSong || !editTitle.trim()) return;

    const structureArr =
      editStructureList.length > 0
        ? editStructureList
        : ['Intro', 'Verso 1', 'Coro'];
    const tagsArr = editTags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedBpm = parseInt(editBpm, 10) || 75;
    const cleanSheet = convertBracketedSheetToChordsAbove(editRawLyrics);
    const uploadedImg = getValidUploadedSongImage(editChordSheetUrl);
    const keepCloudFlag =
      !editHadCloudImageRemoved &&
      (Boolean(uploadedImg) || Boolean(activeSong.hasChordSheetImage));

    if (uploadedImg) {
      setStreamedImageUrl(uploadedImg);
    } else if (editHadCloudImageRemoved) {
      setStreamedImageUrl(null);
      setSheetViewMode('interactive');
    }

    onUpdateSong({
      ...activeSong,
      title: editTitle.trim(),
      artist: editArtist.trim() || 'Ministerio Local',
      originalKey: editKey,
      bpm: parsedBpm,
      timeSignature: editTimeSig,
      style: editStyle,
      characteristics: tagsArr.length > 0 ? tagsArr : [editStyle],
      tags: tagsArr.length > 0 ? tagsArr : [editStyle],
      structure: structureArr,
      notes: editNotes.trim(),
      spotifyUrl: editSpotifyUrl.trim() || undefined,
      lyricsAndChords: cleanSheet,
      rawLyricsAndChords: cleanSheet,
      hasChordSheetImage: keepCloudFlag,
      chordSheetImageUpdatedAt: uploadedImg
        ? Date.now()
        : keepCloudFlag
        ? activeSong.chordSheetImageUpdatedAt
        : undefined,
      chordSheetImageUrl: uploadedImg,
    });

    setSemitoneOffset(0);
    setShowEditSongModal(false);
  };

  const handleConfirmDeleteActiveSong = () => {
    if (!activeSong) return;
    const idToRemove = activeSong.id;
    const remaining = songs.filter((s) => s.id !== idToRemove);
    setSelectedSongId(remaining[0]?.id || null);
    setShowDeleteConfirmModal(false);
    onDeleteSong(idToRemove);
  };

  const renderSongLines = (rawText: string) => {
    const normalizedSheet = convertBracketedSheetToChordsAbove(rawText || '');
    const lines = normalizedSheet.split('\n');

    return lines.map((line, index) => {
      const trimmed = line.trim();
      const isSectionHeader =
        trimmed.endsWith(':') && trimmed.length < 36 && !isChordLine(line);

      if (isSectionHeader) {
        return (
          <div
            key={index}
            className={`mt-5 mb-1.5 font-sans text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg inline-block ${accent.softBgClass}`}
          >
            {trimmed.replace(/:$/, '')}
          </div>
        );
      }

      const lineIsChords = isChordLine(line);

      if (showLyricsOnly) {
        if (lineIsChords) {
          return null;
        }
        const cleanLyric = stripChordsFromLine(line);
        if (!cleanLyric) {
          return <div key={index} className="h-2.5" />;
        }
        return (
          <div
            key={index}
            className="leading-relaxed text-slate-900 dark:text-slate-100 my-1 font-sans font-medium"
          >
            {cleanLyric}
          </div>
        );
      }

      if (lineIsChords) {
        const transposedChords = transposeLineText(line, semitoneOffset);
        return (
          <div
            key={index}
            className="font-mono font-extrabold text-amber-700 dark:text-amber-400 whitespace-pre leading-snug mt-2.5 select-text"
          >
            {transposedChords}
          </div>
        );
      }

      if (!trimmed) {
        return <div key={index} className="h-3" />;
      }

      return (
        <div
          key={index}
          className="leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap mb-1 font-sans"
        >
          {line}
        </div>
      );
    });
  };

  // ===========================================================================
  // MODO ESCENARIO / ATRIL EN VIVO (PANTALLA COMPLETA CON AUTO-SCROLL Y CLIC)
  // ===========================================================================
  if (isStageMode && activeSong) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col">
        {/* Cabecera del Modo Escenario */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {setlistOrderIds.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleNavigateAdjacentSong(-1)}
                  className="min-h-[42px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-xs font-bold"
                  title="Canción anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>
                <span className="px-2 py-1 rounded-lg bg-slate-800/80 font-mono text-xs text-amber-400 font-bold">
                  {currentIndexInOrder + 1}/{setlistOrderIds.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateAdjacentSong(1)}
                  className="min-h-[42px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 text-xs font-bold"
                  title="Siguiente canción"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-[10px] font-extrabold uppercase tracking-wider">
                  Modo Escenario / Atril
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {activeSong.bpm} BPM · {activeSong.timeSignature}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                {activeSong.title}{' '}
                <span className="text-amber-400 font-mono">
                  (Tono: {currentKey})
                </span>
              </h2>
            </div>
          </div>

          {/* Controles en Vivo: Auto-Scroll, Clic de Referencia, Transposición, Letra y Salir */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-scroll */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setIsAutoScrolling((prev) => !prev)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isAutoScrolling
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isAutoScrolling ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pausar Scroll</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Auto-Scroll</span>
                  </>
                )}
              </button>
              {isAutoScrolling && (
                <select
                  value={scrollSpeed}
                  onChange={(e) =>
                    setScrollSpeed(
                      e.target.value as 'slow' | 'bpm' | 'medium' | 'fast'
                    )
                  }
                  className="bg-slate-900 text-amber-400 text-xs font-bold px-2 py-1 rounded-lg border border-slate-700"
                >
                  <option value="bpm">Sync ({activeSong.bpm} BPM)</option>
                  <option value="slow">Lento</option>
                  <option value="medium">Medio</option>
                  <option value="fast">Rápido</option>
                </select>
              )}
            </div>

            {/* Clic / Pulso en vivo */}
            <button
              type="button"
              onClick={() => setIsStageClickPlaying((prev) => !prev)}
              className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                isStageClickPlaying
                  ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Escuchar clic/pulso de referencia al BPM de la canción"
            >
              <Volume2 className="w-4 h-4" />
              <span>{isStageClickPlaying ? 'Clic ON' : `${activeSong.bpm} BPM`}</span>
            </button>

            {/* Transposición rápida */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setSemitoneOffset((s) => s - 1)}
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-slate-700 flex items-center justify-center font-mono font-bold text-sm"
              >
                -1
              </button>
              <span className="px-2.5 font-mono text-sm font-extrabold text-amber-400">
                {currentKey}
              </span>
              <button
                type="button"
                onClick={() => setSemitoneOffset((s) => s + 1)}
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-slate-700 flex items-center justify-center font-mono font-bold text-sm"
              >
                +1
              </button>
            </div>

            {/* Conmutador compacto: Acordes vs Solo Letra + Imagen */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => {
                  if (sheetViewMode === 'image') {
                    setSheetViewMode('interactive');
                  } else {
                    setShowLyricsOnly((prev) => !prev);
                  }
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  sheetViewMode === 'interactive' && showLyricsOnly
                    ? 'bg-emerald-600 text-white'
                    : sheetViewMode === 'interactive'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Alternar entre Acordes + Letra y Solo Letra"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{showLyricsOnly ? 'Solo Letra' : 'Acordes + Letra'}</span>
              </button>
              {activeSongHasImage && (
                <button
                  type="button"
                  onClick={() =>
                    setSheetViewMode((m) =>
                      m === 'image' ? 'interactive' : 'image'
                    )
                  }
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    sheetViewMode === 'image'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Ver imagen de la canción (descarga bajo demanda + caché)"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Imagen</span>
                </button>
              )}
            </div>

            {/* Tamaño de letra */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setFontSize((f) => Math.max(13, f - 1))}
                className="min-h-[36px] px-2 rounded-lg hover:bg-slate-700 text-xs font-bold"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setFontSize((f) => Math.min(26, f + 1))}
                className="min-h-[36px] px-2 rounded-lg hover:bg-slate-700 text-xs font-bold"
              >
                A+
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsAutoScrolling(false);
                setIsStageClickPlaying(false);
                setIsStageMode(false);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Salir</span>
            </button>
          </div>
        </div>

        {/* Cuerpo de la Hoja en Modo Escenario */}
        <div
          ref={stageScrollContainerRef}
          className="flex-1 overflow-y-auto p-6 sm:p-10 max-w-5xl mx-auto w-full space-y-6"
        >
          {/* Estructura visible arriba */}
          <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">
              Orden:
            </span>
            {(activeSong.structure || []).map((sec, idx) => (
              <span
                key={idx}
                className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-amber-400"
              >
                {idx + 1}. {sec}
              </span>
            ))}
          </div>

          {sheetViewMode === 'image' && activeSongHasImage ? (
            <div className="rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 p-4 flex flex-col items-center justify-center min-h-[260px]">
              {isLoadingStreamedImage ? (
                <div className="flex flex-col items-center gap-2 py-12 text-slate-300">
                  <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                  <span className="text-xs font-bold">
                    Descargando imagen desde la nube...
                  </span>
                </div>
              ) : streamedImageUrl ? (
                <img
                  src={streamedImageUrl}
                  alt={activeSong.title}
                  className="max-w-full h-auto rounded-2xl"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-xs text-slate-400">
                    {streamedImageError ||
                      'Toca para cargar la imagen desde la nube.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => triggerOnDemandImageLoad(activeSong, true)}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                  >
                    <CloudDownload className="w-4 h-4" />
                    <span>Descargar Imagen</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{ fontSize: `${fontSize + 2}px` }}
              className="font-mono leading-relaxed select-text pb-24"
            >
              {renderSongLines(
                activeSong.rawLyricsAndChords ||
                  activeSong.lyricsAndChords ||
                  ''
              )}
            </div>
          )}

          {activeSong.notes && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
              <strong className="font-bold block mb-1">
                Nota de Dirección Musical:
              </strong>
              {activeSong.notes}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full max-w-full min-w-0">
      {/* BARRA SUPERIOR COMPACTA: Repertorio A-Z + Buscador + Subir Canción */}
      <div className="flex flex-col gap-2 bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs w-full max-w-full overflow-hidden">
        <div className="flex items-center justify-between gap-1.5 min-w-0 w-full">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {onBackToGroup && (
              <button
                type="button"
                onClick={onBackToGroup}
                className="h-8 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors shrink-0 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Grupo</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 px-1 min-w-0">
              <Music className={`w-3.5 h-3.5 shrink-0 ${accent.textClass}`} />
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                Repertorio ({songs.length})
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">
                A–Z
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddSongModal(true)}
            className={`h-8 px-2.5 sm:px-3 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs whitespace-nowrap shrink-0 ${accent.bgClass}`}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">Subir</span>
            <span className="hidden sm:inline">Subir Canción</span>
          </button>
        </div>

        {/* Buscador y Filtros Rápidos (Estilo, Tonalidad y Tempo/BPM) */}
        {!selectedSongId && (
          <div className="space-y-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 min-w-0 w-full">
            <div className="flex flex-col sm:flex-row gap-1.5 min-w-0 w-full">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar título, artista o letra..."
                  className="w-full h-8 pl-8 pr-7 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtros adicionales de Tono y Velocidad/BPM en una sola línea proporcionada */}
              <div className="grid grid-cols-2 sm:flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                <select
                  value={selectedKeyFilter}
                  onChange={(e) => setSelectedKeyFilter(e.target.value)}
                  className="w-full sm:w-auto min-w-0 h-8 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate"
                >
                  <option value="all">Tono: Todos</option>
                  <optgroup label="Mayores">
                    {MAJOR_KEYS.map((k) => (
                      <option key={k} value={k}>
                        Tono {k}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Menores">
                    {MINOR_KEYS.map((k) => (
                      <option key={k} value={k}>
                        Tono {k}
                      </option>
                    ))}
                  </optgroup>
                </select>

                <select
                  value={selectedBpmFilter}
                  onChange={(e) =>
                    setSelectedBpmFilter(
                      e.target.value as 'all' | 'slow' | 'medium' | 'fast'
                    )
                  }
                  className="w-full sm:w-auto min-w-0 h-8 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate"
                >
                  <option value="all">Tempo: Todos</option>
                  <option value="slow">Lento (&lt; 75 BPM)</option>
                  <option value="medium">Medio (75–110)</option>
                  <option value="fast">Rápido (&gt; 110)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 max-w-full">
              {['all', ...STYLES].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStyle(st)}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all shrink-0 ${
                    selectedStyle === st
                      ? `${accent.bgClass}`
                      : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {st === 'all' ? 'Todos' : st}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          VISTA PRINCIPAL:
          - Si NO hay canción abierta (`!selectedSongId`), mostramos la cuadrícula limpia de Canciones (A–Z).
          - Si el usuario toca una canción (`selectedSongId`), abrimos su vista enfocada con botón de "Volver".
         ===================================================================== */}
      {!selectedSongId || !activeSong ? (
        songs.length === 0 ? (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4">
            <div
              className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
            >
              <Music className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                El Repertorio de este grupo está vacío
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Tanto el Líder como los Miembros pueden subir canciones con acordes, estructura, escáner IA e imágenes en la nube para toda la banda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddSongModal(true)}
              className={`min-h-[48px] px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-md ${accent.bgClass}`}
            >
              <Plus className="w-4 h-4" />
              <span>Subir Primera Canción</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Canciones ordenadas alfabéticamente (A–Z) · Toca cualquiera para abrir cifrado y transpositor:
              </p>
              <span className="text-xs font-mono font-bold text-slate-500">
                {filteredSongs.length}{' '}
                {filteredSongs.length === 1 ? 'canción' : 'canciones'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSongs.map((song) => {
                const cleanSpotifyUrl = song.spotifyUrl?.trim();
                return (
                  <div
                    key={song.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedSongId(song.id);
                      setSemitoneOffset(0);
                      setIsFullSheetExpanded(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSongId(song.id);
                        setSemitoneOffset(0);
                        setIsFullSheetExpanded(true);
                      }
                    }}
                    className="w-full text-left p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-500/60 hover:shadow-md transition-all flex flex-col justify-between gap-2.5 group cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors truncate">
                          {song.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {song.artist}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cleanSpotifyUrl && (
                          <a
                            href={cleanSpotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Escuchar en Spotify"
                            aria-label={`Abrir ${song.title} en Spotify`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#1DB954]/15 hover:bg-[#1DB954] text-[#15883e] dark:text-[#1ed760] hover:text-slate-950 border border-[#1DB954]/30 text-[10px] font-bold transition-colors shrink-0"
                          >
                            <Headphones className="w-3 h-3 shrink-0" />
                            <span>Spotify</span>
                          </a>
                        )}
                        {songHasCloudOrInlineImage(song) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold shrink-0">
                            <ImageIcon className="w-3 h-3" />
                            <span>Imagen</span>
                          </span>
                        )}
                        <span
                          className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded-lg shrink-0 ${accent.softBgClass}`}
                        >
                          {song.originalKey}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 font-mono truncate">
                        <span>{song.bpm} BPM</span>
                        <span>·</span>
                        <span>{song.timeSignature}</span>
                        <span>·</span>
                        <span className="font-sans truncate">{song.style}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : (
        /* ===================================================================
           VISTA DETALLE DE LA CANCIÓN SELECCIONADA (CON TRANSPOSITOR DIRECTO)
           =================================================================== */
        <div className="space-y-3 w-full max-w-full min-w-0">
          {/* Barra para volver a la lista de canciones o cambiar rápido entre temas */}
          <div className="flex items-center justify-between gap-2 w-full min-w-0">
            <button
              type="button"
              onClick={() => setSelectedSongId(null)}
              className="h-8 px-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 text-[11px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 shadow-2xs shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Repertorio</span>
            </button>

            {setlistOrderIds.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleNavigateAdjacentSong(-1)}
                  className="h-8 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>
                <span className="text-[11px] font-mono font-bold text-slate-500 px-1">
                  {currentIndexInOrder + 1}/{setlistOrderIds.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateAdjacentSong(1)}
                  className="h-8 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-5 space-y-3.5 shadow-xs w-full max-w-full overflow-hidden">
            {/* Cabecera de la canción + Acciones compactas en una línea que nunca se desborda */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-3 border-b border-slate-200 dark:border-slate-800 min-w-0 w-full">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ${accent.softBgClass}`}
                  >
                    {activeSong.style}
                  </span>
                  <span>·</span>
                  <span className="font-mono font-bold">
                    Tono: {activeSong.originalKey}
                  </span>
                  <span>·</span>
                  <span className="font-mono">
                    {activeSong.bpm} BPM ({activeSong.timeSignature})
                  </span>
                </div>
                <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                  {activeSong.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {activeSong.artist}
                </p>
              </div>

              <div className="flex items-center gap-1 w-full lg:w-auto min-w-0 max-w-full">
                {activeSong.spotifyUrl?.trim() && (
                  <a
                    href={activeSong.spotifyUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-2 sm:px-2.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs flex-1 lg:flex-initial min-w-0 truncate"
                    title="Escuchar en Spotify"
                  >
                    <Headphones className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Spotify</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onOpenMetronomeWithSong(
                      activeSong.bpm,
                      activeSong.timeSignature
                    )
                  }
                  className="h-8 px-2 sm:px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 flex-1 lg:flex-initial min-w-0 truncate"
                  title={`Abrir en Metrónomo (${activeSong.bpm} BPM)`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">{activeSong.bpm} BPM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsStageMode(true)}
                  className={`h-8 px-2 sm:px-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 shadow-xs flex-1 lg:flex-initial min-w-0 truncate ${accent.bgClass}`}
                  title="Modo Atril en pantalla completa"
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Atril</span>
                </button>

                <button
                  type="button"
                  onClick={openEditModalForActiveSong}
                  className="h-8 px-2 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500 flex items-center justify-center gap-1 flex-1 lg:flex-initial min-w-0 truncate"
                  title="Editar canción"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Editar</span>
                </button>

                {isLeader && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmModal(true)}
                    className="h-8 w-8 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center shrink-0"
                    title="Eliminar canción"
                    aria-label="Eliminar canción"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* BARRA COMPACTA EN UNA SOLA LÍNEA: TONALIDAD (-1/+1), SOLO LETRA Y TAMAÑO (A-/A+) */}
            <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5 flex-nowrap w-full max-w-full overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1 shrink-0">
                <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSemitoneOffset((s) => s - 1)}
                    className="h-7 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] font-bold"
                    title="Bajar medio tono (-1)"
                  >
                    -1
                  </button>
                  <span
                    className={`px-2 py-0.5 rounded-lg font-mono text-xs font-extrabold ${accent.softBgClass}`}
                  >
                    {currentKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSemitoneOffset((s) => s + 1)}
                    className="h-7 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[11px] font-bold"
                    title="Subir medio tono (+1)"
                  >
                    +1
                  </button>
                </div>

                {semitoneOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setSemitoneOffset(0)}
                    className="h-8 px-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 shrink-0"
                    title={`Volver al tono original (${activeSong.originalKey})`}
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    <span>{activeSong.originalKey}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowLyricsOnly((prev) => !prev)}
                  className={`h-8 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-all whitespace-nowrap shrink-0 ${
                    showLyricsOnly
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                  }`}
                >
                  {showLyricsOnly ? (
                    <>
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>Acordes</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>Solo Letra</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-0.5 bg-white dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => Math.max(12, f - 1))}
                    className="h-7 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                    title="Reducir letra"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => Math.min(24, f + 1))}
                    className="h-7 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                    title="Aumentar letra"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>

            {/* ESTRUCTURA DE LA CANCIÓN */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Estructura / Orden de Secciones:
                </span>
                <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1">
                  {QUICK_STRUCTURE_CHIPS.slice(0, 6).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddStructureSection(chip)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-[10px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(activeSong.structure || []).map((sec, idx) => (
                  <span
                    key={`${sec}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    <span className="text-amber-500 font-mono">{idx + 1}.</span>
                    <span>{sec}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveStructureSection(idx)}
                      className="text-slate-400 hover:text-rose-500 ml-0.5"
                      title="Quitar sección"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* PESTAÑAS: Cifrado Interactivo vs Imagen en Nube bajo Demanda (con Caché IndexedDB) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5 w-full max-w-full">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSheetViewMode('interactive')}
                    className={`h-8 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all whitespace-nowrap ${
                      sheetViewMode === 'interactive'
                        ? `${accent.bgClass}`
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">Cifrado</span>
                    <span className="hidden sm:inline">Cifrado Interactivo</span>
                  </button>

                  {activeSongHasImage && (
                    <button
                      type="button"
                      onClick={() => {
                        setSheetViewMode('image');
                        if (!streamedImageUrl) {
                          triggerOnDemandImageLoad(activeSong);
                        }
                      }}
                      className={`h-8 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all whitespace-nowrap ${
                        sheetViewMode === 'image'
                          ? `${accent.bgClass}`
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Imagen</span>
                      <span className="hidden sm:inline">Imagen Adjunta</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {sheetViewMode === 'image' && streamedImageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageZoom(1);
                        setIsImageFullscreen(true);
                      }}
                      className="h-8 px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
                      title="Ver imagen en pantalla completa con zoom"
                    >
                      <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Ampliar</span>
                      <span className="hidden sm:inline">Pantalla Completa</span>
                    </button>
                  )}

                  {sheetViewMode === 'image' && activeSongHasImage && (
                    <button
                      type="button"
                      onClick={() => triggerOnDemandImageLoad(activeSong, true)}
                      className="h-8 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1"
                      title="Volver a sincronizar imagen desde la nube"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isLoadingStreamedImage ? 'animate-spin' : ''
                        }`}
                      />
                      <span className="hidden sm:inline">Sincronizar</span>
                    </button>
                  )}

                  <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      {activeSongHasImage
                        ? 'Cambiar Imagen'
                        : '+ Adjuntar Imagen'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'direct')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {sheetViewMode === 'image' && activeSongHasImage ? (
                <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 flex flex-col items-center justify-center min-h-[260px] group">
                  {isLoadingStreamedImage ? (
                    <div className="flex flex-col items-center gap-2.5 py-12 text-slate-300">
                      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                      <p className="text-xs font-bold">
                        Descargando imagen en streaming desde la nube...
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Se guardará automáticamente en la caché de este dispositivo.
                      </p>
                    </div>
                  ) : streamedImageUrl ? (
                    <img
                      src={streamedImageUrl}
                      alt={activeSong.title}
                      onClick={() => {
                        setImageZoom(1);
                        setIsImageFullscreen(true);
                      }}
                      className="max-w-full h-auto max-h-[70vh] rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                      title="Toca para ver en pantalla completa"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-10 text-center max-w-md">
                      <CloudDownload className="w-8 h-8 text-amber-400" />
                      <p className="text-xs font-semibold text-slate-300">
                        {streamedImageError ||
                          'La imagen está almacenada en la nube lista para descargarse bajo demanda.'}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          triggerOnDemandImageLoad(activeSong, true)
                        }
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                      >
                        <CloudDownload className="w-4 h-4" />
                        <span>Descargar Imagen Ahora</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{ fontSize: `${fontSize}px` }}
                  className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 font-mono overflow-x-auto shadow-2xs"
                >
                  {renderSongLines(
                    activeSong.rawLyricsAndChords ||
                      activeSong.lyricsAndChords ||
                      ''
                  )}
                </div>
              )}
            </div>


            {/* NOTAS GRUPALES Y PERSONALES DE LA CANCIÓN */}
            {savedFeedbackMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{savedFeedbackMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Notas Grupales de la Canción
                  </span>
                  <span className="text-[10px] font-bold text-amber-500">
                    Visible para todos
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={groupNotesDraft}
                  onChange={(e) => setGroupNotesDraft(e.target.value)}
                  onBlur={() => {
                    if (
                      activeSong &&
                      groupNotesDraft.trim() !== (activeSong.notes || '').trim()
                    ) {
                      handleSaveGroupNotes();
                    }
                  }}
                  placeholder="Indicaciones de cortes, intensidad, entradas..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveGroupNotes}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold ${accent.bgClass}`}
                  >
                    Guardar Nota Grupal
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Mis Apuntes Personales ({activeMember.name.split(' ')[0]})
                  </span>
                  <span className="text-[10px] font-bold text-emerald-500">
                    Solo para ti
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={personalNotesDraft}
                  onChange={(e) => setPersonalNotesDraft(e.target.value)}
                  onBlur={() => {
                    const currentPersonal =
                      (activeSong?.personalNotes &&
                        activeSong.personalNotes[activeMember.id]) ||
                      '';
                    if (
                      activeSong &&
                      personalNotesDraft.trim() !== currentPersonal.trim()
                    ) {
                      handleSavePersonalNotes();
                    }
                  }}
                  placeholder="Tus efectos, presets, capo o recordatorios..."
                  className="w-full p-2.5 rounded-xl border border-emerald-500/30 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePersonalNotes}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                  >
                    Guardar Mi Apunte
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: SUBIR NUEVA CANCIÓN AL REPERTORIO (CON TAP TEMPO)
         ===================================================================== */}
      {showAddSongModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Subir Canción al Repertorio del Grupo
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAiScanFeedback(null);
                  setShowAddSongModal(false);
                }}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BANNER: ESCÁNER IA DE CANCIONES (FOTO DE HOJA O TEXTO) */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-emerald-500/10 border border-amber-500/30 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    <span>Escáner IA de Canciones</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Sube una foto/captura de tu hoja de acordes o pega texto sin formato y la IA detectará título, tono, BPM, estructura y acordes interactivos.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`cursor-pointer min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all ${
                      isScanningAI
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 pointer-events-none'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    {isScanningAI ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Escaneando con IA...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        <span>Escanear Foto / Hoja</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isScanningAI}
                      onChange={(e) => handleScanPhotoFile(e, 'new')}
                      className="hidden"
                    />
                  </label>

                  {newRawLyrics.trim().length > 10 && (
                    <button
                      type="button"
                      disabled={isScanningAI}
                      onClick={() =>
                        runAISongScan('new', { rawTextHint: newRawLyrics })
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/40 hover:border-amber-500 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                      <span>Auto-Formatear Texto con IA</span>
                    </button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={attachScannedPhotoAsSongImage}
                  onChange={(e) =>
                    setAttachScannedPhotoAsSongImage(e.target.checked)
                  }
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  Adjuntar también la foto escaneada como imagen de respaldo en la nube
                </span>
              </label>

              {aiScanFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 ${
                    aiScanFeedback.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300'
                  }`}
                >
                  <span>{aiScanFeedback.message}</span>
                  <button
                    type="button"
                    onClick={() => setAiScanFeedback(null)}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleCreateSongSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título de la Canción *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ej. Way Maker / Aquí Estás"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Artista / Autor
                  </label>
                  <input
                    type="text"
                    value={newArtist}
                    onChange={(e) => setNewArtist(e.target.value)}
                    placeholder="Ej. Miel San Marcos, Marcos Witt..."
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tono Original
                  </label>
                  <select
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <optgroup label="Mayores">
                      {MAJOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k} Mayor
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Menores">
                      {MINOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    BPM + Tap
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej. 120"
                      value={newBpm}
                      onChange={(e) =>
                        setNewBpm(
                          e.target.value
                            .replace(/[^0-9]/g, '')
                            .replace(/^0+/, '')
                        )
                      }
                      className="w-full min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleTapTempo('create')}
                      className="min-h-[42px] px-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px] font-extrabold shrink-0"
                      title="Toca varias veces al ritmo de la canción para calcular el BPM"
                    >
                      TAP
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Compás
                  </label>
                  <select
                    value={newTimeSig}
                    onChange={(e) =>
                      setNewTimeSig(e.target.value as TimeSignature)
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="6/8">6/8</option>
                    <option value="2/4">2/4</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Estilo
                  </label>
                  <select
                    value={newStyle}
                    onChange={(e) => setNewStyle(e.target.value as SongStyle)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    {STYLES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ESTRUCTURA CON BOTONES DE CADA SECCIÓN */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estructura de la Canción (toca los botones para armar el orden)
                  </label>
                  {newStructureList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setNewStructureList([])}
                      className="text-[11px] font-bold text-rose-500 hover:underline"
                    >
                      Limpiar estructura
                    </button>
                  )}
                </div>

                <div className="flex items-center sm:flex-wrap gap-1.5 overflow-x-auto pb-1">
                  {QUICK_STRUCTURE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setNewStructureList((prev) => [...prev, chip])
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-amber-500/15 border border-slate-200 dark:border-slate-700 hover:border-amber-500/40 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCustomSection}
                    onChange={(e) => setNewCustomSection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = newCustomSection.trim();
                        if (clean) {
                          setNewStructureList((prev) => [...prev, clean]);
                          setNewCustomSection('');
                        }
                      }
                    }}
                    placeholder="Otra sección personalizada (ej. Tag, Corte)..."
                    className="flex-1 min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newCustomSection.trim();
                      if (clean) {
                        setNewStructureList((prev) => [...prev, clean]);
                        setNewCustomSection('');
                      }
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    + Añadir
                  </button>
                </div>

                {newStructureList.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {newStructureList.map((sec, idx) => (
                      <span
                        key={`${sec}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-slate-900 dark:text-amber-300"
                      >
                        <span className="font-mono text-amber-600 dark:text-amber-400">
                          {idx + 1}.
                        </span>
                        <span>{sec}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewStructureList((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-slate-400 hover:text-rose-500 ml-0.5"
                          title="Quitar sección"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Toca los botones de arriba (+ Intro, + Verso 1, + Coro...) para definir el orden de la canción.
                  </p>
                )}
              </div>

              {/* IMAGEN DE LA CANCIÓN (SUBIR CANCIÓN) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Imagen de la Canción (Opcional)
                  </label>
                  {newChordSheetUrl && (
                    <button
                      type="button"
                      onClick={() => setNewChordSheetUrl('')}
                      className="text-[11px] font-bold text-rose-500 hover:underline"
                    >
                      Quitar imagen
                    </button>
                  )}
                </div>

                {newChordSheetUrl ? (
                  <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-3">
                    <img
                      src={newChordSheetUrl}
                      alt="Vista previa"
                      className="w-14 h-14 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        Imagen cargada
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Optimizada y lista para guardar
                      </p>
                    </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isScanningAI}
                          onClick={() =>
                            runAISongScan('new', {
                              imageDataUrl: newChordSheetUrl,
                              rawTextHint: newRawLyrics,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1 transition-colors"
                          title="Extraer acordes y letra de esta imagen con IA"
                        >
                          {isScanningAI ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>Extraer con IA</span>
                        </button>
                        <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors">
                          <span>Cambiar</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(e, 'new')}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                ) : (
                  <label className="cursor-pointer w-full min-h-[46px] px-4 py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-400 bg-slate-50 dark:bg-slate-800/40 hover:bg-amber-500/5 flex items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all">
                    <ImageIcon className="w-4 h-4 text-amber-500" />
                    <span>+ Agregar Imagen</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'new')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Enlace de Spotify (Opcional)
                </label>
                <input
                  type="url"
                  value={newSpotifyUrl}
                  onChange={(e) => setNewSpotifyUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/..."
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Letra y Acordes (escribe los acordes en la línea de arriba de la letra)
                </label>
                <textarea
                  rows={8}
                  value={newRawLyrics}
                  onChange={(e) => setNewRawLyrics(e.target.value)}
                  placeholder={`Escribe o pega aquí la letra con los acordes arriba de cada línea.\nEjemplo:\n\nG          D/F#       Em7        C\nTu fidelidad es grande, Dios`}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs sm:text-sm text-slate-900 dark:text-white leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddSongModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[42px] px-6 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Guardar en el Repertorio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: EDITAR CANCIÓN EXISTENTE
         ===================================================================== */}
      {showEditSongModal && activeSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Editar Canción: {activeSong.title}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAiScanFeedback(null);
                  setShowEditSongModal(false);
                }}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BANNER: ESCÁNER IA EN EDICIÓN */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-emerald-500/10 border border-amber-500/30 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-4 h-4" />
                  <span>Escáner IA:</span>
                  <span className="font-normal text-slate-600 dark:text-slate-300">
                    Extrae letra, acordes y estructura desde una foto o formatea el texto.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <label
                    className={`cursor-pointer min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      isScanningAI
                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 pointer-events-none'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    {isScanningAI ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Escaneando...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>Escanear Foto con IA</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isScanningAI}
                      onChange={(e) => handleScanPhotoFile(e, 'edit')}
                      className="hidden"
                    />
                  </label>

                  {editRawLyrics.trim().length > 10 && (
                    <button
                      type="button"
                      disabled={isScanningAI}
                      onClick={() =>
                        runAISongScan('edit', { rawTextHint: editRawLyrics })
                      }
                      className="min-h-[34px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/40 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                      <span>Formatear Texto con IA</span>
                    </button>
                  )}
                </div>
              </div>

              {aiScanFeedback && (
                <div
                  className={`p-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 ${
                    aiScanFeedback.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300'
                  }`}
                >
                  <span>{aiScanFeedback.message}</span>
                  <button
                    type="button"
                    onClick={() => setAiScanFeedback(null)}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleEditSongSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título *
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Artista / Autor
                  </label>
                  <input
                    type="text"
                    value={editArtist}
                    onChange={(e) => setEditArtist(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tono Base
                  </label>
                  <select
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <optgroup label="Mayores">
                      {MAJOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k} Mayor
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Menores">
                      {MINOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    BPM + Tap
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej. 120"
                      value={editBpm}
                      onChange={(e) =>
                        setEditBpm(
                          e.target.value
                            .replace(/[^0-9]/g, '')
                            .replace(/^0+/, '')
                        )
                      }
                      className="w-full min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleTapTempo('edit')}
                      className="min-h-[42px] px-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-extrabold shrink-0"
                    >
                      TAP
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Compás
                  </label>
                  <select
                    value={editTimeSig}
                    onChange={(e) =>
                      setEditTimeSig(e.target.value as TimeSignature)
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="6/8">6/8</option>
                    <option value="2/4">2/4</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Estilo
                  </label>
                  <select
                    value={editStyle}
                    onChange={(e) => setEditStyle(e.target.value as SongStyle)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    {STYLES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ESTRUCTURA CON BOTONES DE CADA SECCIÓN */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Estructura de la Canción (toca los botones para agregar secciones)
                  </label>
                  {editStructureList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditStructureList([])}
                      className="text-[11px] font-bold text-rose-500 hover:underline"
                    >
                      Limpiar estructura
                    </button>
                  )}
                </div>

                <div className="flex items-center sm:flex-wrap gap-1.5 overflow-x-auto pb-1">
                  {QUICK_STRUCTURE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setEditStructureList((prev) => [...prev, chip])
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-amber-500/15 border border-slate-200 dark:border-slate-700 hover:border-amber-500/40 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editCustomSection}
                    onChange={(e) => setEditCustomSection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = editCustomSection.trim();
                        if (clean) {
                          setEditStructureList((prev) => [...prev, clean]);
                          setEditCustomSection('');
                        }
                      }
                    }}
                    placeholder="Otra sección personalizada..."
                    className="flex-1 min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = editCustomSection.trim();
                      if (clean) {
                        setEditStructureList((prev) => [...prev, clean]);
                        setEditCustomSection('');
                      }
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    + Añadir
                  </button>
                </div>

                {editStructureList.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {editStructureList.map((sec, idx) => (
                      <span
                        key={`${sec}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-slate-900 dark:text-amber-300"
                      >
                        <span className="font-mono text-amber-600 dark:text-amber-400">
                          {idx + 1}.
                        </span>
                        <span>{sec}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditStructureList((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="text-slate-400 hover:text-rose-500 ml-0.5"
                          title="Quitar sección"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* IMAGEN DE LA CANCIÓN (EDITAR CANCIÓN) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Imagen de la Canción en la Nube (Opcional)
                  </label>
                  {(editChordSheetUrl ||
                    (!editHadCloudImageRemoved &&
                      activeSong.hasChordSheetImage)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditChordSheetUrl('');
                        setEditHadCloudImageRemoved(true);
                      }}
                      className="text-[11px] font-bold text-rose-500 hover:underline"
                    >
                      Eliminar imagen de la nube
                    </button>
                  )}
                </div>

                {editChordSheetUrl ? (
                  <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-3">
                    <img
                      src={editChordSheetUrl}
                      alt="Vista previa"
                      className="w-14 h-14 object-cover rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        Imagen sincronizada en la nube
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Disponible bajo demanda en cualquier dispositivo
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isScanningAI}
                        onClick={() =>
                          runAISongScan('edit', {
                            imageDataUrl: editChordSheetUrl,
                            rawTextHint: editRawLyrics,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        {isScanningAI ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Extraer con IA</span>
                      </button>
                      <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors">
                        <span>Cambiar</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, 'edit')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer w-full min-h-[46px] px-4 py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500 dark:hover:border-amber-400 bg-slate-50 dark:bg-slate-800/40 hover:bg-amber-500/5 flex items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all">
                    <ImageIcon className="w-4 h-4 text-amber-500" />
                    <span>+ Agregar Imagen</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'edit')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Enlace de Spotify
                </label>
                <input
                  type="url"
                  value={editSpotifyUrl}
                  onChange={(e) => setEditSpotifyUrl(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Letra y Acordes (escribe los acordes en la línea de arriba de la letra)
                </label>
                <textarea
                  rows={8}
                  value={editRawLyrics}
                  onChange={(e) => setEditRawLyrics(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs sm:text-sm text-slate-900 dark:text-white leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditSongModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[42px] px-6 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ELIMINACIÓN DE CANCIÓN */}
      {showDeleteConfirmModal && activeSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              ¿Eliminar «{activeSong.title}» del repertorio?
            </h3>
            <p className="text-xs text-slate-500">
              Esta acción quitará la canción del Repertorio Base y de las listas donde esté asignada.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteActiveSong}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMAGEN EN PANTALLA COMPLETA CON ZOOM */}
      {isImageFullscreen && activeSong && streamedImageUrl && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col">
          {/* Cabecera del visor a pantalla completa */}
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-sm truncate block">
                  {activeSong.title}
                </span>
                <span className="text-[11px] text-amber-400 font-mono">
                  Tono: {currentKey} · {activeSong.bpm} BPM
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() =>
                    setImageZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))
                  }
                  className="min-h-[32px] px-2.5 rounded-lg hover:bg-slate-700 text-xs font-bold font-mono text-slate-200"
                  title="Alejar (-)"
                >
                  -
                </button>
                <span className="text-xs font-mono font-bold text-amber-400 w-12 text-center">
                  {Math.round(imageZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setImageZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))
                  }
                  className="min-h-[32px] px-2.5 rounded-lg hover:bg-slate-700 text-xs font-bold font-mono text-slate-200"
                  title="Acercar (+)"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setImageZoom(1)}
                  className="min-h-[32px] px-2.5 rounded-lg hover:bg-slate-700 text-xs font-bold text-slate-300"
                >
                  Ajustar
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setImageZoom(1);
                  setIsImageFullscreen(false);
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <X className="w-4 h-4" />
                <span>Cerrar</span>
              </button>
            </div>
          </div>

          {/* Cuerpo con imagen centrada y scrollable */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center">
            <img
              src={streamedImageUrl}
              alt={activeSong.title}
              style={{
                transform: `scale(${imageZoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.15s ease-out',
              }}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};