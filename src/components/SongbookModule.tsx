import React, { useEffect, useRef, useState } from 'react';
import {
  AccentColorId,
  BandMember,
  EventSongItem,
  Song,
  SongVoiceNote,
  TimeSignature,
  WorshipEvent,
} from '../types';
import {
  extractUniqueChordsFromSheet,
  generateLeadSheetSVGDataUrl,
  isChordLine,
  transposeChordSheet,
  transposeNote,
  transposeSingleChord,
} from '../utils/musicTheory';
import {
  generateDemoVoiceClipDataUrl,
  playMetronomeClick,
} from '../utils/audioEngine';
import { getAccentClasses } from './IdentityModal';
import {
  ArrowLeft,
  BookOpen,
  BookmarkCheck,
  Calendar,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderKanban,
  Headphones,
  Image as ImageIcon,
  ListMusic,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Square,
  Trash2,
  Type,
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
  onAddSong: (song: Omit<Song, 'id'>) => void;
  onUpdateSong: (song: Song) => void;
  onDeleteSong?: (songId: string) => void;
  onUpdateEventPlaylist: (eventId: string, updatedSongs: EventSongItem[]) => void;
  onUpdateEvent?: (event: WorshipEvent) => void;
  onOpenMetronomeWithSong: (bpm: number, timeSignature: TimeSignature) => void;
}

const KEY_SEMITONE_INDEX: Record<string, number> = {
  C: 0,
  Cm: 0,
  'C#': 1,
  'C#m': 1,
  Db: 1,
  Dbm: 1,
  D: 2,
  Dm: 2,
  'D#': 3,
  'D#m': 3,
  Eb: 3,
  Ebm: 3,
  E: 4,
  Em: 4,
  F: 5,
  Fm: 5,
  'F#': 6,
  'F#m': 6,
  Gb: 6,
  Gbm: 6,
  G: 7,
  Gm: 7,
  'G#': 8,
  'G#m': 8,
  Ab: 8,
  Abm: 8,
  A: 9,
  Am: 9,
  'A#': 10,
  'A#m': 10,
  Bb: 10,
  Bbm: 10,
  B: 11,
  Bm: 11,
};

const MAJOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

const SECTION_PRESETS = [
  'Intro',
  'Verso 1',
  'Verso 2',
  'Pre-Coro',
  'Coro',
  'Coro x2',
  'Instrumental',
  'Puente',
  'Puente x2',
  'Espontáneo',
  'Coro Final',
  'Final',
];

function extractStructureFromLyrics(lyricsAndChords: string): string[] {
  const lines = lyricsAndChords.split('\n');
  const extracted: string[] = [];
  for (const line of lines) {
    const match = line.trim().match(/^\[(.*)\]$/);
    if (match && match[1].trim()) {
      extracted.push(match[1].trim());
    }
  }
  return extracted.length > 0
    ? extracted
    : ['Intro', 'Verso 1', 'Coro', 'Verso 2', 'Coro x2', 'Puente x2', 'Final'];
}

