import React, { useEffect, useRef, useState } from 'react';
import {
  ALL_INSTRUMENT_ROLES,
  AccentColorId,
  AppIdentity,
  AppUser,
  BandMember,
  ChatChannelId,
  ChatMessage,
  DirectMessage,
  FriendRequest,
  InstrumentRole,
  Song,
  WorshipEvent,
  WorshipGroup,
} from '../types';
import { generateDemoVoiceClipDataUrl } from '../utils/audioEngine';
import { uploadMediaBlobToStorage } from '../firebase';
import { BrandIconDisplay, getAccentClasses } from './IdentityModal';
import {
  ArrowLeft,
  AtSign,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Hash,
  HeartHandshake,
  Menu,
  MessageSquare,
  Mic,
  Music,
  Pin,
  Plus,
  PlusCircle,
  Search,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react';

interface ChatModuleProps {
  identity: AppIdentity;
  messages: ChatMessage[];
  members: BandMember[];
  songs: Song[];
  events?: WorshipEvent[];
  activeMember: BandMember;
  currentUser?: AppUser | null;
  allUsers?: AppUser[];
  friends?: AppUser[];
  friendRequests?: FriendRequest[];
  directMessages?: DirectMessage[];
  accentColor: AccentColorId;
  userGroups?: WorshipGroup[];
  activeGroupId?: string;
  onSelectGroup?: (groupId: string) => void;
  onSendMessage: (
    channel: ChatChannelId,
    text: string,
    attachedSongId?: string,
    voiceClipUrl?: string,
    voiceClipDurationSec?: number,
    targetGroupId?: string
  ) => void;
  onDeleteMessage?: (messageId: string, targetGroupId?: string) => void;
  onTogglePrayerReaction: (messageId: string, targetGroupId?: string) => void;
  onOpenSongFromChat: (songId: string) => void;
  onSendFriendRequest?: (targetUser: AppUser) => { ok: boolean; message: string };
  onRespondFriendRequest?: (requestId: string, accept: boolean) => void;
  onSendDirectMessage?: (
    recipientUser: AppUser,
    text: string,
    voiceClipUrl?: string,
    voiceClipDurationSec?: number,
    sharedSongSnapshot?: Song
  ) => void;
  onImportSharedSongToRepertoire?: (song: Song) => void;
  onConvokeFriendToEvent?: (
    friendUser: AppUser,
    eventId?: string
  ) => { ok: boolean; message: string };
  initialDmUserId?: string | null;
  onOpenMusicianProfile?: (userId: string) => void;
  onExitFullScreenChat: () => void;
}

const CHANNEL_CATEGORIES: {
  category: string;
  channels: {
    id: ChatChannelId;
    name: string;
    description: string;
  }[];
}[] = [
  {
    category: 'IMPORTANTE',
    channels: [
      {
        id: 'avisos',
        name: 'avisos-oficiales',
        description:
          'Comunicados del Líder, horarios de citación y playlists dominicales',
      },
    ],
  },
  {
    category: 'CANALES DE TEXTO',
    channels: [
      {
        id: 'general',
        name: 'general',
        description: 'Conversación general del grupo de alabanza jesustone',
      },
      {
        id: 'ensayos',
        name: 'ensayos-y-tonos',
        description: 'Coordinación de tonalidades, secuencias, in-ears y arreglos',
      },
      {
        id: 'sugerencias',
        name: 'sugerencias-repertorio',
        description: 'Comparte nuevas canciones subidas al Repertorio Base',
      },
    ],
  },
  {
    category: 'ESPIRITUAL',
    channels: [
      {
        id: 'oracion',
        name: 'altar-de-oracion',
        description:
          'Peticiones de oración e intercesión por el equipo y la iglesia',
      },
    ],
  },
];

export const ChatModule: React.FC<ChatModuleProps> = ({
  identity,
  messages,
  members,
  songs,
  events = [],
  activeMember,
  currentUser,
  allUsers = [],
  friends = [],
  friendRequests = [],
  directMessages = [],
  accentColor,
  userGroups = [],
  activeGroupId,
  onSelectGroup,
  onSendMessage,
  onDeleteMessage,
  onTogglePrayerReaction,
  onOpenSongFromChat,
  onSendFriendRequest,
  onRespondFriendRequest,
  onSendDirectMessage,
  onImportSharedSongToRepertoire,
  onConvokeFriendToEvent,
  initialDmUserId,
  onOpenMusicianProfile,
  onExitFullScreenChat,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    activeGroupId || (userGroups && userGroups[0]?.id) || ''
  );

  useEffect(() => {
    if (activeGroupId) {
      setSelectedGroupId(activeGroupId);
    }
  }, [activeGroupId]);

  const resolvedGroups: WorshipGroup[] =
    userGroups && userGroups.length > 0
      ? userGroups
      : [
          {
            id: activeGroupId || 'default-group',
            identity,
            members,
            chatMessages: messages,
            songs,
            events,
            devotionals: [],
            alerts: [],
            activityFeed: [],
            invitations: [],
            leaderUserId: activeMember.id,
          },
        ];

  const currentGroup =
    resolvedGroups.find((g) => g.id === selectedGroupId) ||
    resolvedGroups[0];

  const currentGroupMessages = currentGroup.chatMessages || [];
  const currentGroupMembers = currentGroup.members || [];
  const currentGroupSongs = currentGroup.songs || [];
  const currentGroupIdentity = currentGroup.identity || identity;
  const currentGroupAccent = getAccentClasses(currentGroupIdentity.accentColor);
  const currentGroupActiveMember =
    currentGroup.members?.find(
      (m) =>
        m.id === currentUser?.id ||
        m.email === currentUser?.email ||
        m.username === currentUser?.username
    ) || activeMember;

  const isGuestInActiveGroup = Boolean(currentGroupActiveMember.isGuest);
  const accent = currentGroupAccent;

  // Mode: 'group' (internal group channels) vs 'social' (Friends Network & 1-on-1 DM)
  const [chatMode, setChatMode] = useState<'group' | 'social'>(
    initialDmUserId || isGuestInActiveGroup ? 'social' : 'group'
  );
  const [socialTab, setSocialTab] = useState<'dm' | 'search' | 'requests'>('dm');
  const [selectedFriendId, setSelectedFriendId] = useState<string>(
    initialDmUserId || friends[0]?.id || ''
  );
  const [musicianSearchQuery, setMusicianSearchQuery] = useState('');
  const [musicianInstrumentFilter, setMusicianInstrumentFilter] =
    useState<string>('all');
  const [socialFeedback, setSocialFeedback] = useState<string | null>(null);
  const [copiedMyCode, setCopiedMyCode] = useState(false);
  const [showInviteFriendEventPicker, setShowInviteFriendEventPicker] =
    useState(false);
  const [importedSongIds, setImportedSongIds] = useState<string[]>([]);

  const [activeChannel, setActiveChannel] = useState<ChatChannelId>('general');
  const [messageText, setMessageText] = useState('');
  const [attachedSongId, setAttachedSongId] = useState<string>('');
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);

  // Voice Note Recording State in Chat / DM
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [pendingVoiceClip, setPendingVoiceClip] = useState<{
    url: string;
    durationSec: number;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialDmUserId) {
      setChatMode('social');
      setSocialTab('dm');
      setSelectedFriendId(initialDmUserId);
    }
  }, [initialDmUserId]);

  useEffect(() => {
    if (isGuestInActiveGroup && chatMode === 'group') {
      setChatMode('social');
    }
  }, [isGuestInActiveGroup, chatMode]);

  useEffect(() => {
    if (!selectedFriendId && friends.length > 0) {
      setSelectedFriendId(friends[0].id);
    }
  }, [friends, selectedFriendId]);

  const allChannels = CHANNEL_CATEGORIES.flatMap((c) => c.channels);
  const channelMeta =
    allChannels.find((c) => c.id === activeChannel) || allChannels[0];
  const channelMessages = currentGroupMessages
    .filter((m) => m.channel === activeChannel)
    .slice(-100);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedFriend =
    friends.find((f) => f.id === selectedFriendId) ||
    allUsers.find((u) => u.id === selectedFriendId && u.id !== currentUser?.id) ||
    friends[0] ||
    null;

  const activeConversationId =
    currentUser && selectedFriend
      ? [currentUser.id, selectedFriend.id].sort().join('__')
      : '';

  const activeDmMessages = directMessages
    .filter(
      (dm) =>
        dm.conversationId === activeConversationId ||
        (currentUser &&
          selectedFriend &&
          ((dm.senderId === currentUser.id &&
            dm.recipientId === selectedFriend.id) ||
            (dm.senderId === selectedFriend.id &&
              dm.recipientId === currentUser.id)))
    )
    .slice(-100);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    chatMode,
    activeChannel,
    channelMessages.length,
    selectedFriend?.id,
    activeDmMessages.length,
  ]);

  const leaders = currentGroupMembers.filter(
    (m) => m.role === 'leader' && !m.isGuest
  );
  const regularMembers = currentGroupMembers.filter(
    (m) => m.role !== 'leader' && !m.isGuest
  );
  const guestMembers = currentGroupMembers.filter((m) => Boolean(m.isGuest));

  const incomingFriendRequests = friendRequests.filter(
    (r) => r.toUserId === currentUser?.id && r.status === 'pending'
  );
  const outgoingFriendRequests = friendRequests.filter(
    (r) => r.fromUserId === currentUser?.id && r.status === 'pending'
  );

  const myMusicianCode =
    currentUser?.musicianCode ||
    `JST-${(currentUser?.id || activeMember.id)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-4)
      .toUpperCase()
      .padStart(4, '0')}`;

  const handleCopyMyCode = () => {
    navigator.clipboard?.writeText(myMusicianCode);
    setCopiedMyCode(true);
    window.setTimeout(() => setCopiedMyCode(false), 2000);
  };

  const handleStartVoiceRecording = async () => {
    setVoiceSeconds(0);
    setIsRecordingVoice(true);
    audioChunksRef.current = [];

    timerRef.current = window.setInterval(() => {
      setVoiceSeconds((prev) => prev + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start();
      }
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  const handleStopVoiceRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const finalSec = Math.max(2, voiceSeconds);
    setIsRecordingVoice(false);

    const finalizeClip = (dataUrl: string) => {
      setPendingVoiceClip({ url: dataUrl, durationSec: finalSec });
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
          reader.onloadend = async () => {
            const fallbackUrl =
              typeof reader.result === 'string'
                ? reader.result
                : generateDemoVoiceClipDataUrl(finalSec);
            const cloudUrl = await uploadMediaBlobToStorage(
              'chat_audio',
              `chat_${Date.now()}.webm`,
              blob,
              fallbackUrl
            );
            finalizeClip(cloudUrl);
          };
          reader.readAsDataURL(blob);
        } else {
          finalizeClip(generateDemoVoiceClipDataUrl(finalSec));
        }
      };
      recorder.stop();
    } else {
      finalizeClip(generateDemoVoiceClipDataUrl(finalSec));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() && !pendingVoiceClip && !attachedSongId) return;

    if (chatMode === 'social') {
      if (!selectedFriend || !onSendDirectMessage) return;
      const sharedSong = attachedSongId
        ? songs.find((s) => s.id === attachedSongId)
        : undefined;
      onSendDirectMessage(
        selectedFriend,
        messageText.trim() ||
          (sharedSong
            ? `🎵 Te comparto la canción «${sharedSong.title}» (${sharedSong.originalKey})`
            : `🎤 Nota de voz (${pendingVoiceClip?.durationSec || 3}s)`),
        pendingVoiceClip?.url,
        pendingVoiceClip?.durationSec,
        sharedSong
      );
      setMessageText('');
      setAttachedSongId('');
      setPendingVoiceClip(null);
      setShowSongPicker(false);
      return;
    }

    onSendMessage(
      activeChannel,
      messageText.trim() ||
        `🎤 Nota de voz enviada (${pendingVoiceClip?.durationSec || 3}s)`,
      attachedSongId || undefined,
      pendingVoiceClip?.url,
      pendingVoiceClip?.durationSec,
      currentGroup.id
    );
    setMessageText('');
    setAttachedSongId('');
    setPendingVoiceClip(null);
    setShowSongPicker(false);
  };

  // Filtered musicians for Global Musician Search
  const searchableMusicians = allUsers.filter((u) => {
    if (currentUser && u.id === currentUser.id) return false;
    const q = musicianSearchQuery.trim().toLowerCase().replace(/^@/, '');
    const uCode = (
      u.musicianCode ||
      `JST-${u.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase().padStart(4, '0')}`
    ).toLowerCase();

    const matchesText =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      uCode.includes(q) ||
      (u.instruments || []).some((inst) => inst.toLowerCase().includes(q));

    const matchesInstrument =
      musicianInstrumentFilter === 'all' ||
      (u.instruments || []).includes(musicianInstrumentFilter as InstrumentRole);

    return matchesText && matchesInstrument;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingGroupEvents = events
    .filter((ev) => ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="fixed inset-0 z-50 bg-[#313338] text-slate-100 flex overflow-hidden select-none">
      {/* 1. RIEL IZQUIERDO DE SERVIDOR Y RED DE AMIGOS (Desktop & Tablet) */}
      <aside className="hidden sm:flex flex-col items-center justify-between py-4 w-[72px] bg-[#1e1f22] shrink-0 border-r border-white/5">
        <div className="flex flex-col items-center gap-3">
          {/* Botón Volver a jesustone */}
          <button
            type="button"
            onClick={onExitFullScreenChat}
            className="w-12 h-12 rounded-2xl bg-[#313338] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-all"
            title="Salir a Inicio"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="w-8 h-[2px] bg-white/10 rounded-full" />

          {/* Botón 1: Chat del Grupo (oculto si es invitado temporal) */}
          {!isGuestInActiveGroup && (
            <button
              type="button"
              onClick={() => setChatMode('group')}
              className="relative group"
              title={`${identity.ministryName} · Canales del Grupo`}
            >
              {chatMode === 'group' && (
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-10 bg-white rounded-r-full" />
              )}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                  chatMode === 'group'
                    ? accent.bgClass
                    : 'bg-[#313338] hover:bg-[#404249] text-slate-300'
                }`}
              >
                <BrandIconDisplay iconId={identity.iconId} className="w-6 h-6" />
              </div>
            </button>
          )}

          {/* Botón 2: Red de Amigos y Mensajes Directos (DM) */}
          <button
            type="button"
            onClick={() => setChatMode('social')}
            className="relative group"
            title="Amigos y Mensajes Directos (DM)"
          >
            {chatMode === 'social' && (
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-10 bg-white rounded-r-full" />
            )}
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                chatMode === 'social'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#313338] hover:bg-[#404249] text-slate-300'
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
            {incomingFriendRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {incomingFriendRequests.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center"
            title={`${activeMember.name} (${myMusicianCode})`}
          >
            {activeMember.avatarInitials}
          </div>
        </div>
      </aside>

      {/* 2. COLUMNA LATERAL DE NAVEGACIÓN (Canales del Grupo O Lista de Amigos/Buscador) */}
      <div
        className={`${
          mobileDrawerOpen ? 'fixed inset-0 z-50 flex' : 'hidden md:flex'
        } md:relative md:w-72 shrink-0`}
      >
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs md:hidden"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        <div className="relative z-10 w-80 md:w-72 h-full bg-[#2b2d31] flex flex-col justify-between border-r border-black/20">
          <div className="flex flex-col flex-1 min-h-0">
            {/* Cabecera Superior con Selector Minimalista: Grupo vs Amigos/DM */}
            <div className="p-3 border-b border-black/30 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onExitFullScreenChat}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[#383a40] hover:bg-[#404249] text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>Menú Principal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Switcher minimalista Grupo vs Amigos y DM */}
              {!isGuestInActiveGroup && (
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1e1f22]">
                  <button
                    type="button"
                    onClick={() => setChatMode('group')}
                    className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      chatMode === 'group'
                        ? 'bg-[#383a40] text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span className="truncate">Grupo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatMode('social')}
                    className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all relative ${
                      chatMode === 'social'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="truncate">Amigos y DM</span>
                    {incomingFriendRequests.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
                        {incomingFriendRequests.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {chatMode === 'group' ? (
              /* LISTA DE TODOS LOS GRUPOS DEL USUARIO Y SUS CANALES RESPECTIVOS */
              <div className="p-2.5 space-y-3.5 overflow-y-auto flex-1">
                <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Tus Grupos y Canales
                </div>

                {resolvedGroups.map((grp) => {
                  const isCurrentGrp = grp.id === currentGroup.id;
                  const grpAccent = getAccentClasses(grp.identity.accentColor);
                  const grpMessages = grp.chatMessages || [];
                  const grpMember = grp.members?.find((m) => m.id === currentUser?.id);
                  const isGrpGuest = Boolean(grpMember?.isGuest);

                  return (
                    <div
                      key={grp.id}
                      className={`rounded-2xl border transition-all ${
                        isCurrentGrp
                          ? 'bg-[#1e1f22] border-white/10 shadow-xs'
                          : 'bg-[#232428]/50 border-white/5 hover:border-white/10'
                      } p-2 space-y-1.5`}
                    >
                      {/* Cabecera del Grupo */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGroupId(grp.id);
                          if (onSelectGroup) onSelectGroup(grp.id);
                        }}
                        className="w-full flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                        title={`Cambiar a ${grp.identity.ministryName}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden text-xs font-bold ${grpAccent.bgClass}`}
                          >
                            <BrandIconDisplay
                              iconId={grp.identity.iconId}
                              customImageUrl={grp.identity.customImageUrl}
                              className="w-4 h-4"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                              {grp.identity.ministryName}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {grpMember?.role === 'leader'
                                ? 'Líder / Admin'
                                : isGrpGuest
                                ? 'Suplente'
                                : 'Miembro'}
                            </p>
                          </div>
                        </div>

                        {isCurrentGrp ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[9px] font-bold">
                            Activo
                          </span>
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )}
                      </button>

                      {/* Canales correspondientes a este grupo */}
                      <div className="space-y-0.5 pl-2 border-l border-white/10 ml-3">
                        {CHANNEL_CATEGORIES.flatMap((c) => c.channels).map((ch) => {
                          const isSelected =
                            isCurrentGrp && ch.id === activeChannel;
                          const msgCount = grpMessages.filter(
                            (m) => m.channel === ch.id
                          ).length;

                          return (
                            <button
                              key={`${grp.id}-${ch.id}`}
                              type="button"
                              onClick={() => {
                                setSelectedGroupId(grp.id);
                                if (onSelectGroup) onSelectGroup(grp.id);
                                setActiveChannel(ch.id);
                                setMobileDrawerOpen(false);
                              }}
                              className={`w-full min-h-[34px] px-2 py-1 rounded-lg flex items-center justify-between gap-1.5 text-xs font-medium transition-colors ${
                                isSelected
                                  ? 'bg-[#404249] text-white font-semibold'
                                  : 'text-slate-400 hover:bg-[#35373c] hover:text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Hash
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isSelected
                                      ? 'text-amber-400'
                                      : 'text-slate-500'
                                  }`}
                                />
                                <span className="truncate">{ch.name}</span>
                              </div>
                              {msgCount > 0 && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  {msgCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* PANEL LATERAL DE RED DE AMIGOS, TU PERFIL ID Y CONVERSACIONES DM */
              <div className="p-3 space-y-3 overflow-y-auto flex-1">
                {/* Tarjeta minimalista de Tu Perfil de Músico + ID único */}
                <div className="p-2.5 rounded-xl bg-[#1e1f22] border border-white/5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                      Tu ID de Músico
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyMyCode}
                      className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-[10px] font-mono font-bold text-slate-200 flex items-center gap-1"
                    >
                      {copiedMyCode ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{myMusicianCode}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs font-bold text-white truncate">
                    {currentUser?.name || activeMember.name}{' '}
                    <span className="text-slate-400 font-mono font-normal">
                      @{currentUser?.username || activeMember.username || 'musico'}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {(currentUser?.instruments || activeMember.instruments).join(', ')}
                  </p>
                </div>

                {/* Sub-pestañas de Red Social: Mensajes DM | Buscar | Solicitudes */}
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#1e1f22] text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSocialTab('dm')}
                    className={`py-1.5 rounded-lg transition-colors ${
                      socialTab === 'dm'
                        ? 'bg-[#383a40] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Amigos ({friends.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSocialTab('search')}
                    className={`py-1.5 rounded-lg transition-colors ${
                      socialTab === 'search'
                        ? 'bg-[#383a40] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Buscar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSocialTab('requests')}
                    className={`py-1.5 rounded-lg transition-colors relative ${
                      socialTab === 'requests'
                        ? 'bg-[#383a40] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Solicitudes
                    {incomingFriendRequests.length > 0 && (
                      <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white text-[10px]">
                        {incomingFriendRequests.length}
                      </span>
                    )}
                  </button>
                </div>

                {socialTab === 'dm' && (
                  <div className="space-y-1.5">
                    {friends.length === 0 ? (
                      <div className="p-4 rounded-xl bg-[#1e1f22]/60 text-center space-y-2">
                        <p className="text-xs text-slate-400">
                          Aún no tienes amigos agregados en tu red musical.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSocialTab('search')}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white inline-flex items-center gap-1.5"
                        >
                          <Search className="w-3.5 h-3.5" />
                          <span>Buscar Músicos</span>
                        </button>
                      </div>
                    ) : (
                      friends.map((friend) => {
                        const isSelected = selectedFriend?.id === friend.id;
                        const convId = currentUser
                          ? [currentUser.id, friend.id].sort().join('__')
                          : '';
                        const lastDm = directMessages
                          .filter((d) => d.conversationId === convId)
                          .slice(-1)[0];

                        return (
                          <button
                            key={friend.id}
                            type="button"
                            onClick={() => {
                              setSelectedFriendId(friend.id);
                              setMobileDrawerOpen(false);
                            }}
                            className={`w-full p-2.5 rounded-xl flex items-center gap-2.5 text-left transition-colors ${
                              isSelected
                                ? 'bg-[#404249] text-white'
                                : 'hover:bg-[#35373c] text-slate-300'
                            }`}
                          >
                            <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                              {friend.avatarUrl ? (
                                <img
                                  src={friend.avatarUrl}
                                  alt={friend.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                friend.avatarInitials
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-xs font-bold text-white truncate">
                                  {friend.name}
                                </p>
                                {lastDm && (
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                    {lastDm.timestamp}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 truncate">
                                {lastDm
                                  ? lastDm.text
                                  : `@${friend.username} · ${
                                      friend.instruments?.[0] || 'Músico'
                                    }`}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {socialTab === 'requests' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                        Solicitudes Recibidas ({incomingFriendRequests.length})
                      </span>
                      {incomingFriendRequests.length === 0 ? (
                        <p className="text-xs text-slate-500 px-1">
                          No tienes solicitudes de amistad pendientes.
                        </p>
                      ) : (
                        incomingFriendRequests.map((req) => (
                          <div
                            key={req.id}
                            className="p-2.5 rounded-xl bg-[#1e1f22] border border-white/10 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                {req.fromAvatarInitials}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {req.fromName}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  @{req.fromUsername} ·{' '}
                                  {req.fromInstruments?.join(', ') || 'Músico'}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onRespondFriendRequest?.(req.id, true);
                                  setSocialTab('dm');
                                }}
                                className="py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                              >
                                Aceptar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onRespondFriendRequest?.(req.id, false)
                                }
                                className="py-1.5 rounded-lg bg-[#383a40] hover:bg-rose-600 text-slate-200 text-xs font-bold"
                              >
                                Declinar
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {outgoingFriendRequests.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-white/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                          Enviadas ({outgoingFriendRequests.length})
                        </span>
                        {outgoingFriendRequests.map((req) => (
                          <div
                            key={req.id}
                            className="p-2 rounded-xl bg-[#1e1f22]/60 flex items-center justify-between text-xs"
                          >
                            <span className="text-slate-300 truncate">
                              {req.toName} (@{req.toUsername})
                            </span>
                            <span className="text-[10px] text-amber-400 font-bold">
                              Pendiente
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {socialTab === 'search' && (
                  <div className="space-y-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={musicianSearchQuery}
                        onChange={(e) => setMusicianSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre, @usuario, JST-ID o instrumento..."
                        className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-[#1e1f22] border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none"
                      />
                    </div>

                    <select
                      value={musicianInstrumentFilter}
                      onChange={(e) =>
                        setMusicianInstrumentFilter(e.target.value)
                      }
                      className="w-full min-h-[34px] px-2.5 py-1 rounded-xl bg-[#1e1f22] border border-white/10 text-[11px] text-slate-200"
                    >
                      <option value="all">Todos los instrumentos</option>
                      {ALL_INSTRUMENT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>

                    {socialFeedback && (
                      <p className="text-[11px] font-bold text-emerald-400 px-1">
                        {socialFeedback}
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {searchableMusicians.map((musician) => {
                        const isAlreadyFriend = friends.some(
                          (f) => f.id === musician.id
                        );
                        const pendingSent = outgoingFriendRequests.some(
                          (r) => r.toUserId === musician.id
                        );
                        const pendingReceived = incomingFriendRequests.find(
                          (r) => r.fromUserId === musician.id
                        );
                        const mCode =
                          musician.musicianCode ||
                          `JST-${musician.id
                            .replace(/[^a-zA-Z0-9]/g, '')
                            .slice(-4)
                            .toUpperCase()
                            .padStart(4, '0')}`;

                        return (
                          <div
                            key={musician.id}
                            className="p-2.5 rounded-xl bg-[#1e1f22] border border-white/5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0">
                                  {musician.avatarInitials}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white truncate">
                                    {musician.name}
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-mono truncate">
                                    @{musician.username} · {mCode}
                                  </p>
                                </div>
                              </div>

                              {isAlreadyFriend ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFriendId(musician.id);
                                    setSocialTab('dm');
                                    setMobileDrawerOpen(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0"
                                >
                                  Mensaje DM
                                </button>
                              ) : pendingReceived ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRespondFriendRequest?.(
                                      pendingReceived.id,
                                      true
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold shrink-0"
                                >
                                  Aceptar
                                </button>
                              ) : pendingSent ? (
                                <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-[10px] font-bold shrink-0">
                                  Enviada
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!onSendFriendRequest) return;
                                    const res = onSendFriendRequest(musician);
                                    setSocialFeedback(res.message);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 shrink-0"
                                >
                                  <UserPlus className="w-3 h-3" />
                                  <span>Agregar</span>
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {(musician.instruments || []).map((inst) => (
                                <span
                                  key={inst}
                                  className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-slate-300"
                                >
                                  {inst}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Barra Inferior de Usuario Activo */}
          <div className="p-3 bg-[#232428] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  activeMember.role === 'leader'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-sky-500 text-white'
                }`}
              >
                {activeMember.avatarInitials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {activeMember.name}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {myMusicianCode} ·{' '}
                  {activeMember.isGuest
                    ? 'Invitado'
                    : activeMember.role === 'leader'
                    ? 'Líder'
                    : 'Miembro'}
                </p>
              </div>
            </div>
            <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* 3. ÁREA CENTRAL: CONVERSACIÓN DEL CANAL DE GRUPO O CHAT DIRECTO (DM) 1-A-1 */}
      <div className="flex-1 flex flex-col h-full bg-[#313338] min-w-0">
        {chatMode === 'social' ? (
          /* ===============================================================
             VISTA DE RED DE AMIGOS Y MENSAJES DIRECTOS (DM) 1-A-1
             =============================================================== */
          <>
            <header className="h-14 px-4 border-b border-black/30 flex items-center justify-between gap-3 shrink-0 bg-[#313338]">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="md:hidden min-h-[40px] min-w-[40px] rounded-xl bg-[#2b2d31] flex items-center justify-center text-slate-200"
                  aria-label="Ver amigos y buscador"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {selectedFriend ? (
                  <button
                    type="button"
                    onClick={() => onOpenMusicianProfile?.(selectedFriend.id)}
                    className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 transition-opacity"
                    title={`Ver Perfil Social de ${selectedFriend.name}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                      {selectedFriend.avatarUrl ? (
                        <img
                          src={selectedFriend.avatarUrl}
                          alt={selectedFriend.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        selectedFriend.avatarInitials
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-base font-bold text-white truncate flex items-center gap-1.5">
                        <span className="hover:underline">{selectedFriend.name}</span>
                        <span className="text-xs font-mono text-indigo-400 font-normal">
                          @{selectedFriend.username}
                        </span>
                      </h2>
                      <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                        {(selectedFriend.instruments || []).join(', ')} · Toca para ver su Perfil
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-sm sm:text-base font-bold text-white">
                      Red de Amigos y Mensajes Directos
                    </h2>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Botón exclusivo del Líder para invitar a este Amigo como Suplente / a un Evento */}
                {selectedFriend &&
                  activeMember.role === 'leader' &&
                  onConvokeFriendToEvent && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setShowInviteFriendEventPicker((prev) => !prev)
                        }
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          Invitar como Suplente
                        </span>
                        <span className="sm:hidden">+ Suplente</span>
                      </button>

                      {showInviteFriendEventPicker && (
                        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#1e1f22] border border-white/15 shadow-2xl p-3 z-50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-400">
                              Convocar a {selectedFriend.name}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setShowInviteFriendEventPicker(false)
                              }
                              className="text-slate-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Solo verá la fecha donde lo convoques y su setlist de canciones:
                          </p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => {
                                const res = onConvokeFriendToEvent(
                                  selectedFriend,
                                  undefined
                                );
                                setSocialFeedback(res.message);
                                setShowInviteFriendEventPicker(false);
                              }}
                              className="w-full p-2 rounded-xl bg-[#2b2d31] hover:bg-[#383a40] text-left text-xs font-bold text-white flex items-center justify-between"
                            >
                              <span>Añadir al Directorio de Suplentes</span>
                              <Plus className="w-3.5 h-3.5 text-amber-400" />
                            </button>
                            {upcomingGroupEvents.map((ev) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => {
                                  const res = onConvokeFriendToEvent(
                                    selectedFriend,
                                    ev.id
                                  );
                                  setSocialFeedback(res.message);
                                  setShowInviteFriendEventPicker(false);
                                }}
                                className="w-full p-2 rounded-xl bg-[#2b2d31] hover:bg-indigo-600/30 border border-white/5 text-left text-xs text-slate-200 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-white truncate">
                                    {ev.title}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-400">
                                    {ev.date} · Cit: {ev.callTime}
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold shrink-0">
                                  Convocar
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setSocialTab('search');
                    setMobileDrawerOpen(true);
                  }}
                  className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#2b2d31] hover:bg-[#383a40] text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
                  title="Buscar Músicos"
                >
                  <UserPlus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Buscar Músicos</span>
                </button>

                <button
                  type="button"
                  onClick={onExitFullScreenChat}
                  className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
                  title="Volver al menú principal"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            </header>

            {socialFeedback && (
              <div className="px-4 py-2 bg-emerald-600/20 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
                <span>{socialFeedback}</span>
                <button
                  type="button"
                  onClick={() => setSocialFeedback(null)}
                  className="text-emerald-200 hover:text-white font-bold"
                >
                  ×
                </button>
              </div>
            )}

            {selectedFriend ? (
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {/* Cabecera de bienvenida del DM */}
                  <div className="pb-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {selectedFriend.avatarInitials}
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-white">
                          Chat directo con {selectedFriend.name}
                        </h3>
                        <p className="text-xs text-slate-400">
                          @{selectedFriend.username} · Instrumentos:{' '}
                          {(selectedFriend.instruments || []).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {activeDmMessages.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-[#2b2d31]/60 border border-white/5 text-center space-y-1.5">
                      <MessageSquare className="w-6 h-6 text-indigo-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-200">
                        Inicia la conversación con {selectedFriend.name}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Puedes enviarle mensajes, notas de voz o compartirle copias de canciones con cifrado.
                      </p>
                    </div>
                  ) : (
                    activeDmMessages.map((dm) => {
                      const isMe = dm.senderId === currentUser?.id;
                      const alreadyImported =
                        dm.sharedSongSnapshot &&
                        (importedSongIds.includes(dm.sharedSongSnapshot.id) ||
                          songs.some(
                            (s) =>
                              s.title.toLowerCase() ===
                              dm.sharedSongSnapshot?.title.toLowerCase()
                          ));

                      return (
                        <div
                          key={dm.id}
                          className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-[#2e3035] transition-colors"
                        >
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              isMe
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {dm.senderName.slice(0, 2).toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold ${
                                  isMe ? 'text-amber-400' : 'text-indigo-300'
                                }`}
                              >
                                {dm.senderName}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                {dm.timestamp}
                              </span>
                            </div>

                            <p className="text-sm text-slate-200 mt-1 leading-relaxed">
                              {dm.text}
                            </p>

                            {dm.voiceClipUrl && (
                              <div className="mt-2 p-2.5 rounded-xl bg-[#2b2d31] border border-white/10 flex flex-col sm:flex-row sm:items-center gap-2.5 max-w-md">
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                                    <Mic className="w-4 h-4" />
                                  </div>
                                  <span className="text-xs font-bold text-white">
                                    Audio ({dm.voiceClipDurationSec || 4}s)
                                  </span>
                                </div>
                                <audio
                                  controls
                                  src={dm.voiceClipUrl}
                                  className="h-8 w-full sm:w-52"
                                />
                              </div>
                            )}

                            {dm.sharedSongSnapshot && (
                              <div className="mt-2.5 p-3 rounded-xl bg-[#2b2d31] border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-lg">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                                    <Music className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">
                                      {dm.sharedSongSnapshot.title} (Tono{' '}
                                      {dm.sharedSongSnapshot.originalKey} ·{' '}
                                      {dm.sharedSongSnapshot.bpm} BPM)
                                    </p>
                                    <p className="text-[11px] text-slate-400 truncate">
                                      {dm.sharedSongSnapshot.artist} · Cifrado y estructura incluidos
                                    </p>
                                  </div>
                                </div>

                                {!isMe && onImportSharedSongToRepertoire && (
                                  <button
                                    type="button"
                                    disabled={Boolean(alreadyImported)}
                                    onClick={() => {
                                      if (!dm.sharedSongSnapshot) return;
                                      onImportSharedSongToRepertoire(
                                        dm.sharedSongSnapshot
                                      );
                                      setImportedSongIds((prev) => [
                                        ...prev,
                                        dm.sharedSongSnapshot!.id,
                                      ]);
                                      setSocialFeedback(
                                        `«${dm.sharedSongSnapshot.title}» se guardó en el Repertorio de tu grupo.`
                                      );
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                                      alreadyImported
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                    }`}
                                  >
                                    {alreadyImported ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>En tu Repertorio</span>
                                      </>
                                    ) : (
                                      <>
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Guardar en mi Grupo</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Barra de Envío de Mensaje Directo (DM) */}
                <div className="p-3 sm:p-4 bg-[#313338] border-t border-black/20 space-y-2">
                  {pendingVoiceClip && (
                    <div className="p-2.5 rounded-xl bg-[#2b2d31] border border-emerald-500/40 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-300">
                        Audio listo ({pendingVoiceClip.durationSec}s)
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingVoiceClip(null)}
                        className="text-xs font-bold text-rose-400"
                      >
                        Quitar
                      </button>
                    </div>
                  )}

                  {showSongPicker && (
                    <div className="p-2.5 rounded-xl bg-[#2b2d31] border border-white/10 flex items-center justify-between gap-2">
                      <select
                        value={attachedSongId}
                        onChange={(e) => setAttachedSongId(e.target.value)}
                        className="flex-1 bg-[#1e1f22] text-white text-xs rounded-lg px-3 py-2 border border-white/10"
                      >
                        <option value="">
                          Selecciona una canción para compartir copia con{' '}
                          {selectedFriend.name}...
                        </option>
                        {songs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} ({s.originalKey}) — {s.artist}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedSongId('');
                          setShowSongPicker(false);
                        }}
                        className="text-xs text-slate-400 hover:text-white px-2"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}

                  <form
                    onSubmit={handleSubmit}
                    className="flex items-center gap-2 bg-[#383a40] rounded-2xl px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => setShowSongPicker((prev) => !prev)}
                      className="p-2 rounded-xl text-indigo-400 hover:text-indigo-300 hover:bg-white/10 transition-colors"
                      title="Compartir copia de canción con este amigo"
                    >
                      <Music className="w-5 h-5" />
                    </button>

                    {!isRecordingVoice ? (
                      <button
                        type="button"
                        onClick={handleStartVoiceRecording}
                        className="p-2 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-white/10 transition-colors"
                        title="Grabar nota de voz"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopVoiceRecording}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>{voiceSeconds}s</span>
                      </button>
                    )}

                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder={`Escribe un mensaje directo a ${selectedFriend.name}...`}
                      className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
                    />

                    <button
                      type="submit"
                      className="min-h-[38px] px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">Enviar</span>
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              /* Cuando aún no hay un amigo seleccionado, mostrar el Buscador de Músicos y Solicitudes en el área central */
              <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full space-y-5">
                <div className="p-5 rounded-2xl bg-[#2b2d31] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Tu Perfil de Músico en jesustone
                      </h3>
                      <p className="text-xs text-slate-400">
                        Comparte tu ID o @usuario con músicos de otras bandas para conectar por DM o ser invitado como suplente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyMyCode}
                      className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-mono font-bold text-white flex items-center gap-1.5 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{myMusicianCode}</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#2b2d31] border border-white/10 space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-indigo-400" />
                    Buscar Músicos en la App
                  </h4>
                  <input
                    type="text"
                    value={musicianSearchQuery}
                    onChange={(e) => setMusicianSearchQuery(e.target.value)}
                    placeholder="Escribe nombre, @usuario, ID (JST-...) o instrumento..."
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#1e1f22] border border-white/10 text-xs text-white"
                  />
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {searchableMusicians.map((musician) => {
                      const isFriend = friends.some((f) => f.id === musician.id);
                      const pendingSent = outgoingFriendRequests.some(
                        (r) => r.toUserId === musician.id
                      );
                      return (
                        <div
                          key={musician.id}
                          className="p-3 rounded-xl bg-[#1e1f22] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                              {musician.avatarInitials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">
                                {musician.name}{' '}
                                <span className="text-slate-400 font-mono font-normal">
                                  @{musician.username}
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {(musician.instruments || []).join(', ')}
                              </p>
                            </div>
                          </div>

                          {isFriend ? (
                            <button
                              type="button"
                              onClick={() => setSelectedFriendId(musician.id)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                            >
                              Abrir DM
                            </button>
                          ) : pendingSent ? (
                            <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold">
                              Solicitud enviada
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (!onSendFriendRequest) return;
                                const res = onSendFriendRequest(musician);
                                setSocialFeedback(res.message);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Agregar Amigo</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ===============================================================
             VISTA DE CANALES INTERNOS DEL GRUPO (#avisos, #general, etc.)
             =============================================================== */
          <>
            <header className="h-14 px-3 sm:px-4 border-b border-black/30 flex items-center justify-between gap-2 sm:gap-3 shrink-0 bg-[#313338] min-w-0">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="md:hidden min-h-[38px] min-w-[38px] rounded-xl bg-[#2b2d31] hover:bg-[#383a40] flex items-center justify-center text-slate-200 shrink-0 transition-colors"
                  aria-label="Abrir canales y grupos"
                  title="Canales"
                >
                  <Menu className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${currentGroupAccent.bgClass}`}
                  >
                    <BrandIconDisplay
                      iconId={currentGroupIdentity.iconId}
                      customImageUrl={currentGroupIdentity.customImageUrl}
                      className="w-4 h-4"
                    />
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold truncate">
                      <span className="truncate hidden sm:inline max-w-[130px]">
                        {currentGroupIdentity.ministryName}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-500 shrink-0 hidden sm:inline" />
                      <span className="text-white flex items-center gap-1 font-bold truncate">
                        <Hash className="w-3.5 h-3.5 text-amber-400 inline shrink-0" />
                        <span className="truncate">{channelMeta.name}</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate hidden sm:block">
                      {channelMeta.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setChatMode('social')}
                  className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-xs font-bold text-white flex items-center gap-1.5 transition-colors relative"
                  title="Amigos y Mensajes Directos (DM)"
                >
                  <Users className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Amigos y DM</span>
                  {incomingFriendRequests.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                      {incomingFriendRequests.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setMobileMembersOpen(!mobileMembersOpen)}
                  className="lg:hidden min-h-[36px] px-2.5 py-1.5 rounded-xl bg-[#2b2d31] hover:bg-[#383a40] text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
                  title={`${currentGroupMembers.length} miembros en este grupo`}
                >
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>{currentGroupMembers.length}</span>
                </button>

                <button
                  type="button"
                  onClick={onExitFullScreenChat}
                  className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
                  title="Volver al menú principal"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                  <div className="pb-4 border-b border-white/10 space-y-1">
                    <div className="w-12 h-12 rounded-full bg-[#404249] flex items-center justify-center mb-2">
                      <Hash className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      ¡Te damos la bienvenida a #{channelMeta.name}!
                    </h3>
                    <p className="text-xs text-slate-400">
                      {channelMeta.description}
                    </p>
                  </div>

                  {channelMessages.map((msg) => {
                    const attachedSong = msg.attachedSongId
                      ? songs.find((s) => s.id === msg.attachedSongId)
                      : undefined;
                    const prayedByMe = msg.prayedByMemberIds?.includes(
                      activeMember.id
                    );
                    const senderInitials = msg.senderName
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-3.5 p-2.5 rounded-2xl transition-colors ${
                          msg.isPinned
                            ? 'bg-amber-500/10 border border-amber-500/20'
                            : 'hover:bg-[#2e3035]'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                            msg.senderRole === 'leader'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {senderInitials}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-bold ${
                                msg.senderRole === 'leader'
                                  ? 'text-amber-400'
                                  : 'text-white'
                              }`}
                            >
                              {msg.senderName}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400">
                              {msg.senderRole === 'leader'
                                ? 'LÍDER / ADMIN'
                                : 'MIEMBRO'}{' '}
                              · {msg.senderInstrument}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {msg.timestamp}
                            </span>
                            {msg.isPinned && (
                              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                                <Pin className="w-3 h-3" />
                                Fijado
                              </span>
                            )}
                            {onDeleteMessage &&
                              (msg.senderId === activeMember.id ||
                                activeMember.role === 'leader') && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteMessage(msg.id, currentGroup.id)}
                                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                  title="Eliminar mensaje"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Eliminar</span>
                                </button>
                              )}
                          </div>

                          <p className="text-sm text-slate-200 mt-1 leading-relaxed">
                            {msg.text.split(/(@[\w._-]+)/g).map((part, idx) =>
                              part.startsWith('@') ? (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-xs"
                                >
                                  {part}
                                </span>
                              ) : (
                                <React.Fragment key={idx}>{part}</React.Fragment>
                              )
                            )}
                          </p>

                          {msg.voiceClipUrl && (
                            <div className="mt-2.5 p-3 rounded-xl bg-[#2b2d31] border border-white/10 flex flex-col sm:flex-row sm:items-center gap-3 max-w-md">
                              <div className="flex items-center gap-2 shrink-0">
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent.bgClass}`}
                                >
                                  <Mic className="w-4 h-4" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-white">
                                    Nota de Voz / Audio
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-400">
                                    {msg.voiceClipDurationSec || 4}s · Clip de banda
                                  </p>
                                </div>
                              </div>
                              <audio
                                controls
                                src={msg.voiceClipUrl}
                                className="h-9 w-full sm:w-56"
                              />
                            </div>
                          )}

                          {attachedSong && (
                            <button
                              type="button"
                              onClick={() => onOpenSongFromChat(attachedSong.id)}
                              className="mt-2.5 p-3 rounded-xl bg-[#2b2d31] border border-white/10 hover:border-amber-500/50 flex items-center gap-3 text-left transition-all"
                            >
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent.bgClass}`}
                              >
                                <Music className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-white">
                                  {attachedSong.title} (Tono{' '}
                                  {attachedSong.originalKey})
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  Subida por {attachedSong.addedByName} · Toca
                                  para abrir en Cancionero
                                </p>
                              </div>
                            </button>
                          )}

                          {activeChannel === 'oracion' && (
                            <div className="mt-2.5">
                              <button
                                type="button"
                                onClick={() => onTogglePrayerReaction(msg.id, currentGroup.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                                  prayedByMe
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-[#2b2d31] text-slate-300 hover:bg-[#383a40]'
                                }`}
                              >
                                <HeartHandshake className="w-3.5 h-3.5" />
                                <span>
                                  {prayedByMe
                                    ? 'Orando por esto'
                                    : 'Unirme en oración'}
                                </span>
                                <span className="font-mono ml-1">
                                  {msg.prayerCount || 0}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-3 sm:p-4 bg-[#313338] border-t border-black/20 space-y-2">
                  {pendingVoiceClip && (
                    <div className="p-3 rounded-xl bg-[#2b2d31] border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Mic className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-300">
                          Nota de voz grabada ({pendingVoiceClip.durationSec}s)
                          lista para enviar
                        </span>
                        <audio
                          controls
                          src={pendingVoiceClip.url}
                          className="h-8 max-w-[200px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingVoiceClip(null)}
                        className="text-xs font-bold text-rose-400 hover:text-rose-300 px-2"
                      >
                        Descartar audio
                      </button>
                    </div>
                  )}

                  {showSongPicker && (
                    <div className="p-3 rounded-xl bg-[#2b2d31] border border-white/10 flex items-center justify-between gap-2">
                      <select
                        value={attachedSongId}
                        onChange={(e) => setAttachedSongId(e.target.value)}
                        className="flex-1 bg-[#1e1f22] text-white text-xs rounded-lg px-3 py-2 border border-white/10"
                      >
                        <option value="">
                          Selecciona una canción del Repertorio para adjuntar...
                        </option>
                        {currentGroupSongs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} ({s.originalKey}) — Subida por{' '}
                            {s.addedByName}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedSongId('');
                          setShowSongPicker(false);
                        }}
                        className="text-xs text-slate-400 hover:text-white px-2"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}

                  {showMentionPicker && (
                    <div className="p-3 rounded-xl bg-[#2b2d31] border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold text-amber-400">
                          Toca un integrante para etiquetarlo y enviarle
                          notificación:
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowMentionPicker(false)}
                          className="hover:text-white"
                        >
                          Cerrar
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentGroupMembers.map((m) => {
                          const handle =
                            m.username ||
                            m.name.toLowerCase().replace(/\s+/g, '_');
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setMessageText(
                                  (prev) =>
                                    `${prev}${
                                      prev.endsWith(' ') || !prev ? '' : ' '
                                    }@${handle} `
                                );
                                setShowMentionPicker(false);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#383a40] hover:bg-amber-500 hover:text-slate-950 text-xs font-mono font-bold text-slate-200 transition-colors"
                            >
                              @{handle} ({m.name.split(' ')[0]})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={handleSubmit}
                    className="flex items-center gap-2 bg-[#383a40] rounded-2xl px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowSongPicker(!showSongPicker);
                        setShowMentionPicker(false);
                      }}
                      className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                      title="Adjuntar canción del repertorio"
                    >
                      <PlusCircle className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMentionPicker(!showMentionPicker);
                        setShowSongPicker(false);
                      }}
                      className="p-2 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-white/10 transition-colors"
                      title="Etiquetar a un usuario (@usuario)"
                    >
                      <AtSign className="w-5 h-5" />
                    </button>

                    {!isRecordingVoice ? (
                      <button
                        type="button"
                        onClick={handleStartVoiceRecording}
                        className="p-2 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-white/10 transition-colors"
                        title="Grabar nota de voz / clip de audio"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStopVoiceRecording}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse"
                        title="Detener grabación de voz"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>{voiceSeconds}s</span>
                      </button>
                    )}

                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder={`Enviar mensaje, @etiqueta o nota de voz en #${channelMeta.name}...`}
                      className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
                    />

                    <button
                      type="submit"
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">Enviar</span>
                    </button>
                  </form>
                </div>
              </div>

              {/* 4. PANEL DERECHO DE MIEMBROS DEL GRUPO */}
              <aside
                className={`${
                  mobileMembersOpen
                    ? 'fixed inset-y-0 right-0 z-50 flex'
                    : 'hidden lg:flex'
                } w-64 bg-[#2b2d31] border-l border-black/20 flex-col p-4 space-y-5 overflow-y-auto shrink-0`}
              >
                {mobileMembersOpen && (
                  <div className="flex items-center justify-between lg:hidden pb-2 border-b border-white/10">
                    <span className="text-xs font-bold uppercase text-slate-300">
                      Miembros del Grupo
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileMembersOpen(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    LÍDER / ADMIN — {leaders.length}
                  </p>
                  {leaders.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#35373c]"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0">
                        {m.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-amber-400 truncate">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {m.instruments.join(', ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    TITULARES — {regularMembers.length}
                  </p>
                  {regularMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#35373c]"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#383a40] text-slate-200 font-bold text-xs flex items-center justify-center shrink-0">
                        {m.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {m.instruments.join(', ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {guestMembers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80">
                      SUPLENTES / INVITADOS — {guestMembers.length}
                    </p>
                    {guestMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#35373c]"
                      >
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0">
                          {m.avatarInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {m.name}
                          </p>
                          <p className="text-[10px] text-amber-400/80 truncate">
                            Invitado · {m.instruments.join(', ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
