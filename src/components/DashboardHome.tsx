import React from 'react';
import {
  ActivityFeedItem,
  AppIdentity,
  BandMember,
  Devotional,
  InstrumentRole,
  NavigationTab,
  NoticeAlert,
  RSVPStatus,
  Song,
  TimeSignature,
  WorshipEvent,
} from '../types';
import { BrandIconDisplay, getAccentClasses } from './IdentityModal';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ListMusic,
  Mail,
  MessageSquare,
  Music,
  Palette,
  Plus,
  Sliders,
  UserCheck,
  XCircle,
} from 'lucide-react';

interface DashboardHomeProps {
  identity: AppIdentity;
  activeMember: BandMember;
  members: BandMember[];
  events: WorshipEvent[];
  songs: Song[];
  devotionals: Devotional[];
  alerts: NoticeAlert[];
  activityFeed: ActivityFeedItem[];
  onNavigate: (tab: NavigationTab) => void;
  onOpenIdentityModal: (section: 'grupo' | 'temas' | 'invitaciones') => void;
  onOpenAuthModal: () => void;
  onUpdateRSVP: (eventId: string, role: InstrumentRole, status: RSVPStatus) => void;
  onOpenSongInSongbook: (songId: string, customKey?: string) => void;
  onOpenMetronomeWithSong: (bpm: number, timeSignature: TimeSignature) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  identity,
  activeMember,
  members,
  events,
  songs,
  devotionals,
  alerts,
  activityFeed,
  onNavigate,
  onOpenIdentityModal,
  onOpenAuthModal,
  onUpdateRSVP,
  onOpenSongInSongbook,
}) => {
  const accent = getAccentClasses(identity.accentColor);
  const isLeader = activeMember.role === 'leader';
  const nextEvent = events[0];

  const myAssignments = events
    .map((ev) => {
      const found = ev.assignments.find((a) => a.memberId === activeMember.id);
      return found ? { event: ev, assignment: found } : null;
    })
    .filter(Boolean) as {
    event: WorshipEvent;
    assignment: WorshipEvent['assignments'][0];
  }[];

  return (
    <div className="space-y-6">
      {/* TARJETA SUPERIOR DE BIENVENIDA Y PERFIL DE USUARIO (SIN DATO DE IGLESIA) */}
      <div className="rounded-3xl bg-slate-900 text-white border border-slate-800 p-5 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0 overflow-hidden ${accent.bgClass}`}
            >
              <BrandIconDisplay
                iconId={identity.iconId}
                customImageUrl={identity.customImageUrl}
                className={identity.customImageUrl ? 'w-full h-full' : 'w-7 h-7'}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="font-bold text-amber-400">jesustone</span>
                <span aria-hidden="true">·</span>
                <span>Grupo Musical</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {identity.ministryName}
              </h1>
            </div>
          </div>

          {/* Tarjeta de Usuario Logueado y Selector/Creador de Grupos */}
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="min-h-[56px] px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-between sm:justify-start gap-3 text-left transition-all"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ${
                isLeader ? 'bg-amber-500 text-slate-950' : 'bg-sky-500 text-white'
              }`}
            >
              {activeMember.avatarUrl ? (
                <img
                  src={activeMember.avatarUrl}
                  alt={activeMember.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                activeMember.avatarInitials
              )}
            </div>
            <div className="pr-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">
                  {activeMember.name}
                </span>
                {activeMember.username && (
                  <span className="text-xs font-mono text-slate-300">
                    @{activeMember.username}
                  </span>
                )}
                <span
                  className={`text-[11px] font-bold ${
                    isLeader ? 'text-amber-400' : 'text-sky-400'
                  }`}
                >
                  · {isLeader ? 'Líder de este grupo' : 'Miembro'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Foto de perfil · Mis Grupos (máx. 6)
              </p>
            </div>
          </button>
        </div>

        {/* BOTONES GRANDES DE CONFIGURACIÓN RÁPIDA (Datos del Grupo, Selector de Temas, Invitar, Crear/Cambiar Grupo) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <button
            type="button"
            onClick={() => onOpenIdentityModal('grupo')}
            className="min-h-[58px] p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                Datos del Grupo
              </p>
              <p className="text-xs text-slate-400 truncate">
                {identity.ministryName}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenIdentityModal('temas')}
            className="min-h-[58px] p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                Selector de Temas
              </p>
              <p className="text-xs text-slate-400 truncate">
                Colores y modo oscuro/claro
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onOpenIdentityModal('invitaciones')}
            className="min-h-[58px] p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                {isLeader ? 'Invitar por @usuario o correo' : 'Código e Integrantes'}
              </p>
              <p className="text-xs text-slate-400 truncate font-mono">
                Código: {identity.inviteCode} · {members.length} miembros
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenAuthModal}
            className="min-h-[58px] p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">
                Crear / Cambiar Grupo
              </p>
              <p className="text-xs text-slate-400 truncate">
                Hasta 6 grupos por usuario
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* CUADRÍCULA DE BOTONES GRANDES PARA LAS OPCIONES PRINCIPALES */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
          Accesos Principales de la App
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigate('cancionero')}
            className="min-h-[96px] p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-xs flex flex-col justify-between text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent.softBgClass}`}
              >
                <Music className="w-6 h-6" />
              </div>
              <span className="font-mono text-xs font-bold text-slate-400">
                {songs.length} temas
              </span>
            </div>
            <div className="mt-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                Repertorio y Listas
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Subir canciones y acordes
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('eventos')}
            className="min-h-[96px] p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-xs flex flex-col justify-between text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent.softBgClass}`}
              >
                <Calendar className="w-6 h-6" />
              </div>
              <span className="font-mono text-xs font-bold text-slate-400">
                {events.length} activos
              </span>
            </div>
            <div className="mt-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                Eventos y Playlists
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Domingos, ensayos y RSVP
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('devocionales')}
            className="min-h-[96px] p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-xs flex flex-col justify-between text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent.softBgClass}`}
              >
                <BookOpen className="w-6 h-6" />
              </div>
              <span className="font-mono text-xs font-bold text-slate-400">
                {devotionals.length} estudios
              </span>
            </div>
            <div className="mt-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                Estudios
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sesiones, versículos y checks
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="min-h-[96px] p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-xs flex flex-col justify-between text-left transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-indigo-500">
                Canales
              </span>
            </div>
            <div className="mt-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                Chat
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                #general, #ensayos, #oracion
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('herramientas')}
            className="min-h-[96px] p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-xs flex flex-col justify-between text-left transition-transform active:scale-[0.98] col-span-2 lg:col-span-1"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                <Sliders className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-emerald-500">
                3 Pantallas
              </span>
            </div>
            <div className="mt-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">
                Herramientas
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Afinador, Piano y Metrónomo
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* FEED DE ACTIVIDADES INMEDIATAS Y RESUMEN EN VIVO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda (7 cols): Feed Cronológico de Actividades Inmediatas */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Activity className={`w-5 h-5 ${accent.textClass}`} />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Feed de Actividades Inmediatas
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Resumen de actividad
            </span>
          </div>

          {/* Avisos urgentes dentro del Feed */}
          {alerts.map((al) => (
            <div
              key={al.id}
              className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {al.title}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-0.5">
                    {al.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('eventos')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0"
              >
                Ver Evento
              </button>
            </div>
          ))}

          {/* Tarjetas del Feed de Actividad o Estado Vacío */}
          {activityFeed.length > 0 ? (
            <div className="space-y-3">
              {activityFeed.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.actorName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          item.actorRole === 'leader'
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-sky-600 dark:text-sky-400 font-semibold'
                        }
                      >
                        {item.actorRole === 'leader' ? 'Líder / Admin' : 'Miembro'}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums">{item.timestamp}</span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (item.targetTab === 'cancionero' && item.targetId) {
                          onOpenSongInSongbook(item.targetId);
                        } else {
                          onNavigate(item.targetTab);
                        }
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 transition-colors"
                    >
                      <span>
                        {item.type === 'song_added'
                          ? 'Abrir Canción y Archivo'
                          : item.type === 'playlist_updated'
                          ? 'Ver Playlist del Evento'
                          : 'Abrir'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
              >
                <Activity className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  El feed de actividades está listo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Aquí aparecerán al instante las canciones agregadas al repertorio, los eventos programados, los estudios publicados y las confirmaciones de asistencia.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('cancionero')}
                  className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar Canción</span>
                </button>
                {isLeader && (
                  <button
                    type="button"
                    onClick={() => onNavigate('eventos')}
                    className="min-h-[44px] px-4 py-2 rounded-2xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Programar Evento</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Columna Derecha (5 cols): Resumen Inmediato de Asistencia RSVP + Próximo Evento */}
        <div className="lg:col-span-5 space-y-5">
          {/* Tus Próximos Compromisos e Instrumentos */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Tu Asistencia Inmediata (RSVP)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('eventos')}
                className={`text-xs font-bold ${accent.textClass}`}
              >
                Ver eventos
              </button>
            </div>

            {myAssignments.length > 0 ? (
              <div className="space-y-3">
                {myAssignments.map(({ event, assignment }) => (
                  <div
                    key={event.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        <span>{event.date}</span>
                        <span>Citación {event.callTime}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {event.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        Tu rol asignado:{' '}
                        <strong className={accent.textClass}>{assignment.role}</strong>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateRSVP(event.id, assignment.role, 'confirmed')
                        }
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          assignment.rsvpStatus === 'confirmed'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Confirmar
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onUpdateRSVP(event.id, assignment.role, 'declined')
                        }
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          assignment.rsvpStatus === 'declined'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        Declinar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No tienes asignaciones pendientes en los próximos eventos.
              </p>
            )}
          </div>

          {/* Playlist del Próximo Evento */}
          {nextEvent && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListMusic className={`w-5 h-5 ${accent.textClass}`} />
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Playlist: {nextEvent.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Toca cualquier canción para ver acordes y archivo
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {nextEvent.songs.map((item, idx) => {
                  const song = songs.find((s) => s.id === item.songId);
                  if (!song) return null;
                  return (
                    <button
                      key={`${item.songId}-${idx}`}
                      type="button"
                      onClick={() =>
                        onOpenSongInSongbook(
                          song.id,
                          item.customKey || song.originalKey
                        )
                      }
                      className="w-full min-h-[58px] p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-3 text-left transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          0{idx + 1}. {song.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          Subida por {song.addedByName} (
                          {song.addedByRole === 'leader' ? 'Líder' : 'Miembro'})
                        </p>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <span className={`text-xs font-bold ${accent.textClass}`}>
                          Tono {item.customKey || song.originalKey}
                        </span>
                        <p className="text-[10px] text-slate-400">{song.bpm} BPM</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