function getSectionBadgeColors(sectionName: string): string {
  const lower = sectionName.toLowerCase();
  if (lower.includes('intro') || lower.includes('instr') || lower.includes('final') || lower.includes('outro')) {
    return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  }
  if (lower.includes('coro')) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  }
  if (lower.includes('puente') || lower.includes('espont')) {
    return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
  if (lower.includes('pre')) {
    return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
  }
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

function computeSemitoneDiff(origKey: string, targetKey: string): number {
  const cleanOrig = origKey.replace(/m$/, '');
  const cleanTarget = targetKey.replace(/m$/, '');
  const origIdx = KEY_SEMITONE_INDEX[origKey] ?? KEY_SEMITONE_INDEX[cleanOrig];
  const targetIdx = KEY_SEMITONE_INDEX[targetKey] ?? KEY_SEMITONE_INDEX[cleanTarget];
  if (origIdx === undefined || targetIdx === undefined) return 0;
  let diff = targetIdx - origIdx;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

function getBeatsCountFromTimeSignature(ts: TimeSignature): number {
  if (ts === '2/4') return 2;
  if (ts === '3/4') return 3;
  if (ts === '6/8') return 6;
  return 4;
}

export const SongbookModule: React.FC<SongbookModuleProps> = ({
  songs,
  events,
  members,
  activeMember,
  accentColor,
  initialSongId,
  initialTargetKey,
  onAddSong,
  onUpdateSong,
  onDeleteSong,
  onUpdateEventPlaylist,
  onUpdateEvent,
  onOpenMetronomeWithSong,
}) => {
  const accent = getAccentClasses(accentColor);
  const isLeader = activeMember.role === 'leader';

  // Dedicated Screen Sub-view inside Songbook:
  // 'repertorio': Pantalla única de Repertorio Base
  // 'setlists': Pantalla única de Setlists de Eventos
  const [activeSubView, setActiveSubView] = useState<'repertorio' | 'setlists'>('repertorio');
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [selectedStyleFilter, setSelectedStyleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string>(
    initialSongId || songs[0]?.id || ''
  );
  const [openedSongId, setOpenedSongId] = useState<string | null>(
    initialSongId || null
  );
  const [semitones, setSemitones] = useState<number>(0);
  const [useSolfege, setUseSolfege] = useState<boolean>(false);
  const [lyricsOnly, setLyricsOnly] = useState<boolean>(false);
  const [viewFormat, setViewFormat] = useState<'text' | 'image'>('text');
  const [isEditingLyrics, setIsEditingLyrics] = useState<boolean>(false);
  const [editedLyrics, setEditedLyrics] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditSongModal, setShowEditSongModal] = useState<boolean>(false);
  const [confirmDeleteSongId, setConfirmDeleteSongId] = useState<string | null>(null);
  const [showManagePlaylistModal, setShowManagePlaylistModal] = useState<boolean>(false);

  // Edit Song Metadata State
  const [editSongTitle, setEditSongTitle] = useState('');
  const [editSongArtist, setEditSongArtist] = useState('');
  const [editSongKey, setEditSongKey] = useState('G');
  const [editSongBpm, setEditSongBpm] = useState(76);
  const [editSongTimeSig, setEditSongTimeSig] = useState<TimeSignature>('4/4');
  const [editSongStyle, setEditSongStyle] = useState<Song['style']>('Adoración');
  const [editSongSpotifyUrl, setEditSongSpotifyUrl] = useState('');

  // Song Structure Editor State
  const [isEditingStructure, setIsEditingStructure] = useState<boolean>(false);
  const [structureDraft, setStructureDraft] = useState<string[]>([]);
  const [customSectionInput, setCustomSectionInput] = useState<string>('');

  // Song Group Notes & Personal Notes State
  const [groupNotesDraft, setGroupNotesDraft] = useState<string>('');
  const [personalNotesDraft, setPersonalNotesDraft] = useState<string>('');
  const [notesSavedFeedback, setNotesSavedFeedback] = useState<string>('');

  // Stage Mode / Modo Atril Fullscreen State
  const [isStageMode, setIsStageMode] = useState<boolean>(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(0.6); // 0.3x, 0.5x, 0.6x, 0.8x, 1x, 1.4x
  const [stageFontSize, setStageFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('lg');
  const stageScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // In-Song Integrated Metronome State
  const [isSongMetronomePlaying, setIsSongMetronomePlaying] = useState<boolean>(false);
  const [songMetronomeBpm, setSongMetronomeBpm] = useState<number>(76);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const metronomeTimerRef = useRef<number | null>(null);

  // Voice Note / Audio Clip Recording inside Song
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [voiceNoteTitle, setVoiceNoteTitle] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const voiceFileInputRef = useRef<HTMLInputElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Saved Weekly Key Feedback
  const [savedWeeklyKeyNotice, setSavedWeeklyKeyNotice] = useState<string>('');

  // New Song Form State
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newKey, setNewKey] = useState('G');
  const [newBpm, setNewBpm] = useState(76);
  const [newTimeSig, setNewTimeSig] = useState<TimeSignature>('4/4');
  const [newStyle, setNewStyle] = useState<Song['style']>('Adoración');
  const [newCharacteristics, setNewCharacteristics] = useState(
    'Entrada con Piano, Coro Congregacional'
  );
  const [newStructure, setNewStructure] = useState<string[]>([
    'Intro',
    'Verso 1',
    'Coro',
    'Verso 2',
    'Coro x2',
    'Puente x2',
    'Final',
  ]);
  const [newCustomSection, setNewCustomSection] = useState('');
  const [newGroupNotes, setNewGroupNotes] = useState('');
  const [newSpotifyUrl, setNewSpotifyUrl] = useState('');
  const [newLyrics, setNewLyrics] = useState(
    `[Intro]\nG   D/F#   Em7   Cadd9\n\n[Verso 1]\nG                      D/F#\nEscribe aquí la letra con acordes arriba\nEm7                    Cadd9\nTodos en el grupo podrán ver esta canción y su archivo`
  );
  const [newImageDataUrl, setNewImageDataUrl] = useState<string>('');
  const [newFileName, setNewFileName] = useState<string>('');

  const activeEventList =
    activeSubView === 'setlists'
      ? events.find((ev) => ev.id === selectedEventId) || events[0]
      : undefined;

  // Spotify Playlist Draft for Event Setlist
  const [eventSpotifyDraft, setEventSpotifyDraft] = useState<string>(
    activeEventList?.spotifyPlaylistUrl || ''
  );
  const [isEditingEventSpotify, setIsEditingEventSpotify] = useState<boolean>(false);
  const [eventSpotifySavedNotice, setEventSpotifySavedNotice] = useState<string>('');

  useEffect(() => {
    if (activeEventList) {
      setEventSpotifyDraft(activeEventList.spotifyPlaylistUrl || '');
      setIsEditingEventSpotify(false);
    }
  }, [activeEventList?.id, activeEventList?.spotifyPlaylistUrl]);

  // Songs displayed according to current screen: Base Repertoire vs Event Setlist
  const songsInSelectedList = (() => {
    if (activeSubView === 'repertorio' || !activeEventList) return songs;
    return activeEventList.songs
      .map((item) => songs.find((s) => s.id === item.songId))
      .filter(Boolean) as Song[];
  })();

  const filteredSongs = songsInSelectedList.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.addedByName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.originalKey.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStyle =
      selectedStyleFilter === 'all' || s.style === selectedStyleFilter;
    return matchesSearch && matchesStyle;
  });

  const activeSong =
    songs.find((s) => s.id === selectedSongId) ||
    filteredSongs[0] ||
    songs[0];

  // Find weekly custom key if viewing an Event Playlist
  const activeEventSongItem =
    activeEventList && activeSong
      ? activeEventList.songs.find((item) => item.songId === activeSong.id)
      : undefined;

  const currentSongIndexInList = activeSong
    ? filteredSongs.findIndex((s) => s.id === activeSong.id)
    : -1;

  // Select song helper that respects weekly customKey when inside an Event Playlist
  const selectSongWithContextKey = (song: Song, eventContext?: WorshipEvent) => {
    setSelectedSongId(song.id);
    const ev = eventContext ?? activeEventList;
    if (ev) {
      const item = ev.songs.find((i) => i.songId === song.id);
      if (item?.customKey) {
        setSemitones(computeSemitoneDiff(song.originalKey, item.customKey));
        return;
      }
    }
    setSemitones(0);
  };

  useEffect(() => {
    if (initialSongId) {
      setSelectedSongId(initialSongId);
      setOpenedSongId(initialSongId);
      const targetSong = songs.find((s) => s.id === initialSongId);
      if (targetSong && initialTargetKey) {
        setSemitones(computeSemitoneDiff(targetSong.originalKey, initialTargetKey));
      } else {
        setSemitones(0);
      }
    }
  }, [initialSongId, initialTargetKey, songs]);

  useEffect(() => {
    setIsEditingStructure(false);
    if (activeSong) {
      setEditedLyrics(activeSong.lyricsAndChords);
      setSongMetronomeBpm(activeSong.bpm);
      const resolvedStructure =
        activeSong.structure && activeSong.structure.length > 0
          ? activeSong.structure
          : extractStructureFromLyrics(activeSong.lyricsAndChords);
      setStructureDraft(resolvedStructure);
      setGroupNotesDraft(activeSong.groupNotes ?? activeSong.notes ?? '');
      setPersonalNotesDraft(activeSong.personalNotes?.[activeMember.id] ?? '');
    }
  }, [selectedSongId, activeSong?.id, activeMember.id]);

  // Integrated In-Song Metronome Engine
  useEffect(() => {
    if (!isSongMetronomePlaying || !activeSong) {
      if (metronomeTimerRef.current) {
        window.clearInterval(metronomeTimerRef.current);
        metronomeTimerRef.current = null;
      }
      setCurrentBeat(0);
      return;
    }

    const beatsPerBar = getBeatsCountFromTimeSignature(activeSong.timeSignature);
    const intervalMs = Math.max(200, Math.round((60 / songMetronomeBpm) * 1000));
    let beatStep = 0;

    playMetronomeClick(true);
    setCurrentBeat(1);

    metronomeTimerRef.current = window.setInterval(() => {
      beatStep = (beatStep + 1) % beatsPerBar;
      playMetronomeClick(beatStep === 0);
      setCurrentBeat(beatStep + 1);
    }, intervalMs);

    return () => {
      if (metronomeTimerRef.current) {
        window.clearInterval(metronomeTimerRef.current);
        metronomeTimerRef.current = null;
      }
    };
  }, [isSongMetronomePlaying, songMetronomeBpm, activeSong?.timeSignature]);

  // Stage Mode Auto-Scroll Engine synced to BPM & speed multiplier (calibrated slow and smooth)
  useEffect(() => {
    if (!isStageMode || !isAutoScrolling || !stageScrollContainerRef.current) {
      return;
    }
    const container = stageScrollContainerRef.current;
    const bpmFactor = (activeSong?.bpm || 75) / 75;
    // Calibrated gentle scrolling pace: ~2.4px/sec at 0.6x (comfortable reading speed)
    const pixelsPerTick = 0.18 * autoScrollSpeed * bpmFactor;

    const timer = window.setInterval(() => {
      if (container) {
        container.scrollTop += pixelsPerTick;
      }
    }, 45);

    return () => window.clearInterval(timer);
  }, [isStageMode, isAutoScrolling, autoScrollSpeed, activeSong?.bpm]);

  // Extract all unique chords present in this song's sheet without repetition
  const songUniqueChords = activeSong
    ? extractUniqueChordsFromSheet(activeSong.lyricsAndChords)
    : [];

  const effectivePreviewChords =
    songUniqueChords.length > 0
      ? songUniqueChords
      : activeSong?.chordProgPreview && activeSong.chordProgPreview.length > 0
      ? activeSong.chordProgPreview
      : ['G', 'D', 'Em', 'C'];


  const currentKey = activeSong
    ? transposeSingleChord(activeSong.originalKey, semitones, false)
    : 'G';
  const currentKeyDisplay = activeSong
    ? transposeSingleChord(activeSong.originalKey, semitones, useSolfege)
    : 'G';
  const transposedText = activeSong
    ? transposeChordSheet(activeSong.lyricsAndChords, semitones, useSolfege)
    : '';
  const transposedPreviewChords = effectivePreviewChords.map((c) =>
    transposeSingleChord(c, semitones, useSolfege)
  );

  // Save currentKey as the weekly customKey for the active Event Playlist (without modifying originalKey)
  const handleSaveKeyForActiveEvent = (targetEventId?: string) => {
    if (!activeSong) return;
    const evId = targetEventId || activeEventList?.id;
    const evObj = events.find((e) => e.id === evId);
    if (!evObj) return;

    const exists = evObj.songs.some((item) => item.songId === activeSong.id);
    const updatedSongs: EventSongItem[] = exists
      ? evObj.songs.map((item) =>
          item.songId === activeSong.id
            ? { ...item, customKey: currentKey }
            : item
        )
      : [
          ...evObj.songs,
          {
            songId: activeSong.id,
            customKey: currentKey,
            vocalLeader: activeMember.name,
          },
        ];

    onUpdateEventPlaylist(evObj.id, updatedSongs);
    setSavedWeeklyKeyNotice(
      `Tono ${currentKey} guardado para «${evObj.title}» (Tono base se mantiene en ${activeSong.originalKey})`
    );
    window.setTimeout(() => setSavedWeeklyKeyNotice(''), 4000);
  };

  // Navigate to Previous / Next song in current list
  const handleNavigatePlaylist = (direction: 'prev' | 'next') => {
    if (filteredSongs.length <= 1 || currentSongIndexInList === -1) return;
    const nextIdx =
      direction === 'next'
        ? (currentSongIndexInList + 1) % filteredSongs.length
        : (currentSongIndexInList - 1 + filteredSongs.length) %
          filteredSongs.length;
    const nextSong = filteredSongs[nextIdx];
    if (nextSong) {
      selectSongWithContextKey(nextSong, activeEventList);
      if (openedSongId) {
        setOpenedSongId(nextSong.id);
      }
      if (stageScrollContainerRef.current) {
        stageScrollContainerRef.current.scrollTop = 0;
      }
    }
  };

  // Voice Note Recording Handlers
  const handleStartRecordingVoiceNote = async () => {
    setRecordingSeconds(0);
    setIsRecordingVoiceNote(true);
    audioChunksRef.current = [];

    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.start();
      }
    } catch {
      // Fallback to synthesized audio clip on stop if microphone is unavailable in preview
      mediaRecorderRef.current = null;
    }
  };

  const handleStopAndSaveVoiceNote = () => {
    if (!activeSong) return;
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const finalDuration = Math.max(2, recordingSeconds);
    setIsRecordingVoiceNote(false);

    const saveVoiceNoteWithUrl = (dataUrl: string) => {
      const noteObj: SongVoiceNote = {
        id: `vn-${Date.now()}`,
        title:
          voiceNoteTitle.trim() ||
          `Idea / Arreglo en Tono ${currentKey} (${activeMember.name.split(' ')[0]})`,
        authorId: activeMember.id,
        authorName: activeMember.name,
        authorRole: activeMember.role,
        audioDataUrl: dataUrl,
        durationSec: finalDuration,
        createdAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      onUpdateSong({
        ...activeSong,
        voiceNotes: [noteObj, ...(activeSong.voiceNotes || [])],
      });
      setVoiceNoteTitle('');
      setRecordingSeconds(0);
    };

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      const recorder = mediaRecorderRef.current;
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              saveVoiceNoteWithUrl(reader.result);
            } else {
              saveVoiceNoteWithUrl(generateDemoVoiceClipDataUrl(finalDuration));
            }
          };
          reader.readAsDataURL(blob);
        } else {
          saveVoiceNoteWithUrl(generateDemoVoiceClipDataUrl(finalDuration));
        }
      };
      recorder.stop();
    } else {
      saveVoiceNoteWithUrl(generateDemoVoiceClipDataUrl(finalDuration));
    }
  };

  const handleUploadVoiceAudioFile = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!activeSong) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const noteObj: SongVoiceNote = {
          id: `vn-${Date.now()}`,
          title: voiceNoteTitle.trim() || file.name.replace(/\.[^.]+$/, ''),
          authorId: activeMember.id,
          authorName: activeMember.name,
          authorRole: activeMember.role,
          audioDataUrl: reader.result,
          durationSec: 12,
          createdAt: 'Archivo subido',
        };
        onUpdateSong({
          ...activeSong,
          voiceNotes: [noteObj, ...(activeSong.voiceNotes || [])],
        });
        setVoiceNoteTitle('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteVoiceNote = (noteId: string) => {
    if (!activeSong) return;
    onUpdateSong({
      ...activeSong,
      voiceNotes: (activeSong.voiceNotes || []).filter((n) => n.id !== noteId),
    });
  };

  const handleUploadImageForActiveSong = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!activeSong) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateSong({
          ...activeSong,
          chordSheetImageUrl: reader.result,
          attachedFileName: file.name,
        });
        setViewFormat('image');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEditedLyrics = () => {
    if (!activeSong) return;
    onUpdateSong({
      ...activeSong,
      lyricsAndChords: editedLyrics,
    });
    setIsEditingLyrics(false);
  };

  const activeSongStructure = activeSong
    ? activeSong.structure && activeSong.structure.length > 0
      ? activeSong.structure
      : extractStructureFromLyrics(activeSong.lyricsAndChords)
    : [];

  const handleSaveStructure = () => {
    if (!activeSong) return;
    const cleaned = structureDraft.map((s) => s.trim()).filter(Boolean);
    onUpdateSong({
      ...activeSong,
      structure: cleaned,
    });
    setIsEditingStructure(false);
    setNotesSavedFeedback('Estructura de la canción guardada para todo el grupo');
    window.setTimeout(() => setNotesSavedFeedback(''), 3000);
  };

  const handleAddSectionToDraft = (sectionLabel: string) => {
    const clean = sectionLabel.trim();
    if (!clean) return;
    setStructureDraft((prev) => [...prev, clean]);
    setCustomSectionInput('');
  };

  const handleMoveSectionInDraft = (index: number, direction: -1 | 1) => {
    setStructureDraft((prev) => {
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleRemoveSectionFromDraft = (index: number) => {
    setStructureDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveSongGroupNotes = () => {
    if (!activeSong) return;
    onUpdateSong({
      ...activeSong,
      groupNotes: groupNotesDraft.trim(),
      notes: groupNotesDraft.trim(),
    });
    setNotesSavedFeedback('Notas grupales de la canción guardadas para toda la banda');
    window.setTimeout(() => setNotesSavedFeedback(''), 3000);
  };

  const handleSaveSongPersonalNotes = () => {
    if (!activeSong) return;
    const nextPersonal = {
      ...(activeSong.personalNotes || {}),
      [activeMember.id]: personalNotesDraft.trim(),
    };
    onUpdateSong({
      ...activeSong,
      personalNotes: nextPersonal,
    });
    setNotesSavedFeedback(`Tu nota personal fue guardada (${activeMember.name})`);
    window.setTimeout(() => setNotesSavedFeedback(''), 3000);
  };

  const handleCreateNewSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const chars = newCharacteristics
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const defaultChords = [newKey, 'D', 'Em7', 'C'];
    const imageSheet =
      newImageDataUrl ||
      generateLeadSheetSVGDataUrl(
        newTitle.trim(),
        newArtist.trim() || 'jesustone Worship',
        newKey,
        Number(newBpm) || 75,
        newTimeSig,
        defaultChords
      );

    const finalStructure =
      newStructure.length > 0
        ? newStructure
        : extractStructureFromLyrics(newLyrics);

    onAddSong({
      title: newTitle.trim(),
      artist: newArtist.trim() || 'jesustone Worship',
      originalKey: newKey,
      bpm: Number(newBpm) || 75,
      timeSignature: newTimeSig,
      style: newStyle,
      characteristics: chars.length > 0 ? chars : ['Congregacional'],
      structure: finalStructure,
      spotifyUrl: newSpotifyUrl.trim() || undefined,
      spotifyTrackId: `SP-${Date.now().toString().slice(-4)}`,
      referenceDuration: '04:30',
      chordProgPreview: defaultChords,
      lyricsAndChords: newLyrics,
      chordSheetImageUrl: imageSheet,
      attachedFileName:
        newFileName || `${newTitle.trim().replace(/\s+/g, '_')}_Acordes.svg`,
      notes:
        newGroupNotes.trim() ||
        `Agregada al repertorio general por ${activeMember.name}.`,
      groupNotes:
        newGroupNotes.trim() ||
        `Agregada al repertorio general por ${activeMember.name}.`,
      personalNotes: {},
      addedByUserId: activeMember.id,
      addedByName: activeMember.name,
      addedByRole: activeMember.role,
      addedAt: 'Justo ahora',
      voiceNotes: [],
    });

    setNewTitle('');
    setNewArtist('');
    setNewSpotifyUrl('');
    setNewGroupNotes('');
    setNewImageDataUrl('');
    setNewFileName('');
    setShowAddModal(false);
  };

  const handleSaveActiveEventSpotifyPlaylist = (urlToSave?: string) => {
    if (!activeEventList || !onUpdateEvent) return;
    const finalUrl = (urlToSave !== undefined ? urlToSave : eventSpotifyDraft).trim();
    onUpdateEvent({
      ...activeEventList,
      spotifyPlaylistUrl: finalUrl || undefined,
    });
    setEventSpotifyDraft(finalUrl);
    setIsEditingEventSpotify(false);
    setEventSpotifySavedNotice('Playlist de Spotify vinculada a este culto');
    window.setTimeout(() => setEventSpotifySavedNotice(''), 3000);
  };

  const toggleSongInActiveEventPlaylist = (song: Song) => {
    if (!activeEventList || !isLeader) return;
    const exists = activeEventList.songs.some((item) => item.songId === song.id);
    const updatedSongs: EventSongItem[] = exists
      ? activeEventList.songs.filter((item) => item.songId !== song.id)
      : [
          ...activeEventList.songs,
          {
            songId: song.id,
            customKey: song.originalKey,
            vocalLeader: activeMember.name,
          },
        ];
    onUpdateEventPlaylist(activeEventList.id, updatedSongs);
  };

  const updateSongWeeklyKeyInEventPlaylist = (
    songId: string,
    newCustomKey: string
  ) => {
    if (!activeEventList) return;
    const updatedSongs = activeEventList.songs.map((item) =>
      item.songId === songId ? { ...item, customKey: newCustomKey } : item
    );
    onUpdateEventPlaylist(activeEventList.id, updatedSongs);
    if (activeSong && activeSong.id === songId) {
      setSemitones(computeSemitoneDiff(activeSong.originalKey, newCustomKey));
    }
  };

  const handleMovePlaylistSong = (index: number, direction: -1 | 1) => {
    if (!activeEventList || !isLeader) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeEventList.songs.length) return;
    const copy = [...activeEventList.songs];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    onUpdateEventPlaylist(activeEventList.id, copy);
  };

  const handleOpenEditSongModal = (targetSong?: Song) => {
    const s = targetSong || activeSong;
    if (!s) return;
    if (targetSong) {
      setSelectedSongId(targetSong.id);
    }
    setEditSongTitle(s.title);
    setEditSongArtist(s.artist);
    setEditSongKey(s.originalKey);
    setEditSongBpm(s.bpm);
    setEditSongTimeSig(s.timeSignature);
    setEditSongStyle(s.style);
    setEditSongSpotifyUrl(s.spotifyUrl || 'https://open.spotify.com');
    setShowEditSongModal(true);
  };

  const handleSaveEditedSongMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSong || !editSongTitle.trim()) return;
    onUpdateSong({
      ...activeSong,
      title: editSongTitle.trim(),
      artist: editSongArtist.trim() || 'jesustone Worship',
      originalKey: editSongKey,
      bpm: Number(editSongBpm) || 75,
      timeSignature: editSongTimeSig,
      style: editSongStyle,
      spotifyUrl: editSongSpotifyUrl.trim() || 'https://open.spotify.com',
    });
    setSongMetronomeBpm(Number(editSongBpm) || 75);
    setShowEditSongModal(false);
    setNotesSavedFeedback('Datos de la canción actualizados correctamente');
    window.setTimeout(() => setNotesSavedFeedback(''), 3000);
  };

  const beatsPerBar = activeSong
    ? getBeatsCountFromTimeSignature(activeSong.timeSignature)
    : 4;

  const stageFontClass =
    stageFontSize === 'sm'
      ? 'text-sm sm:text-base'
      : stageFontSize === 'base'
      ? 'text-base sm:text-lg'
      : stageFontSize === 'lg'
      ? 'text-lg sm:text-xl'
      : 'text-xl sm:text-2xl';

  // Helper to filter lines when lyricsOnly mode is enabled (for vocalists)
  const renderSheetLines = (text: string, isStage: boolean) => {
    const rawLines = text.split('\n');
    const filteredLines: { line: string; isSectionHeader: boolean; chordLine: boolean }[] = [];

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      const isSectionHeader = /^\[.*\]$/.test(trimmed);
      const chordLine = !isSectionHeader && isChordLine(rawLine);

      if (lyricsOnly && chordLine) {
        continue;
      }

      // Collapse consecutive empty lines in lyricsOnly mode
      if (
        lyricsOnly &&
        trimmed === '' &&
        filteredLines.length > 0 &&
        filteredLines[filteredLines.length - 1].line.trim() === ''
      ) {
        continue;
      }

      filteredLines.push({
        line: rawLine,
        isSectionHeader,
        chordLine,
      });
    }

    return filteredLines.map((item, idx) => (
      <div
        key={idx}
        className={`whitespace-pre ${
          item.isSectionHeader
            ? isStage
              ? 'mt-8 mb-2 font-sans font-extrabold text-sm sm:text-base uppercase tracking-widest text-amber-400 bg-amber-500/10 inline-block px-3 py-1 rounded-lg'
              : 'mt-4 mb-1 font-sans font-bold text-xs uppercase tracking-wider text-amber-500 dark:text-amber-400 bg-amber-500/10 inline-block px-2.5 py-0.5 rounded-md'
            : item.chordLine
            ? isStage
              ? 'font-extrabold text-emerald-400 mt-3'
              : `font-bold ${accent.textClass} mt-1`
            : isStage
            ? 'text-slate-100'
            : 'text-slate-800 dark:text-slate-200'
        }`}
      >
        {item.line || ' '}
      </div>
    ));
  };

  return (
    <div className="space-y-6 w-full max-w-full min-w-0">
      {/* =====================================================================
          MODO ESCENARIO / ATRIL A PANTALLA COMPLETA (CON AUTO-SCROLL, CLIC EN VIVO, SOLO LETRA Y ESTRUCTURA)
         ===================================================================== */}
      {isStageMode && activeSong && (
        <div className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden">
          {/* Barra Superior del Modo Escenario */}
          <header className="px-4 sm:px-6 py-3 bg-neutral-950 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`px-3 py-1.5 rounded-xl font-mono text-sm font-bold ${accent.bgClass}`}
              >
                Tono: {currentKeyDisplay}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    Modo Escenario / Atril
                  </span>
                  {activeEventList && (
                    <span className="text-[11px] text-slate-400 truncate">
                      · Playlist: {activeEventList.title} (
                      {currentSongIndexInList + 1}/{filteredSongs.length})
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-xl font-bold text-white truncate">
                  {activeSong.title} —{' '}
                  <span className="text-slate-400 font-normal text-sm">
                    {activeSong.artist}
                  </span>
                </h2>
              </div>
            </div>

            {/* Controles Rápidos en Vivo: Solo Letra + Metrónomo + Auto-Scroll + Tono + Letra + Salir */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Toggle Modo Solo Letra (Voces) vs Acordes + Letra */}
              <button
                type="button"
                onClick={() => setLyricsOnly(!lyricsOnly)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                  lyricsOnly
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-neutral-900 text-neutral-200 border-neutral-700 hover:bg-neutral-800'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{lyricsOnly ? 'Vista: Solo Letra (Voces)' : 'Modo Solo Letra'}</span>
              </button>

              {/* Metrónomo integrado en Modo Escenario */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-neutral-900 border border-neutral-800">
                <button
                  type="button"
                  onClick={() =>
                    setIsSongMetronomePlaying(!isSongMetronomePlaying)
                  }
                  className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isSongMetronomePlaying
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-500 text-slate-950'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>
                    {isSongMetronomePlaying
                      ? 'Detener Clic'
                      : `Clic ${songMetronomeBpm} BPM`}
                  </span>
                </button>
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: beatsPerBar }).map((_, bIdx) => {
                    const activeBeat =
                      isSongMetronomePlaying && currentBeat === bIdx + 1;
                    return (
                      <span
                        key={bIdx}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${
                          activeBeat
                            ? bIdx === 0
                              ? 'bg-amber-400 scale-125 shadow-sm shadow-amber-400'
                              : 'bg-emerald-400 scale-110'
                            : 'bg-slate-600'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Control de Auto-Scroll */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-neutral-900 border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    isAutoScrolling
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-neutral-800 text-slate-200'
                  }`}
                >
                  {isAutoScrolling ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>Auto-Scroll</span>
                </button>
                {[
                  { spd: 0.3, label: '0.3x' },
                  { spd: 0.5, label: '0.5x' },
                  { spd: 0.6, label: '0.6x' },
                  { spd: 0.8, label: '0.8x' },
                  { spd: 1.0, label: '1x' },
                  { spd: 1.4, label: '1.4x' },
                ].map(({ spd, label }) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setAutoScrollSpeed(spd)}
                    className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold ${
                      autoScrollSpeed === spd
                        ? 'bg-white text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Transposición rápida en escenario */}
              {!lyricsOnly && (
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-neutral-900 border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setSemitones((s) => s - 1)}
                    className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-bold"
                  >
                    -1
                  </button>
                  <span className="px-2 font-mono text-xs font-bold text-amber-400">
                    {currentKeyDisplay}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSemitones((s) => s + 1)}
                    className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-mono font-bold"
                  >
                    +1
                  </button>
                </div>
              )}

              {/* Tamaño de fuente */}
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-neutral-900 border border-neutral-800">
                <Type className="w-3.5 h-3.5 text-slate-400 mr-1" />
                {(
                  [
                    { id: 'sm', label: 'A-' },
                    { id: 'base', label: 'A' },
                    { id: 'lg', label: 'A+' },
                    { id: 'xl', label: 'A++' },
                  ] as const
                ).map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setStageFontSize(sz.id)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold ${
                      stageFontSize === sz.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsAutoScrolling(false);
                  setIsStageMode(false);
                }}
                className="min-h-[40px] px-4 py-1.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white flex items-center gap-1.5"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Salir de Atril</span>
              </button>
            </div>
          </header>

          {/* Cuerpo Principal del Atril (OLED Black Alto Contraste) */}
          <div
            ref={stageScrollContainerRef}
            className="flex-1 overflow-y-auto px-6 sm:px-12 py-6 max-w-5xl w-full mx-auto space-y-5"
          >
            {/* Mapa de Estructura de la Canción en Escenario */}
            {activeSongStructure.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
                  Estructura / Orden de Secciones:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeSongStructure.map((sec, idx) => (
                    <React.Fragment key={`${sec}-${idx}`}>
                      <span
                        className={`px-2.5 py-1 rounded-xl border text-xs font-bold ${getSectionBadgeColors(
                          sec
                        )}`}
                      >
                        <span className="font-mono opacity-70 mr-1">{idx + 1}.</span>
                        {sec}
                      </span>
                      {idx < activeSongStructure.length - 1 && (
                        <span className="text-neutral-600 font-bold text-xs">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Notas Grupales y Nota Personal en Escenario (si existen) */}
            {((activeSong.groupNotes || activeSong.notes) ||
              activeSong.personalNotes?.[activeMember.id]) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(activeSong.groupNotes || activeSong.notes) && (
                  <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-xs">
                    <span className="font-bold text-amber-400 uppercase tracking-wider block mb-0.5">
                      Nota Grupal de la Banda:
                    </span>
                    <p className="text-neutral-200">
                      {activeSong.groupNotes || activeSong.notes}
                    </p>
                  </div>
                )}
                {activeSong.personalNotes?.[activeMember.id] && (
                  <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-xs">
                    <span className="font-bold text-emerald-400 uppercase tracking-wider block mb-0.5">
                      Mi Nota Personal ({activeMember.name}):
                    </span>
                    <p className="text-emerald-100">
                      {activeSong.personalNotes[activeMember.id]}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Letra (con o sin Acordes según Modo Solo Letra) en tamaño de Atril */}
            <div className={`font-mono leading-relaxed ${stageFontClass} pb-32`}>
              {renderSheetLines(transposedText, true)}
            </div>
          </div>

          {/* Barra Inferior de Navegación Fluida del Setlist / Playlist en Escenario */}
          <footer className="px-4 sm:px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              disabled={filteredSongs.length <= 1}
              onClick={() => handleNavigatePlaylist('prev')}
              className="min-h-[46px] px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs sm:text-sm font-bold text-white flex items-center gap-2 shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Anterior Canción</span>
            </button>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {filteredSongs.map((s, idx) => {
                const isCurrent = s.id === activeSong.id;
                const evItem = activeEventList?.songs.find(
                  (i) => i.songId === s.id
                );
                const keyBadge = evItem?.customKey || s.originalKey;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSongWithContextKey(s)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                      isCurrent
                        ? `${accent.bgClass} shadow-md`
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono opacity-80">0{idx + 1}.</span>
                    <span>{s.title}</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/25 font-mono text-[11px]">
                      {keyBadge}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={filteredSongs.length <= 1}
              onClick={() => handleNavigatePlaylist('next')}
              className={`min-h-[46px] px-5 py-2 rounded-2xl disabled:opacity-40 text-xs sm:text-sm font-bold flex items-center gap-2 shrink-0 ${accent.bgClass}`}
            >
              <span>Siguiente Canción</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </footer>
        </div>
      )}

      {/* =======================================================================
          PANTALLA DE LA CANCIÓN EN MODO DE VISTA GRANDE DEDICADA
         ======================================================================= */}
      {openedSongId && activeSong ? (
        <div className="space-y-4 w-full max-w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setOpenedSongId(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors shadow-xs"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" />
              <span>
                {activeSubView === 'setlists' && activeEventList
                  ? `Volver a Setlists («${activeEventList.title}»)`
                  : 'Volver al Repertorio Base'}
              </span>
            </button>

            <div className="flex items-center gap-2">
              {filteredSongs.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleNavigatePlaylist('prev')}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Anterior</span>
                  </button>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 px-1">
                    {currentSongIndexInList + 1} de {filteredSongs.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNavigatePlaylist('next')}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                  >
                    <span className="hidden sm:inline">Siguiente</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6 w-full max-w-full min-w-0">
            {/* Cabecera de la Canción + Botón Grande de Modo Escenario / Atril */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`font-bold ${accent.textClass}`}>
                    {activeSong.style}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Tono Base: <strong>{activeSong.originalKey}</strong>
                  </span>
                  {activeEventSongItem?.customKey && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono font-bold">
                        Tono esta Semana: {activeEventSongItem.customKey}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{activeSong.bpm} BPM</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Compás {activeSong.timeSignature}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {activeSong.title}
                </h2>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1">
                  <User className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    Subida por <strong>{activeSong.addedByName}</strong> (
                    {activeSong.addedByRole === 'leader' ? 'Líder / Admin' : 'Miembro'})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeSong.addedAt}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsStageMode(true)}
                  className={`min-h-[46px] px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-md transition-transform active:scale-95 ${accent.bgClass}`}
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Modo Escenario / Atril</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenMetronomeWithSong(activeSong.bpm, activeSong.timeSignature)
                  }
                  className="min-h-[46px] flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-amber-500/50 transition-colors"
                  title="Abrir en pantalla completa de Herramientas"
                >
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span className="hidden sm:inline">Herramienta Metrónomo</span>
                </button>

                {(isLeader || activeSong.addedByUserId === activeMember.id) && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenEditSongModal()}
                      className="min-h-[46px] flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-amber-500/50 transition-colors"
                      title="Editar datos base de la canción"
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-500" />
                      <span>Editar Datos</span>
                    </button>

                    {onDeleteSong && (
                      confirmDeleteSongId === activeSong.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/40 px-3 py-1.5 rounded-2xl">
                          <span className="text-[11px] font-bold text-rose-500">
                            ¿Eliminar?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteSong(activeSong.id);
                              setConfirmDeleteSongId(null);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-xs font-bold"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSongId(null)}
                            className="px-2 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSongId(activeSong.id)}
                          className="min-h-[46px] flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                          title="Eliminar canción del repertorio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ===============================================================
                METRÓNOMO INTEGRADO DENTRO DE LA CANCIÓN (SIN SALIR DEL CANCIONERO)
               =============================================================== */}
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setIsSongMetronomePlaying(!isSongMetronomePlaying)
                  }
                  className={`min-h-[48px] px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm transition-all ${
                    isSongMetronomePlaying
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-950'
                  }`}
                >
                  {isSongMetronomePlaying ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      <span>Detener Clic</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4 text-amber-400 dark:text-amber-600" />
                      <span>Iniciar Metrónomo Aquí</span>
                    </>
                  )}
                </button>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      {songMetronomeBpm} BPM · Compás {activeSong.timeSignature}
                    </span>
                    {songMetronomeBpm !== activeSong.bpm && (
                      <button
                        type="button"
                        onClick={() => setSongMetronomeBpm(activeSong.bpm)}
                        className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        Restaurar ({activeSong.bpm})
                      </button>
                    )}
                  </div>
                  {/* Indicadores visuales de pulso */}
                  <div className="flex items-center gap-2 mt-1.5">
                    {Array.from({ length: beatsPerBar }).map((_, bIdx) => {
                      const isBeatActive =
                        isSongMetronomePlaying && currentBeat === bIdx + 1;
                      return (
                        <div
                          key={bIdx}
                          className={`px-2.5 py-0.5 rounded-lg font-mono text-[11px] font-bold transition-all ${
                            isBeatActive
                              ? bIdx === 0
                                ? 'bg-amber-500 text-slate-950 scale-105 shadow-xs'
                                : 'bg-emerald-500 text-slate-950 scale-105'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {bIdx + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Ajuste rápido de BPM dentro de la canción */}
              <div className="flex items-center gap-1.5 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() =>
                    setSongMetronomeBpm((b) => Math.max(30, b - 5))
                  }
                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSongMetronomeBpm((b) => Math.max(30, b - 1))
                  }
                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSongMetronomeBpm((b) => Math.min(250, b + 1))
                  }
                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSongMetronomeBpm((b) => Math.min(250, b + 5))
                  }
                  className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                >
                  +5
                </button>
              </div>
            </div>

            {/* Controles Grandes de Transposición + Guardar Tonalidad por Semana/Evento */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSemitones((s) => s - 1)}
                    className="min-h-[46px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1"
                  >
                    <Minus className="w-4 h-4" />1 Semitono
                  </button>

                  <div className="min-h-[46px] px-4 py-2 rounded-xl bg-slate-900 text-white font-mono text-xs sm:text-sm font-bold flex items-center gap-2">
                    <span>Tono Actual: {currentKeyDisplay}</span>
                    {currentKey !== activeSong.originalKey && (
                      <span className="text-[11px] text-amber-400">
                        (Base: {activeSong.originalKey})
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSemitones((s) => s + 1)}
                    className="min-h-[46px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />1 Semitono
                  </button>

                  {semitones !== 0 && (
                    <button
                      type="button"
                      onClick={() => setSemitones(0)}
                      className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Tono Base ({activeSong.originalKey})
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setUseSolfege(!useSolfege)}
                  className="min-h-[46px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  {useSolfege ? 'Notación: Do, Re, Mi' : 'Cifrado: C, D, E'}
                </button>
              </div>

              {/* Asignar Tonalidad para la Semana / Evento sin alterar su Tono Base */}
              {events.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Tonalidad por Semana / Evento:
                    </span>{' '}
                    Guarda <strong>{currentKey}</strong> para un servicio específico sin cambiar el tono normal ({activeSong.originalKey}).
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeEventList ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveKeyForActiveEvent(activeEventList.id)
                        }
                        className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                      >
                        <BookmarkCheck className="w-4 h-4" />
                        <span>
                          Guardar Tono ({currentKey}) para «{activeEventList.title}»
                        </span>
                      </button>
                    ) : (
                      events.slice(0, 2).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => handleSaveKeyForActiveEvent(ev.id)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-amber-500 flex items-center gap-1.5"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                          <span>
                            Usar {currentKey} en {ev.title} ({ev.date})
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {savedWeeklyKeyNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{savedWeeklyKeyNotice}</span>
                </div>
              )}
            </div>

            {/* Selector de Vista: 1) Acordes + Letra · 2) Modo Solo Letra (Voces) · 3) Archivo / Hoja */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setViewFormat('text');
                  setLyricsOnly(false);
                }}
                className={`min-h-[52px] p-3 rounded-2xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  viewFormat === 'text' && !lyricsOnly
                    ? `${accent.bgClass} border-transparent shadow-sm`
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Acordes + Letra</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewFormat('text');
                  setLyricsOnly(true);
                }}
                className={`min-h-[52px] p-3 rounded-2xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  viewFormat === 'text' && lyricsOnly
                    ? 'bg-amber-500 text-slate-950 border-transparent shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Modo Solo Letra (Voces)</span>
              </button>

              <button
                type="button"
                onClick={() => setViewFormat('image')}
                className={`min-h-[52px] p-3 rounded-2xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  viewFormat === 'image'
                    ? `${accent.bgClass} border-transparent shadow-sm`
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>Archivo / Hoja</span>
              </button>
            </div>

            {/* ===============================================================
                APARTADO DE ESTRUCTURA DE LA CANCIÓN (ORDEN DE LAS SECCIONES)
               =============================================================== */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 text-white border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <ListMusic className="w-4 h-4" />
                    <span>Estructura / Orden de las Secciones</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Mapa del orden en que se toca la canción (Intro, Versos, Coros, Repeticiones, Puente y Final)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStructureDraft(activeSongStructure);
                    setIsEditingStructure(!isEditingStructure);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-amber-300"
                >
                  {isEditingStructure ? 'Cancelar' : 'Editar Estructura'}
                </button>
              </div>

              {!isEditingStructure ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {activeSongStructure.map((sec, idx) => (
                    <React.Fragment key={`${sec}-${idx}`}>
                      <span
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${getSectionBadgeColors(
                          sec
                        )}`}
                      >
                        <span className="font-mono opacity-75 mr-1">
                          {idx + 1}.
                        </span>
                        {sec}
                      </span>
                      {idx < activeSongStructure.length - 1 && (
                        <span className="text-slate-600 font-bold text-xs">
                          →
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  {/* Botones rápidos para añadir secciones */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Toca para añadir una sección al final del orden:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setStructureDraft(
                            extractStructureFromLyrics(activeSong.lyricsAndChords)
                          )
                        }
                        className="text-amber-400 hover:underline font-semibold"
                      >
                        Detectar de la letra
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SECTION_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleAddSectionToDraft(preset)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input personalizado para secciones o repeticiones especiales */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customSectionInput}
                      onChange={(e) => setCustomSectionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSectionToDraft(customSectionInput);
                        }
                      }}
                      placeholder="Sección personalizada (ej. Puente Suave x3, Solo Guitarra, Coro sin batería)..."
                      className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSectionToDraft(customSectionInput)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold ${accent.bgClass}`}
                    >
                      + Agregar
                    </button>
                  </div>

                  {/* Orden actual editable (mover o eliminar bloques) */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {structureDraft.map((sec, idx) => (
                      <div
                        key={`${sec}-${idx}`}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-bold ${getSectionBadgeColors(
                          sec
                        )}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleMoveSectionInDraft(idx, -1)}
                          disabled={idx === 0}
                          className="opacity-70 hover:opacity-100 disabled:opacity-25 px-0.5"
                          title="Mover antes"
                        >
                          ←
                        </button>
                        <span>
                          {idx + 1}. {sec}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMoveSectionInDraft(idx, 1)}
                          disabled={idx === structureDraft.length - 1}
                          className="opacity-70 hover:opacity-100 disabled:opacity-25 px-0.5"
                          title="Mover después"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSectionFromDraft(idx)}
                          className="ml-1 text-rose-400 hover:text-rose-300 font-bold"
                          title="Quitar sección"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setStructureDraft([])}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Limpiar todo
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveStructure}
                      className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold ${accent.bgClass}`}
                    >
                      Guardar Estructura de la Canción
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Botón directo para Escuchar en Spotify */}
            {activeSong.spotifyUrl && (
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Music2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {activeSong.title}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {activeSong.artist}
                    </p>
                  </div>
                </div>

                <a
                  href={activeSong.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>Escuchar en Spotify</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {viewFormat === 'text' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {lyricsOnly
                      ? 'Modo Solo Letra activo: Acordes ocultos para lectura limpia de voces'
                      : 'Letra y acordes compartidos con todo el grupo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditedLyrics(activeSong.lyricsAndChords);
                      setIsEditingLyrics(!isEditingLyrics);
                    }}
                    className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {isEditingLyrics ? 'Cancelar edición' : 'Editar letra / acordes'}
                  </button>
                </div>

                {isEditingLyrics ? (
                  <div className="space-y-3">
                    <textarea
                      rows={14}
                      value={editedLyrics}
                      onChange={(e) => setEditedLyrics(e.target.value)}
                      className="w-full p-4 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveEditedLyrics}
                        className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                      >
                        Guardar Cambios para Todos
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 sm:p-6 rounded-2xl bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto min-w-0 max-w-full">
                    {renderSheetLines(transposedText, false)}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Archivo compartido: <strong>{activeSong.attachedFileName || 'Partitura.svg'}</strong> (Subido por {activeSong.addedByName})
                  </p>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImageForActiveSong}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                    >
                      <Upload className="w-4 h-4" />
                      Actualizar Imagen / Archivo de Acordes
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-3 flex items-center justify-center">
                  <img
                    src={
                      activeSong.chordSheetImageUrl ||
                      generateLeadSheetSVGDataUrl(
                        activeSong.title,
                        activeSong.artist,
                        currentKey,
                        activeSong.bpm,
                        activeSong.timeSignature,
                        transposedPreviewChords
                      )
                    }
                    alt={`Archivo de acordes de ${activeSong.title}`}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[540px] object-contain rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* ===============================================================
                SECCIÓN DE NOTAS GRUPALES Y NOTAS PERSONALES DE LA CANCIÓN
               =============================================================== */}
            <div className="space-y-3">
              {notesSavedFeedback && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{notesSavedFeedback}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tarjeta 1: Notas Grupales de la Canción (Visibles para toda la banda) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className={`w-4 h-4 ${accent.textClass}`} />
                        <span>Notas Grupales de la Canción</span>
                      </h3>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                        Para todo el grupo
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Indicaciones generales de entrada, cortes, dinámicas o arreglos que ve toda la banda.
                    </p>
                    <textarea
                      rows={3}
                      value={groupNotesDraft}
                      onChange={(e) => setGroupNotesDraft(e.target.value)}
                      placeholder="Ej. Entramos solo piano y voz en Verso 1; batería entra en el Coro; en el Puente subir intensidad..."
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveSongGroupNotes}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Nota Grupal</span>
                    </button>
                  </div>
                </div>

                {/* Tarjeta 2: Mis Notas Personales en esta Canción (Privadas por integrante) */}
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/25 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <User className="w-4 h-4 text-emerald-500" />
                        <span>Mis Notas Personales ({activeMember.name})</span>
                      </h3>
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                        Solo para ti
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tus apuntes privados para esta canción (efectos, segunda voz, capo, recordatorios tuyos).
                    </p>
                    <textarea
                      rows={3}
                      value={personalNotesDraft}
                      onChange={(e) => setPersonalNotesDraft(e.target.value)}
                      placeholder="Escribe aquí tus apuntes personales de esta canción (nadie más modificará tu nota)..."
                      className="w-full p-3 rounded-xl border border-emerald-500/30 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveSongPersonalNotes}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Mi Nota Personal</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ===============================================================
                SECCIÓN DE NOTAS DE VOZ Y CLIPS DE AUDIO DE LA CANCIÓN
               =============================================================== */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Mic className={`w-4 h-4 ${accent.textClass}`} />
                    Notas de Voz y Clips de Arreglos ({activeSong.voiceNotes?.length || 0})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Graba o adjunta ideas de voces, arreglos de intro, cortes o guías para esta canción.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={voiceFileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleUploadVoiceAudioFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => voiceFileInputRef.current?.click()}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir Audio</span>
                  </button>
                </div>
              </div>

              {/* Grabadora de Nota de Voz en Vivo */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  type="text"
                  value={voiceNoteTitle}
                  onChange={(e) => setVoiceNoteTitle(e.target.value)}
                  placeholder="Título del clip (ej. Arreglo segunda voz en coro, Intro guitarra)..."
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white"
                />

                {!isRecordingVoiceNote ? (
                  <button
                    type="button"
                    onClick={handleStartRecordingVoiceNote}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shrink-0 ${accent.bgClass}`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>Grabar Nota de Voz</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopAndSaveVoiceNote}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 shrink-0 animate-pulse"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Detener y Guardar ({recordingSeconds}s)</span>
                  </button>
                )}
              </div>

              {/* Lista de Notas de Voz grabadas en esta canción */}
              {(activeSong.voiceNotes || []).length > 0 && (
                <div className="space-y-2.5 pt-2">
                  {(activeSong.voiceNotes || []).map((vn) => (
                    <div
                      key={vn.id}
                      className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {vn.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Grabado por <strong>{vn.authorName}</strong> ·{' '}
                          {vn.durationSec}s · {vn.createdAt}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <audio
                          controls
                          src={vn.audioDataUrl}
                          className="h-9 max-w-[220px] sm:max-w-[250px]"
                        />
                        {(isLeader || vn.authorId === activeMember.id) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteVoiceNote(vn.id)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-500"
                            title="Eliminar nota de voz"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Barra Inferior para Volver Cómodamente desde la Vista Grande */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setOpenedSongId(null);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" />
              <span>
                {activeSubView === 'setlists' && activeEventList
                  ? `Volver a Setlists («${activeEventList.title}»)`
                  : 'Volver al Repertorio Base'}
              </span>
            </button>

            {filteredSongs.length > 1 && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleNavigatePlaylist('prev');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200"
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleNavigatePlaylist('next');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex-1 sm:flex-initial min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =======================================================================
            PANTALLAS PRINCIPALES DEL CANCIONERO (REPERTORIO BASE Y SETLISTS)
           ======================================================================= */
        <div className="space-y-5 w-full max-w-full min-w-0">
          {/* Cabecera con Pestañas Dedicadas: Repertorio Base vs Setlists */}
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Music2 className={`w-5 h-5 ${accent.textClass}`} />
                  <span>Cancionero del Grupo</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Accede a la biblioteca central de alabanzas o revisa los setlists programados por culto y semana.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className={`min-h-[46px] px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-transform active:scale-[0.98] whitespace-nowrap shrink-0 ${accent.bgClass}`}
              >
                <Plus className="w-4 h-4" />
                <span>Subir Canción al Repertorio</span>
              </button>
            </div>

            {/* Selector de Pantallas Independientes */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => {
                  setActiveSubView('repertorio');
                  setSemitones(0);
                }}
                className={`min-h-[50px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  activeSubView === 'repertorio'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Music2 className="w-4 h-4 text-amber-500" />
                <span>Repertorio Base</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {songs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveSubView('setlists');
                  if (events[0]) {
                    setSelectedEventId(events[0].id);
                  }
                }}
                className={`min-h-[50px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  activeSubView === 'setlists'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FolderKanban className="w-4 h-4 text-emerald-500" />
                <span>Setlists de Eventos</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {events.length}
                </span>
              </button>
            </div>
          </div>

          {/* =======================================================================
              SUB-PANTALLA 1: REPERTORIO BASE
             ======================================================================= */}
          {activeSubView === 'repertorio' && (
            <div className="space-y-4">
              {/* Buscador y Filtros de Estilo */}
              <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por título, autor, tono base o quién la agregó..."
                    className="w-full min-h-[46px] pl-11 pr-10 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Chips de filtro por Estilo */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0 mr-1">
                    Estilo:
                  </span>
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'Adoración', label: 'Adoración' },
                    { id: 'Alabanza', label: 'Alabanza' },
                    { id: 'Especial', label: 'Especial' },
                    { id: 'Congregacional', label: 'Congregacional' },
                    { id: 'Júbilo', label: 'Júbilo' },
                  ].map((cat) => {
                    const active = selectedStyleFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedStyleFilter(cat.id)}
                        className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                          active
                            ? `${accent.bgClass} shadow-xs`
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contador */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span>
                  Mostrando <strong>{filteredSongs.length}</strong> de {songs.length} canciones en la biblioteca base
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-amber-500 hover:underline font-bold"
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>

              {/* Grid de Canciones del Repertorio Base */}
              {filteredSongs.length === 0 ? (
                <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                  <Music2 className="w-10 h-10 text-slate-400 mx-auto" />
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    No se encontraron canciones
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {searchQuery
                      ? `No hay coincidencias con «${searchQuery}». Intenta buscar con otro término.`
                      : 'El repertorio está vacío. Puedes subir la primera canción ahora.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedStyleFilter('all');
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold text-amber-500 hover:underline"
                  >
                    Restablecer filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full min-w-0 max-w-full">
                  {filteredSongs.map((song) => {
                    const canManageSong =
                      isLeader || song.addedByUserId === activeMember.id;

                    return (
                      <div
                        key={song.id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs w-full min-w-0 overflow-hidden"
                      >
                        {/* Bloque principal clicable para abrir directamente la canción grande */}
                        <button
                          type="button"
                          onClick={() => {
                            selectSongWithContextKey(song);
                            setOpenedSongId(song.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="w-full text-left flex items-start justify-between gap-3 min-w-0 group"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <h4 className="text-base font-bold text-slate-900 dark:text-white truncate group-hover:text-amber-500 transition-colors">
                              {song.title}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {song.artist}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 pt-0.5">
                              <span className={`font-semibold ${accent.textClass}`}>
                                {song.style}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{song.bpm} BPM</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{song.timeSignature}</span>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 inline-block">
                              {song.originalKey}
                            </span>
                          </div>
                        </button>

                        {/* Confirmación de eliminación o Botones de acción inmunes a desbordes en tablet */}
                        {confirmDeleteSongId === song.id ? (
                          <div className="w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 truncate">
                              ¿Eliminar «{song.title}»?
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteSong?.(song.id);
                                  setConfirmDeleteSongId(null);
                                }}
                                className="min-h-[34px] px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                              >
                                Sí, borrar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSongId(null)}
                                className="min-h-[34px] px-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold"
                              >
                                No
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 w-full min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                selectSongWithContextKey(song);
                                setOpenedSongId(song.id);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs min-w-0 truncate ${accent.bgClass}`}
                              title="Abrir vista grande de la canción"
                            >
                              <BookOpen className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">Ver Canción</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                selectSongWithContextKey(song);
                                setOpenedSongId(song.id);
                                setIsStageMode(true);
                              }}
                              className="min-h-[42px] w-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-white hover:bg-slate-900 dark:hover:bg-slate-700 text-xs font-bold flex items-center justify-center shrink-0"
                              title="Abrir directo en Modo Atril"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>

                            {canManageSong && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditSongModal(song)}
                                className="min-h-[42px] w-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-amber-500 text-xs font-bold flex items-center justify-center shrink-0"
                                title="Editar datos de la canción"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {canManageSong && onDeleteSong && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSongId(song.id)}
                                className="min-h-[42px] w-[42px] rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-bold flex items-center justify-center shrink-0"
                                title="Eliminar canción"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =======================================================================
              SUB-PANTALLA 2: SETLISTS DE EVENTOS
             ======================================================================= */}
          {activeSubView === 'setlists' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FolderKanban className={`w-4 h-4 ${accent.textClass}`} />
                    <span>Setlists Programados por Evento</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cada evento tiene su playlist organizada y su propia tonalidad semanal asignada para los ensayos y cultos.
                  </p>
                </div>

                {isLeader && activeEventList && (
                  <button
                    type="button"
                    onClick={() => setShowManagePlaylistModal(true)}
                    className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 ${accent.bgClass}`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Editar Playlist y Tonos Semanales</span>
                  </button>
                )}
              </div>

              {/* Selector simple y limpio de Eventos (Pills horizontales) */}
              {events.length === 0 ? (
                <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                  <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    No hay eventos programados
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Crea un evento en la sección de Eventos para poder armarle su playlist de alabanzas.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none w-full min-w-0">
                  {events.map((ev) => {
                    const isSelected = activeEventList?.id === ev.id;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSelectedEventId(ev.id)}
                        className={`px-4 py-2.5 rounded-2xl text-xs font-bold shrink-0 flex items-center gap-2 transition-all border min-h-[44px] ${
                          isSelected
                            ? `${accent.borderClass} ${accent.bgClass} shadow-sm`
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[200px]">{ev.title}</span>
                        <span className="font-mono text-[11px] opacity-75">({ev.date})</span>
                        <span className="ml-0.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/15 dark:bg-white/15">
                          {ev.songs.length} {ev.songs.length === 1 ? 'canción' : 'canciones'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Detalle del Setlist Activo */}
              {activeEventList && (
                <div className="space-y-4 pt-1">
                  {/* Banner de información, Spotify y atril */}
                  <div className="p-4 sm:p-5 rounded-3xl bg-slate-900 text-white border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400 font-mono font-bold">
                        <CalendarCheck className="w-4 h-4" />
                        <span>{activeEventList.date} · {activeEventList.time}</span>
                        <span>·</span>
                        <span>{activeEventList.location}</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold truncate text-white">
                        Setlist: {activeEventList.title}
                      </h3>
                      <p className="text-xs text-slate-300">
                        {activeEventList.songs.length} {activeEventList.songs.length === 1 ? 'canción' : 'canciones'} preparadas para este culto con su tonalidad semanal.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* Botón Escuchar Playlist en Spotify */}
                      {activeEventList.spotifyPlaylistUrl && (
                        <a
                          href={activeEventList.spotifyPlaylistUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-colors"
                          title="Abrir playlist en Spotify"
                        >
                          <Headphones className="w-4 h-4 text-black" />
                          <span>Escuchar en Spotify</span>
                        </a>
                      )}

                      {activeEventList.songs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const firstSong = songs.find(s => s.id === activeEventList.songs[0]?.songId);
                            if (firstSong) {
                              selectSongWithContextKey(firstSong, activeEventList);
                              setOpenedSongId(firstSong.id);
                              setIsStageMode(true);
                            }
                          }}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-white text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:bg-slate-100 transition-colors"
                        >
                          <Maximize2 className="w-4 h-4" />
                          <span>Modo Atril</span>
                        </button>
                      )}

                      {isLeader && (
                        <button
                          type="button"
                          onClick={() => setShowManagePlaylistModal(true)}
                          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md ${accent.bgClass}`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Gestionar Playlist</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Vinculación rápida de Spotify Playlist para el Líder */}
                  {isLeader && (
                    <div className="p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Headphones className="w-4 h-4 text-[#1DB954] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {activeEventList.spotifyPlaylistUrl
                              ? 'Playlist de Spotify Vinculada al Evento'
                              : 'Vincular Playlist de Spotify a este Evento'}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {activeEventList.spotifyPlaylistUrl ||
                              'Añade el enlace de Spotify para que la banda escuche la setlist completa'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isEditingEventSpotify ? (
                          <div className="flex items-center gap-1.5 w-full sm:w-auto">
                            <input
                              type="url"
                              value={eventSpotifyDraft}
                              onChange={(e) => setEventSpotifyDraft(e.target.value)}
                              placeholder="https://open.spotify.com/playlist/..."
                              className="min-h-[38px] px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white w-52 sm:w-64"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveActiveEventSpotifyPlaylist()}
                              className="min-h-[38px] px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingEventSpotify(false)}
                              className="min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-bold text-slate-500"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsEditingEventSpotify(true)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>
                              {activeEventList.spotifyPlaylistUrl
                                ? 'Cambiar Link Spotify'
                                : '+ Vincular Playlist'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {eventSpotifySavedNotice && (
                    <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ {eventSpotifySavedNotice}
                    </div>
                  )}

                  {/* Listado ordenado de canciones del setlist */}
                  {activeEventList.songs.length === 0 ? (
                    <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                      <FolderKanban className="w-10 h-10 text-slate-400 mx-auto" />
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        Aún no hay canciones en este setlist
                      </h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        {isLeader
                          ? 'Como líder puedes agregar canciones del repertorio base y ajustar la tonalidad para cada una.'
                          : 'El líder aún no ha agregado alabanzas a este evento. Puedes revisar el Repertorio Base.'}
                      </p>
                      {isLeader && (
                        <button
                          type="button"
                          onClick={() => setShowManagePlaylistModal(true)}
                          className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 ${accent.bgClass}`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>Armar Playlist de este Evento</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 w-full min-w-0 max-w-full">
                      {activeEventList.songs.map((item, idx) => {
                        const song = songs.find((s) => s.id === item.songId);
                        if (!song) return null;
                        const weeklyKey = item.customKey || song.originalKey;

                        return (
                          <div
                            key={`${item.songId}-${idx}`}
                            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs w-full min-w-0"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm shrink-0 ${accent.softBgClass} ${accent.textClass}`}>
                                {idx < 9 ? `0${idx + 1}` : idx + 1}
                              </div>

                              <div className="min-w-0 space-y-0.5">
                                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                                  {song.title}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {song.artist} · <span className="font-mono">{song.bpm} BPM</span> · <span className="font-mono">{song.timeSignature}</span> · {song.style}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
                              {/* Tono Semanal destacado */}
                              <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 font-mono text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <span>Tono: <strong>{weeklyKey}</strong></span>
                                {weeklyKey !== song.originalKey && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                                    (Base: {song.originalKey})
                                  </span>
                                )}
                              </div>

                              {/* Abrir Canción directamente a la pantalla grande */}
                              <button
                                type="button"
                                onClick={() => {
                                  selectSongWithContextKey(song, activeEventList);
                                  setOpenedSongId(song.id);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>Abrir Canción</span>
                              </button>

                              {/* Abrir directo en Atril */}
                              <button
                                type="button"
                                onClick={() => {
                                  selectSongWithContextKey(song, activeEventList);
                                  setOpenedSongId(song.id);
                                  setIsStageMode(true);
                                }}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-900 hover:text-white"
                                title="Abrir directo en Modo Atril"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Atril</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: AGREGAR CANCIÓN AL REPERTORIO BASE (Líder y Miembros) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Subir Canción y Archivo al Repertorio del Grupo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Se registrará que fue agregada por <strong>{activeMember.name}</strong> ({activeMember.role === 'leader' ? 'Líder / Admin' : 'Miembro'}) y todos podrán verla.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewSong} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título de la Canción
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ej. Cordero y León"
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Artista / Versión de Referencia
                  </label>
                  <input
                    type="text"
                    value={newArtist}
                    onChange={(e) => setNewArtist(e.target.value)}
                    placeholder="Ej. jesustone Worship"
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tonalidad Normal (Base)
                  </label>
                  <select
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  >
                    <optgroup label="Tonalidades Mayores">
                      {MAJOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k} Mayor
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Tonalidades Menores">
                      {MINOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k} ({k.replace(/m$/, '')} Menor)
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    BPM
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={250}
                    value={newBpm}
                    onChange={(e) => setNewBpm(Number(e.target.value))}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Compás
                  </label>
                  <select
                    value={newTimeSig}
                    onChange={(e) => setNewTimeSig(e.target.value as TimeSignature)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
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
                    onChange={(e) => setNewStyle(e.target.value as Song['style'])}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Adoración">Adoración</option>
                    <option value="Alabanza / Júbilo">Alabanza / Júbilo</option>
                    <option value="Intimidad">Intimidad</option>
                    <option value="Congregacional">Congregacional</option>
                  </select>
                </div>
              </div>

              {/* Estructura de la Canción al crearla */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Estructura / Orden de las Secciones
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SECTION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setNewStructure((prev) => [...prev, preset])
                      }
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCustomSection}
                    onChange={(e) => setNewCustomSection(e.target.value)}
                    placeholder="Otra sección (ej. Puente x3, Solo Batería)..."
                    className="flex-1 min-h-[38px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newCustomSection.trim()) {
                        setNewStructure((prev) => [
                          ...prev,
                          newCustomSection.trim(),
                        ]);
                        setNewCustomSection('');
                      }
                    }}
                    className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold ${accent.bgClass}`}
                  >
                    + Añadir
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {newStructure.map((sec, idx) => (
                    <span
                      key={`${sec}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 text-amber-300 text-xs font-bold"
                    >
                      <span>
                        {idx + 1}. {sec}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewStructure((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-rose-400 hover:text-rose-300 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Letra y Acordes en Texto
                </label>
                <textarea
                  rows={6}
                  value={newLyrics}
                  onChange={(e) => setNewLyrics(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 text-emerald-500" />
                  Enlace de Referencia de Spotify (Opcional)
                </label>
                <input
                  type="url"
                  value={newSpotifyUrl}
                  onChange={(e) => setNewSpotifyUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/... o link a la canción en Spotify"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Notas Grupales de la Canción (Opcional — para toda la banda)
                </label>
                <input
                  type="text"
                  value={newGroupNotes}
                  onChange={(e) => setNewGroupNotes(e.target.value)}
                  placeholder="Ej. Empieza solo acústica; en el coro 2 entran todos con fuerza..."
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subir Archivo / Imagen de Partitura o Acordes (Visible para todos)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setNewFileName(f.name);
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setNewImageDataUrl(reader.result);
                        }
                      };
                      reader.readAsDataURL(f);
                    }
                  }}
                  className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-200 dark:file:bg-slate-800 file:text-slate-800 dark:file:text-slate-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[46px] px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[46px] px-6 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Publicar Canción en el Repertorio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DEL LÍDER: ARMAR PLAYLIST DE EVENTO Y ELEGIR TONALIDAD POR SEMANA */}
      {showManagePlaylistModal && activeEventList && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Playlist y Tonos de la Semana: {activeEventList.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Selecciona canciones del Repertorio y asigna la tonalidad en que se tocarán este evento
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

            {/* Vinculación de Playlist de Spotify del Evento */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-emerald-500" />
                Playlist de Spotify de este Culto/Evento (para el grupo)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={eventSpotifyDraft}
                  onChange={(e) => setEventSpotifyDraft(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/... (para escuchar la setlist completa)"
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
                {onUpdateEvent && (
                  <button
                    type="button"
                    onClick={() => handleSaveActiveEventSpotifyPlaylist()}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0"
                  >
                    Guardar Link
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto">
              {activeEventList.songs.length > 1 && (
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Orden Actual de la Playlist (Usa ↑ / ↓ para reordenar):
                  </span>
                  <div className="space-y-1.5">
                    {activeEventList.songs.map((item, sIdx) => {
                      const sObj = songs.find((x) => x.id === item.songId);
                      if (!sObj) return null;
                      return (
                        <div
                          key={`${item.songId}-${sIdx}`}
                          className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {sIdx + 1}. {sObj.title} ({item.customKey || sObj.originalKey})
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={sIdx === 0}
                              onClick={() => handleMovePlaylistSong(sIdx, -1)}
                              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={sIdx === activeEventList.songs.length - 1}
                              onClick={() => handleMovePlaylistSong(sIdx, 1)}
                              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {songs.map((song) => {
                const eventItem = activeEventList.songs.find(
                  (item) => item.songId === song.id
                );
                const included = Boolean(eventItem);
                return (
                  <div
                    key={song.id}
                    className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      included
                        ? `${accent.borderClass} ${accent.softBgClass}`
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSongInActiveEventPlaylist(song)}
                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          included
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        }`}
                      >
                        {included ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {song.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tono Normal Base: <strong>{song.originalKey}</strong> ·{' '}
                          {song.bpm} BPM
                        </p>
                      </div>
                    </button>

                    {included && eventItem && (
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Tono esta semana:
                        </span>
                        <select
                          value={eventItem.customKey || song.originalKey}
                          onChange={(e) =>
                            updateSongWeeklyKeyInEventPlaylist(
                              song.id,
                              e.target.value
                            )
                          }
                          className="min-h-[38px] px-2.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold text-slate-900 dark:text-white"
                        >
                          <optgroup label="Tonalidades Mayores">
                            {MAJOR_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {k} Mayor {k === song.originalKey ? '(Base)' : ''}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Tonalidades Menores">
                            {MINOR_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {k} ({k.replace(/m$/, '')}m) {k === song.originalKey ? '(Base)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                if (
                  activeEventList &&
                  onUpdateEvent &&
                  eventSpotifyDraft !== (activeEventList.spotifyPlaylistUrl || '')
                ) {
                  handleSaveActiveEventSpotifyPlaylist();
                }
                setShowManagePlaylistModal(false);
              }}
              className={`w-full min-h-[48px] rounded-2xl text-sm font-bold ${accent.bgClass}`}
            >
              Listo · Guardar Playlist y Tonos Semanales
            </button>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR DATOS BASE DE UNA CANCIÓN YA CREADA */}
      {showEditSongModal && activeSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Editar Datos de la Canción
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modifica título, artista, tono base, BPM, compás, estilo o enlace de Spotify
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditSongModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedSongMetadata} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título de la Canción *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSongTitle}
                    onChange={(e) => setEditSongTitle(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Artista / Ministerio
                  </label>
                  <input
                    type="text"
                    value={editSongArtist}
                    onChange={(e) => setEditSongArtist(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tono Base
                  </label>
                  <select
                    value={editSongKey}
                    onChange={(e) => setEditSongKey(e.target.value)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  >
                    <optgroup label="Tonalidades Mayores">
                      {MAJOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k} Mayor
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Tonalidades Menores">
                      {MINOR_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {k} ({k.replace(/m$/, '')} Menor)
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    BPM
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={250}
                    value={editSongBpm}
                    onChange={(e) => setEditSongBpm(Number(e.target.value))}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Compás
                  </label>
                  <select
                    value={editSongTimeSig}
                    onChange={(e) => setEditSongTimeSig(e.target.value as TimeSignature)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
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
                    value={editSongStyle}
                    onChange={(e) => setEditSongStyle(e.target.value as Song['style'])}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Adoración">Adoración</option>
                    <option value="Alabanza / Júbilo">Alabanza / Júbilo</option>
                    <option value="Intimidad">Intimidad</option>
                    <option value="Congregacional">Congregacional</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Enlace de Referencia Spotify (Opcional)
                </label>
                <input
                  type="url"
                  value={editSongSpotifyUrl}
                  onChange={(e) => setEditSongSpotifyUrl(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditSongModal(false)}
                  className="min-h-[46px] px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[46px] px-5 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
