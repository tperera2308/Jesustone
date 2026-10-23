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
import { generateSimpleChordSvgDataUrl } from '../data/initialData';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Headphones,
  Image as ImageIcon,
  ListMusic,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  User,
  Volume2,
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

function getSemitoneStepsBetweenKeys(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey || fromKey === toKey) return 0;
  for (let step = -6; step <= 6; step++) {
    if (transposeKey(fromKey, step) === toKey) {
      return step;
    }
  }
  return 0;
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
  // Sub-pestaña interna del Cancionero: 1) Repertorio Base vs 2) Setlists por Evento
  const [activeSubView, setActiveSubView] = useState<'repertoire' | 'setlists'>(
    initialEventId ? 'setlists' : 'repertoire'
  );
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
    useState<string>(initialEventId || events[0]?.id || '');

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
  const [scrollSpeed, setScrollSpeed] = useState<'slow' | 'medium' | 'fast'>(
    'medium'
  );
  const stageScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Metrónomo rápido en vivo dentro del Modo Escenario
  const [isStageClickPlaying, setIsStageClickPlaying] =
    useState<boolean>(false);
  const stageAudioCtxRef = useRef<AudioContext | null>(null);
  const stageClickTimerRef = useRef<number | null>(null);

  // Modales de Canciones y Playlist
  const [showAddSongModal, setShowAddSongModal] = useState(false);
  const [showEditSongModal, setShowEditSongModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showManagePlaylistModal, setShowManagePlaylistModal] = useState(false);
  const [playlistSearchModal, setPlaylistSearchModal] = useState('');

  // Estados para edición de estructura y notas de la canción activa
  const [newSectionInput, setNewSectionInput] = useState('');
  const [groupNotesDraft, setGroupNotesDraft] = useState('');
  const [personalNotesDraft, setPersonalNotesDraft] = useState('');
  const [savedFeedbackMessage, setSavedFeedbackMessage] = useState<
    string | null
  >(null);

  // Grabadora de notas de voz de referencia en el Cancionero
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceNoteLabel, setVoiceNoteLabel] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

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
  const [editRawLyrics, setEditRawLyrics] = useState('');

  const accent = getAccentClasses(accentColor);
  const isLeader = activeMember.role === 'leader';

  useEffect(() => {
    if (initialEventId) {
      setActiveSubView('setlists');
      setSelectedSetlistEventId(initialEventId);
    }
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
    }
    if (initialAutoStageMode) {
      setIsStageMode(true);
    }
  }, [initialSongId, initialTargetKey, initialEventId, initialAutoStageMode, songs]);

  const filteredSongs = songs.filter((song) => {
    const matchesSearch =
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.rawLyricsAndChords || song.lyricsAndChords || '').toLowerCase().includes(searchQuery.toLowerCase());
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
  });

  const activeSetlistEvent =
    events.find((e) => e.id === selectedSetlistEventId) || events[0] || null;

  const activeSong =
    songs.find((s) => s.id === selectedSongId) || null;

  //Sincronizar borradores de notas al cambiar de canción activa
  useEffect(() => {
    if (!activeSong) return;
    setGroupNotesDraft(activeSong.notes || '');
    setPersonalNotesDraft(
      (activeSong.personalNotes && activeSong.personalNotes[activeMember.id]) ||
        ''
    );
    setSavedFeedbackMessage(null);
  }, [activeSong?.id, activeMember.id]);

  // Auto-scroll effect in Stage Mode
  useEffect(() => {
    if (!isStageMode || !isAutoScrolling) return;
    const container = stageScrollContainerRef.current;
    if (!container) return;

    const intervalMs =
      scrollSpeed === 'slow' ? 75 : scrollSpeed === 'medium' ? 45 : 25;
    const timer = window.setInterval(() => {
      if (container) {
        container.scrollBy({ top: 1, behavior: 'auto' });
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isStageMode, isAutoScrolling, scrollSpeed]);

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

  // Lista ordenada de canciones para navegar Anterior / Siguiente en Modo Escenario
  const setlistOrderIds: { songId: string; customKey?: string }[] =
    activeSubView === 'setlists' && activeSetlistEvent
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

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'new' | 'edit' | 'direct'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (mode === 'new') {
        setNewChordSheetUrl(result);
      } else if (mode === 'edit') {
        setEditChordSheetUrl(result);
      } else if (mode === 'direct' && activeSong) {
        onUpdateSong({
          ...activeSong,
          chordSheetImageUrl: result,
        });
        setSheetViewMode('image');
      }
    };
    reader.readAsDataURL(file);
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

  // Grabación de nota de voz de referencia en una canción
  const startVoiceRecording = async () => {
    if (!activeSong || isRecordingVoice) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      showTempSavedNotice(
        'Tu navegador no permite grabar audio directo en esta vista'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          const noteTitle =
            voiceNoteLabel.trim() ||
            `Idea / Referencia (${activeMember.instruments[0] || 'Voz'})`;
          const newVoiceNote: SongVoiceNote = {
            id: `vn-${Date.now()}`,
            title: noteTitle,
            label: noteTitle,
            authorId: activeMember.id,
            authorName: activeMember.name,
            authorRole: (activeMember.role as UserRole) || 'member',
            audioDataUrl: base64Audio,
            durationSec: Math.max(1, recordingSeconds),
            durationSeconds: Math.max(1, recordingSeconds),
            createdAt: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
          onUpdateSong({
            ...activeSong,
            voiceNotes: [newVoiceNote, ...(activeSong.voiceNotes || [])],
          });
          setVoiceNoteLabel('');
          setRecordingSeconds(0);
          showTempSavedNotice('Nota de voz guardada en esta canción');
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      showTempSavedNotice(
        'Permiso de micrófono denegado. Actívalo en tu navegador para grabar.'
      );
    }
  };

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
  };

  const handleDeleteVoiceNote = (voiceNoteId: string) => {
    if (!activeSong) return;
    onUpdateSong({
      ...activeSong,
      voiceNotes: (activeSong.voiceNotes || []).filter(
        (v) => v.id !== voiceNoteId
      ),
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

    const finalImage =
      newChordSheetUrl ||
      generateSimpleChordSvgDataUrl(
        newTitle.trim(),
        newKey,
        parsedBpm,
        structureArr.join(' → ')
      );

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
      notes:
        newNotes.trim() ||
        'Canción subida al Repertorio Base. Ajusta el tono con el transpositor.',
      personalNotes: {},
      lyricsAndChords: cleanSheet,
      rawLyricsAndChords: cleanSheet,
      chordSheetImageUrl: finalImage,
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
    setEditChordSheetUrl(activeSong.chordSheetImageUrl || '');
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
      chordSheetImageUrl: editChordSheetUrl || undefined,
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

  const toggleSongInSetlist = (song: Song) => {
    if (!activeSetlistEvent || !isLeader) return;
    const exists = activeSetlistEvent.songs.some((s) => s.songId === song.id);
    const updated: EventSongItem[] = exists
      ? activeSetlistEvent.songs.filter((s) => s.songId !== song.id)
      : [
          ...activeSetlistEvent.songs,
          {
            songId: song.id,
            customKey: song.originalKey,
            vocalLeader: activeMember.name,
            backingVocals: [],
          },
        ];
    onUpdateEventPlaylist(activeSetlistEvent.id, updated);
  };

  const moveSetlistSongOrder = (index: number, direction: -1 | 1) => {
    if (!activeSetlistEvent || !isLeader) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeSetlistEvent.songs.length) {
      return;
    }
    const copy = [...activeSetlistEvent.songs];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    onUpdateEventPlaylist(activeSetlistEvent.id, copy);
  };

  const updateSetlistItemField = (
    songId: string,
    patch: Partial<EventSongItem>
  ) => {
    if (!activeSetlistEvent || !isLeader) return;
    const updated = activeSetlistEvent.songs.map((item) =>
      item.songId === songId ? { ...item, ...patch } : item
    );
    onUpdateEventPlaylist(activeSetlistEvent.id, updated);
  };

  const renderSongLines = (rawText: string) => {
    const normalizedSheet = convertBracketedSheetToChordsAbove(rawText || '');
    const lines = normalizedSheet.split('\n');

    return lines.map((line, index) => {
      const trimmed = line.trim();
      const isSectionHeader =
        (trimmed.endsWith(':') && trimmed.length < 36) ||
        (/^(Intro|Verso|Estrofa|Pre-?Coro|Coro|Puente|Interludio|Instrumental|Solo|Espont[aá]neo|Final|Outro|Tag)(\s+\d+)?$/i.test(
          trimmed
        ) &&
          !isChordLine(line));

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
            className="leading-relaxed text-slate-800 dark:text-slate-100 my-1 font-sans"
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
            className="font-mono font-extrabold text-amber-600 dark:text-amber-400 whitespace-pre leading-snug mt-2.5 select-text"
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
          className="leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-wrap mb-1 font-sans"
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
                      e.target.value as 'slow' | 'medium' | 'fast'
                    )
                  }
                  className="bg-slate-900 text-amber-400 text-xs font-bold px-2 py-1 rounded-lg border border-slate-700"
                >
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

            {/* Selector explícito: Acordes + Letra vs Solo Letra */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setShowLyricsOnly(false)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  !showLyricsOnly
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Acordes + Letra
              </button>
              <button
                type="button"
                onClick={() => setShowLyricsOnly(true)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  showLyricsOnly
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Solo Letra
              </button>
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

          {sheetViewMode === 'image' && activeSong.chordSheetImageUrl ? (
            <div className="rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 p-4 flex justify-center">
              <img
                src={activeSong.chordSheetImageUrl}
                alt={activeSong.title}
                className="max-w-full h-auto rounded-2xl"
              />
            </div>
          ) : (
            <div
              style={{ fontSize: `${fontSize + 2}px` }}
              className="font-mono leading-relaxed select-text pb-24"
            >
              {renderSongLines(activeSong.rawLyricsAndChords || activeSong.lyricsAndChords || '')}
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
      {/* BARRA SUPERIOR COMPACTA: Selector Repertorio vs Setlists + Buscador + Subir Canción */}
      <div className="flex flex-col gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {onBackToGroup && (
              <button
                type="button"
                onClick={onBackToGroup}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-amber-500" />
                <span>Volver al Grupo</span>
              </button>
            )}

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveSubView('repertoire')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  activeSubView === 'repertoire'
                    ? `${accent.bgClass} shadow-xs`
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Repertorio Base ({songs.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubView('setlists')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  activeSubView === 'setlists'
                    ? `${accent.bgClass} shadow-xs`
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Setlists de Eventos ({events.length})</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddSongModal(true)}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 ${accent.bgClass}`}
          >
            <Plus className="w-4 h-4" />
            <span>Subir Canción</span>
          </button>
        </div>

        {/* Buscador y Filtros Rápidos (Estilo, Tonalidad y Tempo/BPM) cuando estamos en Repertorio Base */}
        {activeSubView === 'repertoire' && (
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-col lg:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por título, artista o frase de la letra..."
                  className="w-full min-h-[38px] pl-9 pr-9 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtros adicionales de Tono y Velocidad/BPM */}
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <select
                  value={selectedKeyFilter}
                  onChange={(e) => setSelectedKeyFilter(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Todos los Tonos</option>
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
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Cualquier Tempo</option>
                  <option value="slow">Lento (&lt; 75 BPM)</option>
                  <option value="medium">Medio (75 - 110 BPM)</option>
                  <option value="fast">Rápido (&gt; 110 BPM)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
              {['all', ...STYLES].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSelectedStyle(st)}
                  className={`min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all shrink-0 ${
                    selectedStyle === st
                      ? `${accent.bgClass}`
                      : 'bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {st === 'all' ? 'Todos los Estilos' : st}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          VISTA PRINCIPAL:
          - Si NO hay canción abierta (`!selectedSongId`), mostramos la cuadrícula limpia de Canciones o Setlists.
          - Si el usuario toca una canción (`selectedSongId`), abrimos su vista enfocada con botón de "Volver".
         ===================================================================== */}
      {!selectedSongId || !activeSong ? (
        activeSubView === 'repertoire' ? (
          songs.length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4">
              <div
                className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
              >
                <Music className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  El Repertorio Base de este grupo está vacío
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Tanto el Líder como los Miembros pueden subir canciones con acordes, estructura, notas de voz y hojas para toda la banda.
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
                  Toca cualquier canción para abrir sus acordes, estructura, notas y transpositor:
                </p>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {filteredSongs.length}{' '}
                  {filteredSongs.length === 1 ? 'canción' : 'canciones'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => {
                      setSelectedSongId(song.id);
                      setSemitoneOffset(0);
                      setIsFullSheetExpanded(true);
                    }}
                    className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-500/60 hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors truncate">
                            {song.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {song.artist}
                          </p>
                        </div>
                        <span
                          className={`font-mono text-xs font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${accent.softBgClass}`}
                        >
                          {song.originalKey}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span>{song.bpm} BPM</span>
                        <span>·</span>
                        <span>{song.timeSignature}</span>
                        <span>·</span>
                        <span className="font-sans">{song.style}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-500 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          /* Sub-vista 2: Setlists de Eventos */
          <div className="space-y-4">
            {events.length === 0 ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No hay eventos programados aún para mostrar su Setlist.
                </p>
              </div>
            ) : (
              <>
                {/* Selector horizontal de evento */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full">
                    {events.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSelectedSetlistEventId(ev.id)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                          activeSetlistEvent?.id === ev.id
                            ? `${accent.bgClass} shadow-xs`
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {ev.title} ({ev.date.slice(5)})
                      </button>
                    ))}
                  </div>

                  {activeSetlistEvent && (
                    <div className="flex items-center gap-2 shrink-0">
                      {activeSetlistEvent.songs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const firstItem = activeSetlistEvent.songs[0];
                            const firstSong = songs.find(
                              (s) => s.id === firstItem.songId
                            );
                            if (firstSong) {
                              setSelectedSongId(firstSong.id);
                              const targetKey =
                                firstItem.customKey || firstSong.originalKey;
                              setSemitoneOffset(
                                getSemitoneStepsBetweenKeys(
                                  firstSong.originalKey,
                                  targetKey
                                )
                              );
                              setIsStageMode(true);
                            }
                          }}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Modo Atril del Setlist</span>
                        </button>
                      )}

                      {isLeader && (
                        <button
                          type="button"
                          onClick={() => setShowManagePlaylistModal(true)}
                          className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Editar Setlist</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Lista de canciones del evento seleccionado */}
                {activeSetlistEvent && (
                  <div className="space-y-3">
                    {activeSetlistEvent.rehearsals &&
                      activeSetlistEvent.rehearsals.length > 0 && (
                        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-semibold">
                            <Calendar className="w-4 h-4 shrink-0" />
                            <span>
                              Esta misma Setlist se ensaya en:{' '}
                              <strong>
                                {activeSetlistEvent.rehearsals
                                  .map(
                                    (r) =>
                                      `${r.title} (${r.date.slice(5)} · ${r.time})`
                                  )
                                  .join(' · ')}
                              </strong>
                            </span>
                          </div>
                        </div>
                      )}

                    {activeSetlistEvent.songs.length === 0 ? (
                      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
                        <p className="text-xs sm:text-sm text-slate-500">
                          Este evento aún no tiene canciones asignadas en su Setlist.
                        </p>
                        {isLeader && (
                          <button
                            type="button"
                            onClick={() => setShowManagePlaylistModal(true)}
                            className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${accent.bgClass}`}
                          >
                            <Plus className="w-4 h-4" />
                            <span>Armar Setlist del Evento</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {activeSetlistEvent.songs.map((evSong, index) => {
                          const songObj = songs.find(
                            (s) => s.id === evSong.songId
                          );
                          if (!songObj) return null;
                          const targetKey =
                            evSong.customKey || songObj.originalKey;
                          const isKeyTransposed =
                            targetKey !== songObj.originalKey;

                          return (
                            <button
                              key={`${evSong.songId}-${index}`}
                              type="button"
                              onClick={() => {
                                setSelectedSongId(songObj.id);
                                setIsFullSheetExpanded(true);
                                setSemitoneOffset(
                                  getSemitoneStepsBetweenKeys(
                                    songObj.originalKey,
                                    targetKey
                                  )
                                );
                              }}
                              className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-500/60 hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="text-[10px] font-mono font-bold text-amber-500 uppercase">
                                      Orden #{index + 1}
                                    </span>
                                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-500 truncate">
                                      {songObj.title}
                                    </h3>
                                  </div>
                                  <span
                                    className={`font-mono text-xs font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${
                                      isKeyTransposed
                                        ? 'bg-amber-500 text-slate-950'
                                        : accent.softBgClass
                                    }`}
                                  >
                                    Tono: {targetKey}
                                  </span>
                                </div>

                                <p className="text-xs text-slate-500 truncate">
                                  Voz: {evSong.vocalLeader || 'Por definir'}
                                  {evSong.backingVocals &&
                                  evSong.backingVocals.length > 0
                                    ? ` · Coros: ${evSong.backingVocals.join(', ')}`
                                    : ''}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
                                <span>
                                  {songObj.bpm} BPM · {songObj.timeSignature}
                                </span>
                                <span className="font-sans font-bold text-amber-500">
                                  Abrir cifrado →
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      ) : (
        /* ===================================================================
           VISTA DETALLE DE LA CANCIÓN SELECCIONADA (CON TRANSPOSITOR DIRECTO)
           =================================================================== */
        <div className="space-y-4">
          {/* Barra para volver a la lista de canciones o cambiar rápido entre temas */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelectedSongId(null)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" />
              <span>
                {activeSubView === 'setlists'
                  ? 'Volver al Setlist del Evento'
                  : 'Volver al Repertorio'}
              </span>
            </button>

            {setlistOrderIds.length > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigateAdjacentSong(-1)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>
                <span className="text-xs font-mono font-bold text-slate-500 px-1">
                  {currentIndexInOrder + 1}/{setlistOrderIds.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateAdjacentSong(1)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 shadow-xs">
            {/* Cabecera de la canción + Acciones */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg font-bold ${accent.softBgClass}`}
                  >
                    {activeSong.style}
                  </span>
                  <span>·</span>
                  <span className="font-mono font-bold">
                    Tono Base: {activeSong.originalKey}
                  </span>
                  <span>·</span>
                  <span className="font-mono">
                    {activeSong.bpm} BPM ({activeSong.timeSignature})
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {activeSong.title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  {activeSong.artist}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeSong.spotifyUrl && (
                  <a
                    href={activeSong.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Spotify</span>
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
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Abrir en Metrónomo ({activeSong.bpm})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsStageMode(true)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs ${accent.bgClass}`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Modo Escenario / Atril</span>
                </button>

                <button
                  type="button"
                  onClick={openEditModalForActiveSong}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500 flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-500" />
                  <span>Editar</span>
                </button>

                {isLeader && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmModal(true)}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-bold text-rose-600 dark:text-rose-400"
                    title="Eliminar canción"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* BARRA DE TRANSPOSICIÓN CON SELECTOR DIRECTO DE TONO DESTINO */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Transponer Tono:
                </span>

                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setSemitoneOffset((s) => s - 1)}
                    className="min-h-[34px] px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs font-bold"
                  >
                    -1
                  </button>
                  <span
                    className={`px-3 py-1 rounded-lg font-mono text-sm font-extrabold ${accent.softBgClass}`}
                  >
                    {currentKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSemitoneOffset((s) => s + 1)}
                    className="min-h-[34px] px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs font-bold"
                  >
                    +1
                  </button>
                </div>

                {/* Selector directo de Tono Destino */}
                <select
                  value={currentKey}
                  onChange={(e) => {
                    const target = e.target.value;
                    setSemitoneOffset(
                      getSemitoneStepsBetweenKeys(
                        activeSong.originalKey,
                        target
                      )
                    );
                  }}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-800 dark:text-slate-200"
                  title="Saltar directamente a un tono"
                >
                  {(activeSong.originalKey.endsWith('m')
                    ? MINOR_KEYS
                    : MAJOR_KEYS
                  ).map((k) => (
                    <option key={k} value={k}>
                      Ir a Tono: {k}{' '}
                      {k === activeSong.originalKey ? '(Original)' : ''}
                    </option>
                  ))}
                </select>

                {semitoneOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setSemitoneOffset(0)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Original ({activeSong.originalKey})</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowLyricsOnly(false)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      !showLyricsOnly
                        ? `${accent.bgClass}`
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Acordes + Letra</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLyricsOnly(true)}
                    className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      showLyricsOnly
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Solo Letra</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => Math.max(12, f - 1))}
                    className="px-2 py-1 text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() => setFontSize((f) => Math.min(24, f + 1))}
                    className="px-2 py-1 text-xs font-bold text-slate-600 dark:text-slate-300"
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
                <div className="flex flex-wrap items-center gap-1">
                  {QUICK_STRUCTURE_CHIPS.slice(0, 6).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddStructureSection(chip)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-[10px] font-bold text-slate-600 dark:text-slate-300"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
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

            {/* PESTAÑAS INTERNAS DE LA HOJA: Cifrado Interactivo vs Imagen de Partitura/Hoja */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSheetViewMode('interactive')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      sheetViewMode === 'interactive'
                        ? `${accent.bgClass}`
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Cifrado Interactivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSheetViewMode('image')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      sheetViewMode === 'image'
                        ? `${accent.bgClass}`
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Hoja / Imagen Adjunta</span>
                  </button>
                </div>

                <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-amber-500" />
                  <span>Subir Foto de Partitura/Acordes</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'direct')}
                    className="hidden"
                  />
                </label>
              </div>

              {sheetViewMode === 'image' && activeSong.chordSheetImageUrl ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-4 flex justify-center">
                  <img
                    src={activeSong.chordSheetImageUrl}
                    alt={activeSong.title}
                    className="max-w-full h-auto rounded-xl"
                  />
                </div>
              ) : (
                <div
                  style={{ fontSize: `${fontSize}px` }}
                  className="p-4 sm:p-6 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 font-mono overflow-x-auto"
                >
                  {renderSongLines(activeSong.rawLyricsAndChords || activeSong.lyricsAndChords || '')}
                </div>
              )}
            </div>

            {/* NOTAS DE VOZ DE REFERENCIA EN LA CANCIÓN */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-rose-500" />
                    <span>
                      Notas de Voz e Ideas de Arreglo (
                      {(activeSong.voiceNotes || []).length})
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Graba un fragmento de melodía, intro o arreglo para que la banda lo escuche.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={voiceNoteLabel}
                    onChange={(e) => setVoiceNoteLabel(e.target.value)}
                    placeholder="Etiqueta (ej. Riff guitarra, 2da voz)..."
                    className="min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                  {isRecordingVoice ? (
                    <button
                      type="button"
                      onClick={stopVoiceRecording}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 animate-pulse"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Detener ({recordingSeconds}s)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startVoiceRecording}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Grabar Idea</span>
                    </button>
                  )}
                </div>
              </div>

              {(activeSong.voiceNotes || []).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {(activeSong.voiceNotes || []).map((vn) => (
                    <div
                      key={vn.id}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {vn.label || vn.title}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Por {vn.authorName} ({vn.authorRole}) · {vn.createdAt}
                          </p>
                        </div>
                        {(isLeader || vn.authorId === activeMember.id) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteVoiceNote(vn.id)}
                            className="text-slate-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {vn.audioDataUrl ? (
                        <audio
                          controls
                          src={vn.audioDataUrl}
                          className="w-full h-8"
                        />
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          Audio local compactado
                        </p>
                      )}
                    </div>
                  ))}
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
                onClick={() => setShowAddSongModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
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

                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_STRUCTURE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setNewStructureList((prev) => [...prev, chip])
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-amber-500/15 border border-slate-200 dark:border-slate-700 hover:border-amber-500/40 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
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
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Letra y Acordes (escribe los acordes en la línea de arriba de la letra)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setNewRawLyrics(
                        `Intro:\nG          D/F#       Em7        C\n\nVerso 1:\nG                     D/F#\nAquí estás, moviéndote en este lugar\nEm7                   C\nTe adoraré, te adoraré\n\nCoro:\nG                     D/F#\nMilagroso, abres camino, cumples promesas\nEm7                   C\nLuz en tinieblas, mi Dios, así eres Tú`
                      )
                    }
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    + Insertar ejemplo con acordes arriba
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={newRawLyrics}
                  onChange={(e) => setNewRawLyrics(e.target.value)}
                  placeholder={`Intro:\nG          D/F#       Em7        C\n\nVerso 1:\nG                     D/F#\nEscribe los acordes en la línea de arriba de la letra\nEm7                   C\nSin usar corchetes, tal como en el cifrado tradicional`}
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
                onClick={() => setShowEditSongModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
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

                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_STRUCTURE_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setEditStructureList((prev) => [...prev, chip])
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-amber-500/15 border border-slate-200 dark:border-slate-700 hover:border-amber-500/40 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
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
                  placeholder={`Intro:\nG          D/F#       Em7        C\n\nVerso 1:\nG                     D/F#\nEscribe los acordes en la línea de arriba de la letra`}
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

      {/* MODAL: EDITAR SETLIST DEL EVENTO DESDE EL CANCIONERO */}
      {showManagePlaylistModal && activeSetlistEvent && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Setlist para «{activeSetlistEvent.title}»
                </h3>
                <p className="text-xs text-slate-500">
                  Esta misma lista aplica para el evento y sus ensayos programados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManagePlaylistModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeSetlistEvent.songs.length > 0 && (
              <div className="space-y-2">
                {activeSetlistEvent.songs.map((item, idx) => {
                  const s = songs.find((x) => x.id === item.songId);
                  if (!s) return null;
                  return (
                    <div
                      key={`${item.songId}-${idx}`}
                      className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {idx + 1}. {s.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveSetlistSongOrder(idx, -1)}
                          className="p-1 rounded bg-slate-200 dark:bg-slate-800 text-xs disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={
                            idx === activeSetlistEvent.songs.length - 1
                          }
                          onClick={() => moveSetlistSongOrder(idx, 1)}
                          className="p-1 rounded bg-slate-200 dark:bg-slate-800 text-xs disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <select
                          value={item.customKey || s.originalKey}
                          onChange={(e) =>
                            updateSetlistItemField(s.id, {
                              customKey: e.target.value,
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-xs font-bold"
                        >
                          {ALL_KEYS.map((k) => (
                            <option key={k} value={k}>
                              Tono {k}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => toggleSongInSetlist(s)}
                          className="text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <input
                type="text"
                value={playlistSearchModal}
                onChange={(e) => setPlaylistSearchModal(e.target.value)}
                placeholder="Buscar canciones del repertorio para agregar..."
                className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {songs
                  .filter((s) =>
                    s.title
                      .toLowerCase()
                      .includes(playlistSearchModal.toLowerCase())
                  )
                  .map((s) => {
                    const included = activeSetlistEvent.songs.some(
                      (i) => i.songId === s.id
                    );
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSongInSetlist(s)}
                        className={`w-full px-3 py-2 rounded-xl border flex items-center justify-between text-xs font-bold ${
                          included
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <span>
                          {s.title} ({s.originalKey})
                        </span>
                        <span>{included ? '✓ Agregada' : '+ Agregar'}</span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowManagePlaylistModal(false)}
              className={`w-full min-h-[44px] rounded-2xl text-xs font-bold ${accent.bgClass}`}
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};