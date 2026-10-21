import React, { useRef, useState } from 'react';
import {
  AccentColorId,
  AppIdentity,
  BandMember,
  ChatChannelId,
  ChatMessage,
  Song,
} from '../types';
import { generateDemoVoiceClipDataUrl } from '../utils/audioEngine';
import { BrandIconDisplay, getAccentClasses } from './IdentityModal';
import {
  ArrowLeft,
  AtSign,
  ChevronDown,
  Hash,
  HeartHandshake,
  Menu,
  Mic,
  Music,
  Pin,
  PlusCircle,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react';

interface ChatModuleProps {
  identity: AppIdentity;
  messages: ChatMessage[];
  members: BandMember[];
  songs: Song[];
  activeMember: BandMember;
  accentColor: AccentColorId;
  onSendMessage: (
    channel: ChatChannelId,
    text: string,
    attachedSongId?: string,
    voiceClipUrl?: string,
    voiceClipDurationSec?: number
  ) => void;
  onDeleteMessage?: (messageId: string) => void;
  onTogglePrayerReaction: (messageId: string) => void;
  onOpenSongFromChat: (songId: string) => void;
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
        description: 'Comunicados del Líder, horarios de citación y playlists dominicales',
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
        description: 'Peticiones de oración e intercesión por el equipo y la iglesia',
      },
    ],
  },
];

