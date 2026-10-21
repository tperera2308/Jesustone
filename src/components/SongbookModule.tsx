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
  generateLeadSheetSVGDataUrl,
  isChordLine,
  transposeChordSheet,
  transposeNote,
  transposeSingleChord,
} from '../utils/musicTheory';
import {
  generateDemoVoiceClipDataUrl,
  playChordVoicing,
  playMetronomeClick,
} from '../utils/audioEngine';
import { getAccentClasses } from './IdentityModal';
import {
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  ListMusic,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Music2,
  Pause,
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
  activeMember: BandMember;
  accentColor: AccentColorId;
  initialSongId?: string | null;
  initialTargetKey?: string | null;
  onAddSong: (song: Omit<Song, 'id'>) => void;
  onUpdateSong: (song: Song) => void;
  onUpdateEventPlaylist: (eventId: string, updatedSongs: EventSongItem[]) => void;
  onOpenMetronomeWithSong: (bpm: number, timeSignature: TimeSignature) => void;
}

const KEY_SEMITONE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const ALL_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function computeSemitoneDiff(origKey: string, targetKey: string): number {
  const origIdx = KEY_SEMITONE_INDEX[origKey];
  const targetIdx = KEY_SEMITONE_INDEX[targetKey];
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
  activeMember,
  accentColor,
  initialSongId,
  initialTargetKey,
  onAddSong,
  onUpdateSong,
  onUpdateEventPlaylist,
  onOpenMetronomeWithSong,
}) => {
  const accent = getAccentClasses(accentColor);
  const isLeader = activeMember.role === 'leader';

  // List Grouping State: 'repertorio_base' or an Event ID
  const [selectedListId, setSelectedListId] = useState<string>('repertorio_base');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string>(
    initialSongId || songs[0]?.id || ''
  );
  const [semitones, setSemitones] = useState<number>(0);
  const [useSolfege, setUseSolfege] = useState<boolean>(false);
  const [viewFormat, setViewFormat] = useState<'text' | 'image'>('text');
  const [isEditingLyrics, setIsEditingLyrics] = useState<boolean>(false);
  const [editedLyrics, setEditedLyrics] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showManagePlaylistModal, setShowManagePlaylistModal] = useState<boolean>(false);

  // Stage Mode / Modo Atril Fullscreen State
  const [isStageMode, setIsStageMode] = useState<boolean>(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(1.5); // 1x, 1.5x, 2x, 3x
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

  // Reference Audio Player Simulation State
  const [isPlayingRef, setIsPlayingRef] = useState<boolean>(false);
  const [activeChordIdx, setActiveChordIdx] = useState<number>(0);
  const playIntervalRef = useRef<number | null>(null);
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
  const [newSpotifyUrl, setNewSpotifyUrl] = useState('https://open.spotify.com');
  const [newLyrics, setNewLyrics] = useState(
    `[Intro]\nG   D/F#   Em7   Cadd9\n\n[Verso 1]\nG                      D/F#\nEscribe aquí la letra con acordes arriba\nEm7                    Cadd9\nTodos en el grupo podrán ver esta canción y su archivo`
  );
  const [newImageDataUrl, setNewImageDataUrl] = useState<string>('');
  const [newFileName, setNewFileName] = useState<string>('');

  const activeEventList =
    selectedListId !== 'repertorio_base'
      ? events.find((ev) => ev.id === selectedListId)
      : undefined;

  // Songs displayed according to the selected list (Repertorio Base vs Event Playlist)
  const songsInSelectedList = (() => {
    if (!activeEventList) return songs;
    return activeEventList.songs
      .map((item) => songs.find((s) => s.id === item.songId))
      .filter(Boolean) as Song[];
  })();

  const filteredSongs = songsInSelectedList.filter((s) => {
    return (
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.addedByName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.originalKey.toLowerCase().includes(searchQuery.toLowerCase())
    );
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
      const targetSong = songs.find((s) => s.id === initialSongId);
      if (targetSong && initialTargetKey) {
        setSemitones(computeSemitoneDiff(targetSong.originalKey, initialTargetKey));
      } else {
        setSemitones(0);
      }
    }
  }, [initialSongId, initialTargetKey, songs]);

  useEffect(() => {
    setIsPlayingRef(false);
    setActiveChordIdx(0);
    if (playIntervalRef.current) {
      window.clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    if (activeSong) {
      setEditedLyrics(activeSong.lyricsAndChords);
      setSongMetronomeBpm(activeSong.bpm);
    }
  }, [selectedSongId, activeSong?.id]);

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

  // Stage Mode Auto-Scroll Engine synced to BPM & speed multiplier
  useEffect(() => {
    if (!isStageMode || !isAutoScrolling || !stageScrollContainerRef.current) {
      return;
    }
    const container = stageScrollContainerRef.current;
    const bpmFactor = (activeSong?.bpm || 75) / 75;
    const pixelsPerTick = 0.8 * autoScrollSpeed * bpmFactor;

    const timer = window.setInterval(() => {
      if (container) {
        container.scrollTop += pixelsPerTick;
      }
    }, 45);

    return () => window.clearInterval(timer);
  }, [isStageMode, isAutoScrolling, autoScrollSpeed, activeSong?.bpm]);

  // Reference Harmonic Guide Player
  useEffect(() => {
    if (!isPlayingRef || !activeSong) {
      if (playIntervalRef.current) {
        window.clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    const transposedChords = activeSong.chordProgPreview.map((c) =>
      transposeSingleChord(c, semitones, false)
    );
    playChordVoicing(transposedChords[0] || activeSong.originalKey);
    let step = 0;
    const msPerMeasure = Math.max(1400, Math.round((60 / activeSong.bpm) * 4 * 1000));

    playIntervalRef.current = window.setInterval(() => {
      step += 1;
      const nextIdx = step % transposedChords.length;
      setActiveChordIdx(nextIdx);
      playChordVoicing(transposedChords[nextIdx] || 'G');
    }, msPerMeasure);

    return () => {
      if (playIntervalRef.current) {
        window.clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlayingRef, activeSong, semitones]);

  const currentKey = activeSong
    ? transposeNote(activeSong.originalKey, semitones)
    : 'G';
  const currentKeyDisplay = activeSong
    ? transposeSingleChord(activeSong.originalKey, semitones, useSolfege)
    : 'G';
  const transposedText = activeSong
    ? transposeChordSheet(activeSong.lyricsAndChords, semitones, useSolfege)
    : '';
  const transposedPreviewChords = activeSong
    ? activeSong.chordProgPreview.map((c) =>
        transposeSingleChord(c, semitones, useSolfege)
      )
    : [];

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
      selectSongWithContextKey(nextSong);
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

    onAddSong({
      title: newTitle.trim(),
      artist: newArtist.trim() || 'jesustone Worship',
      originalKey: newKey,
      bpm: Number(newBpm) || 75,
      timeSignature: newTimeSig,
      style: newStyle,
      characteristics: chars.length > 0 ? chars : ['Congregacional'],
      spotifyUrl: newSpotifyUrl.trim() || 'https://open.spotify.com',
      spotifyTrackId: `SP-${Date.now().toString().slice(-4)}`,
      referenceDuration: '04:30',
      chordProgPreview: defaultChords,
      lyricsAndChords: newLyrics,
      chordSheetImageUrl: imageSheet,
      attachedFileName:
        newFileName || `${newTitle.trim().replace(/\s+/g, '_')}_Acordes.svg`,
      notes: `Agregada al repertorio general por ${activeMember.name}.`,
      addedByUserId: activeMember.id,
      addedByName: activeMember.name,
      addedByRole: activeMember.role,
      addedAt: 'Justo ahora',
      voiceNotes: [],
    });

    setNewTitle('');
    setNewArtist('');
    setNewImageDataUrl('');
    setNewFileName('');
    setShowAddModal(false);
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

  return (
    <div className="space-y-6">
      {/* =====================================================================
          MODO ESCENARIO / ATRIL A PANTALLA COMPLETA (CON AUTO-SCROLL, CLIC EN VIVO Y SETLIST)
         ===================================================================== */}
      {isStageMode && activeSong && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden">
          {/* Barra Superior del Modo Escenario */}
          <header className="px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
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

            {/* Controles Rápidos en Vivo: Metrónomo + Auto-Scroll + Tono + Letra + Salir */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Metrónomo integrado en Modo Escenario */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-800 border border-slate-700">
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
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-800 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    isAutoScrolling
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {isAutoScrolling ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>Auto-Scroll</span>
                </button>
                {[1, 1.5, 2, 3].map((spd) => (
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
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Transposición rápida en escenario */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-slate-800 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setSemitones((s) => s - 1)}
                  className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-mono font-bold"
                >
                  -1
                </button>
                <span className="px-2 font-mono text-xs font-bold text-amber-400">
                  {currentKeyDisplay}
                </span>
                <button
                  type="button"
                  onClick={() => setSemitones((s) => s + 1)}
                  className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-mono font-bold"
                >
                  +1
                </button>
              </div>

              {/* Tamaño de fuente */}
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-2xl bg-slate-800 border border-slate-700">
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

          {/* Cuerpo Principal del Atril (Alto Contraste) */}
          <div
            ref={stageScrollContainerRef}
            className="flex-1 overflow-y-auto px-6 sm:px-12 py-8 max-w-5xl w-full mx-auto space-y-6"
          >
            {/* Acordes de referencia rápidos */}
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2">
                Progresión Principal ({currentKeyDisplay} · {activeSong.bpm} BPM ·{' '}
                {activeSong.timeSignature}):
              </span>
              {transposedPreviewChords.map((chord, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    playChordVoicing(
                      transposeSingleChord(
                        activeSong.chordProgPreview[idx],
                        semitones,
                        false
                      )
                    )
                  }
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 font-mono text-sm font-bold text-amber-300 flex items-center gap-1.5 hover:bg-slate-800"
                >
                  <Volume2 className="w-3.5 h-3.5 opacity-70" />
                  {chord}
                </button>
              ))}
            </div>

            {/* Letra y Acordes en tamaño de Atril */}
            <div className={`font-mono leading-relaxed ${stageFontClass} pb-32`}>
              {transposedText.split('\n').map((line, idx) => {
                const isSectionHeader = /^\[.*\]$/.test(line.trim());
                const chordLine = !isSectionHeader && isChordLine(line);
                return (
                  <div
                    key={idx}
                    className={`whitespace-pre ${
                      isSectionHeader
                        ? 'mt-8 mb-2 font-sans font-extrabold text-sm sm:text-base uppercase tracking-widest text-amber-400 bg-amber-500/10 inline-block px-3 py-1 rounded-lg'
                        : chordLine
                        ? 'font-extrabold text-emerald-400 mt-3'
                        : 'text-slate-100'
                    }`}
                  >
                    {line || ' '}
                  </div>
                );
              })}
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

      {/* =====================================================================
          SECCIÓN 1: AGRUPACIÓN POR LISTAS (REPERTORIO BASE VS PLAYLISTS DE EVENTO)
         ===================================================================== */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderKanban className={`w-5 h-5 ${accent.textClass}`} />
              Listas del Cancionero y Playlists por Semana
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cada canción mantiene su <strong>Tono Normal</strong> en el Repertorio Base, pero puede tener una <strong>Tonalidad por Semana/Evento</strong> distinta sin alterar el original.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={`min-h-[52px] px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-transform active:scale-[0.98] whitespace-nowrap shrink-0 ${accent.bgClass}`}
          >
            <Plus className="w-5 h-5" />
            Subir Canción al Repertorio ({activeMember.name})
          </button>
        </div>

        {/* Selector de Repertorio Base vs Playlists de Eventos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedListId('repertorio_base');
              setSemitones(0);
            }}
            className={`min-h-[68px] p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
              selectedListId === 'repertorio_base'
                ? `${accent.borderClass} ${accent.softBgClass} ring-2 ring-current shadow-sm`
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                Base General
              </span>
              <span className="font-mono text-xs font-bold">
                {songs.length} canciones
              </span>
            </div>
            <p className="text-sm font-bold truncate mt-1">
              Repertorio de Todo el Grupo
            </p>
          </button>

          {events.map((ev) => {
            const isSelected = selectedListId === ev.id;
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => {
                  setSelectedListId(ev.id);
                  if (ev.songs[0]) {
                    const firstSong = songs.find(
                      (s) => s.id === ev.songs[0].songId
                    );
                    if (firstSong) {
                      selectSongWithContextKey(firstSong, ev);
                    }
                  }
                }}
                className={`min-h-[68px] p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  isSelected
                    ? `${accent.borderClass} ${accent.softBgClass} ring-2 ring-current shadow-sm`
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono opacity-80">{ev.date}</span>
                  <span className="font-mono font-bold">
                    {ev.songs.length} en lista
                  </span>
                </div>
                <p className="text-sm font-bold truncate mt-1">
                  Playlist: {ev.title}
                </p>
              </button>
            );
          })}
        </div>

        {/* Barra de Navegación Fluida del Setlist cuando hay un Evento seleccionado */}
        {activeEventList && (
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ListMusic className={`w-4 h-4 ${accent.textClass}`} />
                  Setlist de la Semana: «{activeEventList.title}» ({activeEventList.date})
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Navega de canción en canción con un toque. Cada canción carga automáticamente su <strong>Tonalidad asignada para esta semana</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeSong && (
                  <button
                    type="button"
                    onClick={() => setIsStageMode(true)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-bold flex items-center gap-2 shadow-sm"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span>Abrir Setlist en Modo Atril</span>
                  </button>
                )}

                {isLeader ? (
                  <button
                    type="button"
                    onClick={() => setShowManagePlaylistModal(true)}
                    className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 ${accent.bgClass}`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Editar Playlist y Tonos Semanales
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 shrink-0">
                    <Lock className="w-3.5 h-3.5" />
                    Playlist del Líder
                  </span>
                )}
              </div>
            </div>

            {/* Riel de Navegación Fluida por las Canciones de la Playlist */}
            {filteredSongs.length > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  disabled={filteredSongs.length <= 1}
                  onClick={() => handleNavigatePlaylist('prev')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>

                <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
                  {filteredSongs.map((s, idx) => {
                    const evItem = activeEventList.songs.find(
                      (i) => i.songId === s.id
                    );
                    const weeklyKey = evItem?.customKey || s.originalKey;
                    const isCurrent = activeSong?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectSongWithContextKey(s)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                          isCurrent
                            ? `${accent.bgClass} shadow-xs`
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-mono opacity-75">0{idx + 1}.</span>
                        <span>{s.title}</span>
                        <span className="px-1.5 py-0.5 rounded bg-black/15 dark:bg-white/10 font-mono text-[11px]">
                          Tono Semanal: {weeklyKey}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={filteredSongs.length <= 1}
                  onClick={() => handleNavigatePlaylist('next')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Buscador Rápido */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar canción por título, autor, tonalidad o miembro que la agregó..."
          className="w-full min-h-[50px] pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none"
        />
      </div>

      {/* Layout Principal: Lista de Canciones (Izquierda) + Visor Completo (Derecha) */}
      {!activeSong ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4">
          <div
            className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
          >
            <Music2 className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              El repertorio del grupo está vacío
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Tanto el Líder como los Miembros pueden agregar canciones con letra, acordes, notas de voz o imagen de partitura.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className={`min-h-[52px] px-6 py-3 rounded-2xl text-sm font-bold inline-flex items-center gap-2 shadow-lg ${accent.bgClass}`}
            >
              <Plus className="w-5 h-5" />
              <span>Subir Primera Canción al Repertorio</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Canciones */}
          <div className="lg:col-span-4 space-y-3">
            {filteredSongs.map((song, idx) => {
              const isSelected = song.id === activeSong.id;
              const eventItem = activeEventList?.songs.find(
                (i) => i.songId === song.id
              );
              const weeklyKey = eventItem?.customKey;
              return (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => selectSongWithContextKey(song)}
                  className={`w-full text-left p-4 rounded-3xl border transition-all ${
                    isSelected
                      ? `bg-white dark:bg-slate-900 ${accent.borderClass} ring-2 ring-amber-500/20 shadow-sm`
                      : 'bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {activeEventList ? `${idx + 1}. ` : ''}
                        {song.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {song.artist}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {weeklyKey && weeklyKey !== song.originalKey ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg ${accent.softBgClass}`}
                          >
                            Semana: {weeklyKey}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 mt-0.5">
                            Base: {song.originalKey}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={`font-mono text-sm font-bold shrink-0 ${accent.textClass}`}
                        >
                          {weeklyKey || song.originalKey}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      Agregada por:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {song.addedByName}
                      </strong>
                    </span>
                    {(song.voiceNotes?.length || 0) > 0 && (
                      <span className="font-mono text-[11px] text-amber-500 font-bold flex items-center gap-1">
                        <Mic className="w-3 h-3" />
                        {song.voiceNotes?.length} audio(s)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums mt-1">
                    <span>{song.bpm} BPM</span>
                    <span aria-hidden="true">·</span>
                    <span>{song.timeSignature}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans truncate">
                      Archivo: {song.attachedFileName || 'Hoja de Acordes'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Columna Derecha: Visor de Canción + Modo Atril + Metrónomo Integrado + Notas de Voz */}
          <div className="lg:col-span-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
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

            {/* Botones Grandes para Alternar entre LETRA Y ACORDES o ARCHIVO / PARTITURA ADJUNTA */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setViewFormat('text')}
                className={`min-h-[54px] p-3 rounded-2xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  viewFormat === 'text'
                    ? `${accent.bgClass} border-transparent shadow-sm`
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <FileText className="w-4 h-4" />
                Letra y Acordes Transponibles
              </button>

              <button
                type="button"
                onClick={() => setViewFormat('image')}
                className={`min-h-[54px] p-3 rounded-2xl border font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  viewFormat === 'image'
                    ? `${accent.bgClass} border-transparent shadow-sm`
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                Ver Archivo / Hoja ({activeSong.attachedFileName || 'Partitura'})
              </button>
            </div>

            {/* Barra de Referencia Spotify y Audio Armónico */}
            <div className="p-4 rounded-2xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsPlayingRef(!isPlayingRef)}
                    className="w-12 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 transition-transform active:scale-95"
                  >
                    {isPlayingRef ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                      <Music2 className="w-3.5 h-3.5" />
                      <span>Spotify &amp; Guía Armónica en Vivo</span>
                    </div>
                    <p className="text-sm font-bold truncate">
                      {activeSong.title} — Tono actual: {currentKeyDisplay}
                    </p>
                  </div>
                </div>

                <a
                  href={activeSong.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white self-end sm:self-center whitespace-nowrap shrink-0"
                >
                  <span>Escuchar en Spotify</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {transposedPreviewChords.map((chord, idx) => {
                  const isCurrentBeat = isPlayingRef && activeChordIdx === idx;
                  return (
                    <button
                      key={`${chord}-${idx}`}
                      type="button"
                      onClick={() =>
                        playChordVoicing(
                          transposeSingleChord(
                            activeSong.chordProgPreview[idx],
                            semitones,
                            false
                          )
                        )
                      }
                      className={`min-h-[42px] py-2 px-3 rounded-xl font-mono text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        isCurrentBeat
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      <span>{chord}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {viewFormat === 'text' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Letra y acordes compartidos con todo el grupo
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
                  <div className="p-5 sm:p-6 rounded-2xl bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
                    {transposedText.split('\n').map((line, idx) => {
                      const isSectionHeader = /^\[.*\]$/.test(line.trim());
                      const chordLine = !isSectionHeader && isChordLine(line);
                      return (
                        <div
                          key={idx}
                          className={`whitespace-pre ${
                            isSectionHeader
                              ? 'mt-4 mb-1 font-sans font-bold text-xs uppercase tracking-wider text-slate-400'
                              : chordLine
                              ? `font-bold ${accent.textClass} mt-1`
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {line || ' '}
                        </div>
                      );
                    })}
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
                    {ALL_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
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

            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto">
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
                          {ALL_KEYS.map((k) => (
                            <option key={k} value={k}>
                              {k} {k === song.originalKey ? '(Base)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowManagePlaylistModal(false)}
              className={`w-full min-h-[48px] rounded-2xl text-sm font-bold ${accent.bgClass}`}
            >
              Listo · Guardar Playlist y Tonos Semanales
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