export const ChatModule: React.FC<ChatModuleProps> = ({
  identity,
  messages,
  members,
  songs,
  activeMember,
  accentColor,
  onSendMessage,
  onDeleteMessage,
  onTogglePrayerReaction,
  onOpenSongFromChat,
  onExitFullScreenChat,
}) => {
  const accent = getAccentClasses(accentColor);
  const [activeChannel, setActiveChannel] = useState<ChatChannelId>('general');
  const [messageText, setMessageText] = useState('');
  const [attachedSongId, setAttachedSongId] = useState<string>('');
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);

  // Voice Note Recording State in Chat
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [pendingVoiceClip, setPendingVoiceClip] = useState<{
    url: string;
    durationSec: number;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const allChannels = CHANNEL_CATEGORIES.flatMap((c) => c.channels);
  const channelMeta =
    allChannels.find((c) => c.id === activeChannel) || allChannels[0];
  const channelMessages = messages.filter((m) => m.channel === activeChannel);

  const leaders = members.filter((m) => m.role === 'leader');
  const regularMembers = members.filter((m) => m.role !== 'leader');

  const handleStartVoiceRecording = async () => {
    setVoiceSeconds(0);
    setIsRecordingVoice(true);
    audioChunksRef.current = [];

    timerRef.current = window.setInterval(() => {
      setVoiceSeconds((prev) => prev + 1);
    }, 1000);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              finalizeClip(reader.result);
            } else {
              finalizeClip(generateDemoVoiceClipDataUrl(finalSec));
            }
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
    if (!messageText.trim() && !pendingVoiceClip) return;
    onSendMessage(
      activeChannel,
      messageText.trim() ||
        `🎤 Nota de voz enviada (${pendingVoiceClip?.durationSec || 3}s)`,
      attachedSongId || undefined,
      pendingVoiceClip?.url,
      pendingVoiceClip?.durationSec
    );
    setMessageText('');
    setAttachedSongId('');
    setPendingVoiceClip(null);
    setShowSongPicker(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#313338] text-slate-100 flex overflow-hidden select-none">
      {/* 1. RIEL IZQUIERDO DE SERVIDOR ESTILO DISCORD (Desktop & Tablet) */}
      <aside className="hidden sm:flex flex-col items-center justify-between py-4 w-[72px] bg-[#1e1f22] shrink-0 border-r border-white/5">
        <div className="flex flex-col items-center gap-3">
          {/* Botón Volver a jesustone */}
          <button
            type="button"
            onClick={onExitFullScreenChat}
            className="w-12 h-12 rounded-2xl bg-[#313338] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-all"
            title="Salir del Chat a Inicio"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="w-8 h-[2px] bg-white/10 rounded-full" />

          {/* Icono Activo del Servidor del Grupo */}
          <div className="relative group">
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-10 bg-white rounded-r-full" />
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${accent.bgClass}`}
              title={identity.ministryName}
            >
              <BrandIconDisplay iconId={identity.iconId} className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center"
            title={activeMember.name}
          >
            {activeMember.avatarInitials}
          </div>
        </div>
      </aside>

      {/* 2. COLUMNA DE CANALES ESTILO DISCORD (Fija en Desktop, Drawer en Móvil) */}
      <div
        className={`${
          mobileDrawerOpen ? 'fixed inset-0 z-50 flex' : 'hidden md:flex'
        } md:relative md:w-64 shrink-0`}
      >
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs md:hidden"
            onClick={() => setMobileDrawerOpen(false)}
          />
        )}

        <div className="relative z-10 w-72 md:w-64 h-full bg-[#2b2d31] flex flex-col justify-between border-r border-black/20">
          {/* Cabecera del Servidor */}
          <div>
            <div className="h-14 px-4 border-b border-black/30 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {identity.ministryName}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  jesustone · Chat del Grupo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Botón Grande para Volver a la App principal */}
            <div className="p-2.5 border-b border-black/20">
              <button
                type="button"
                onClick={onExitFullScreenChat}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#383a40] hover:bg-[#404249] text-xs font-bold text-white flex items-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Volver al Menú de jesustone</span>
              </button>
            </div>

            {/* Lista de Categorías y Canales (#avisos, #general, #ensayos, #sugerencias, #oracion) */}
            <div className="p-2.5 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)]">
              {CHANNEL_CATEGORIES.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center gap-1 px-2 text-[11px] font-bold tracking-wider text-slate-400">
                    <ChevronDown className="w-3 h-3" />
                    <span>{cat.category}</span>
                  </div>
                  {cat.channels.map((ch) => {
                    const isSelected = ch.id === activeChannel;
                    const msgCount = messages.filter(
                      (m) => m.channel === ch.id
                    ).length;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setActiveChannel(ch.id);
                          setMobileDrawerOpen(false);
                        }}
                        className={`w-full min-h-[42px] px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 text-sm font-medium transition-colors ${
                          isSelected
                            ? 'bg-[#404249] text-white font-semibold'
                            : 'text-slate-400 hover:bg-[#35373c] hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate">{ch.name}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">
                          {msgCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Barra Inferior de Usuario Activo Estilo Discord */}
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
                <p className="text-[10px] text-slate-400 truncate">
                  {activeMember.role === 'leader' ? 'Líder / Admin' : 'Miembro'} · En línea
                </p>
              </div>
            </div>
            <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* 3. ÁREA CENTRAL DE CONVERSACIÓN A PANTALLA COMPLETA */}
      <div className="flex-1 flex flex-col h-full bg-[#313338] min-w-0">
        {/* Barra Superior del Canal Activo */}
        <header className="h-14 px-4 border-b border-black/30 flex items-center justify-between gap-3 shrink-0 bg-[#313338]">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Botón Hamburguesa Canales en Móvil */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="md:hidden min-h-[40px] min-w-[40px] rounded-xl bg-[#2b2d31] flex items-center justify-center text-slate-200"
              aria-label="Ver canales"
            >
              <Menu className="w-5 h-5" />
            </button>

            <Hash className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {channelMeta.name}
              </h2>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                {channelMeta.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMembersOpen(!mobileMembersOpen)}
              className="lg:hidden min-h-[38px] px-3 py-1.5 rounded-xl bg-[#2b2d31] text-xs font-bold text-slate-200 flex items-center gap-1.5"
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span>{members.length}</span>
            </button>

            <button
              type="button"
              onClick={onExitFullScreenChat}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-xs font-bold text-white flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </header>

        {/* Contenedor de Mensajes + Lista Derecha de Miembros */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {/* Flujo de Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Mensaje de Bienvenida al Canal Estilo Discord */}
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
                          {msg.senderRole === 'leader' ? 'LÍDER / ADMIN' : 'MIEMBRO'} ·{' '}
                          {msg.senderInstrument}
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
                              onClick={() => onDeleteMessage(msg.id)}
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
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent.bgClass}`}>
                            <Music className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">
                              {attachedSong.title} (Tono {attachedSong.originalKey})
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Subida por {attachedSong.addedByName} · Toca para abrir en Cancionero
                            </p>
                          </div>
                        </button>
                      )}

                      {activeChannel === 'oracion' && (
                        <div className="mt-2.5">
                          <button
                            type="button"
                            onClick={() => onTogglePrayerReaction(msg.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                              prayedByMe
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-[#2b2d31] text-slate-300 hover:bg-[#383a40]'
                            }`}
                          >
                            <HeartHandshake className="w-3.5 h-3.5" />
                            <span>
                              {prayedByMe ? 'Orando por esto' : 'Unirme en oración'}
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
            </div>

            {/* Barra Inferior de Envío Estilo Discord */}
            <div className="p-3 sm:p-4 bg-[#313338] border-t border-black/20 space-y-2">
              {pendingVoiceClip && (
                <div className="p-3 rounded-xl bg-[#2b2d31] border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Mic className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">
                      Nota de voz grabada ({pendingVoiceClip.durationSec}s) lista para enviar
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
                    <option value="">Selecciona una canción del Repertorio para adjuntar...</option>
                    {songs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.originalKey}) — Subida por {s.addedByName}
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
                      Toca un integrante para etiquetarlo y enviarle notificación:
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
                    {members.map((m) => {
                      const handle = m.username || m.name.toLowerCase().replace(/\s+/g, '_');
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMessageText((prev) =>
                              `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}@${handle} `
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

          {/* 4. PANEL DERECHO DE MIEMBROS DEL GRUPO ESTILO DISCORD */}
          <aside
            className={`${
              mobileMembersOpen ? 'fixed inset-y-0 right-0 z-50 flex' : 'hidden lg:flex'
            } w-64 bg-[#2b2d31] border-l border-black/20 flex-col p-4 space-y-5 overflow-y-auto shrink-0`}
          >
            {mobileMembersOpen && (
              <div className="flex items-center justify-between lg:hidden pb-2 border-b border-white/10">
                <span className="text-xs font-bold uppercase text-slate-300">
                  Miembros delServidor
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

            {/* Categoría: LÍDER / ADMIN */}
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

            {/* Categoría: MIEMBROS DEL GRUPO */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                MIEMBROS DE BANDA — {regularMembers.length}
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
          </aside>
        </div>
      </div>
    </div>
  );
};
