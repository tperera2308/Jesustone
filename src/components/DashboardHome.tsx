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
  Clock,
  FolderPlus,
  Mail,
  MessageSquare,
  Music,
  Palette,
  Plus,
  Settings,
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
  onUpdateRSVP: (
    eventId: string,
    role: InstrumentRole,
    status: RSVPStatus,
    assignmentIndex?: number,
    assignmentId?: string
  ) => void;
  onOpenSongInSongbook: (songId: string, customKey?: string) => void;
  onOpenMetronomeWithSong: (bpm: number, timeSignature: TimeSignature) => void;
}

function getTodayStr(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  const todayStr = getTodayStr();

  // Eventos próximos ordenados del más cercano al más lejano
  const upcomingEvents = [...events]
    .filter((ev) => ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const recentActivityFeed = activityFeed.slice(0, 5);

  // Solicitudes pendientes vs Eventos ya confirmados del miembro activo (ordenados cronológicamente)
  const myUpcomingEventItems = upcomingEvents
    .map((ev) => {
      const myAssigns = ev.assignments
        .map((a, index) => ({ assignment: a, index }))
        .filter((item) => item.assignment.memberId === activeMember.id);
      if (myAssigns.length === 0) return null;

      const status = myAssigns[0].assignment.rsvpStatus;
      if (status === 'declined') return null;

      const combinedRoles = Array.from(
        new Set(
          myAssigns.flatMap(({ assignment }) =>
            assignment.roles && assignment.roles.length > 0
              ? assignment.roles
              : [assignment.role]
          )
        )
      );

      return {
        event: ev,
        myAssigns,
        status,
        rolesText: combinedRoles.join(' + '),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="space-y-4 w-full max-w-full min-w-0">
      {/* 1. CABECERA DEL GRUPO MUSICAL: MINIMALISTA Y COMPACTA */}
      <div className="rounded-2xl bg-slate-900 text-white border border-slate-800 p-3.5 sm:p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 overflow-hidden ${accent.bgClass}`}
            >
              <BrandIconDisplay
                iconId={identity.iconId}
                customImageUrl={identity.customImageUrl}
                className={identity.customImageUrl ? 'w-full h-full' : 'w-5 h-5'}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="font-bold text-amber-400">jesustone</span>
                <span>·</span>
                <span className="truncate">{members.length} integrantes</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
                {identity.ministryName}
              </h1>
            </div>
          </div>

          {/* Botón compacto de perfil de usuario */}
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center gap-2 text-left transition-all shrink-0"
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 overflow-hidden ${
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
            <div className="hidden sm:block pr-1">
              <p className="text-xs font-bold text-white leading-tight">
                {activeMember.name}
              </p>
              <p className="text-[10px] text-slate-300 leading-tight">
                {isLeader ? 'Líder' : 'Miembro'} · Perfil y Grupos
              </p>
            </div>
          </button>
        </div>

        {/* Fila minimalista de botones pequeños del grupo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => onOpenIdentityModal('grupo')}
            className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 text-left transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              Datos del Grupo
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenIdentityModal('temas')}
            className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 text-left transition-colors"
          >
            <Palette className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              Temas y Color
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenIdentityModal('invitaciones')}
            className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 text-left transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              {isLeader ? 'Invitar Miembros' : `Código: ${identity.inviteCode}`}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAuthModal}
            className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2 text-left transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              Cambiar / Crear Grupo
            </span>
          </button>
        </div>
      </div>

      {/* 2. FILA SUPERIOR: ACCESOS PRINCIPALES + TU ASISTENCIA INMEDIATA A LA MISMA ALTURA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Accesos Principales (7 columnas en desktop) */}
        <div className="lg:col-span-7 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            Accesos Principales
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('cancionero')}
              className="min-h-[72px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-2xs flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.softBgClass}`}
              >
                <Music className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Cancionero
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {songs.length} canciones
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('eventos')}
              className="min-h-[72px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-2xs flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.softBgClass}`}
              >
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Eventos
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {upcomingEvents.length} próximos
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('herramientas')}
              className="min-h-[72px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-2xs flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Herramientas
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Afinador, Piano y Clic
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('devocionales')}
              className="min-h-[72px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-2xs flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.softBgClass}`}
              >
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Estudios
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {devotionals.length} estudios
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="min-h-[72px] p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 shadow-2xs flex items-center gap-3 text-left transition-transform active:scale-[0.98] col-span-2 sm:col-span-2"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Chat del Grupo
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Canales #avisos, #general, #ensayos y #oracion
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Tu Asistencia Inmediata (5 columnas en desktop, a la altura de Accesos Principales) */}
        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Tu Asistencia Inmediata</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('eventos')}
              className={`text-xs font-bold ${accent.textClass} hover:underline`}
            >
              Ver todos →
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
            {myUpcomingEventItems.length > 0 ? (
              <div className="space-y-2">
                {myUpcomingEventItems.slice(0, 3).map(({ event, myAssigns, status, rolesText }) => {
                  const handleUpdateAllMyRolesInEvent = (nextStatus: RSVPStatus) => {
                    myAssigns.forEach(({ assignment, index }) => {
                      onUpdateRSVP(
                        event.id,
                        assignment.role,
                        nextStatus,
                        index,
                        assignment.id
                      );
                    });
                  };

                  // Cuando ya fue aceptada, desaparece la solicitud y solo queda la tarjeta limpia del evento
                  if (status === 'confirmed') {
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onNavigate('eventos')}
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-left transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            <span>{event.date}</span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-500" />
                              Cit: {event.callTime}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                            {event.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Rol: <strong className={accent.textClass}>{rolesText}</strong>
                          </p>
                        </div>

                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmado
                        </span>
                      </button>
                    );
                  }

                  // Si está pendiente, se muestra la solicitud de asistencia para aceptar o declinar
                  return (
                    <div
                      key={event.id}
                      className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            <span>{event.date}</span>
                            <span>·</span>
                            <span>Citación {event.callTime}</span>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                            {event.title}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            Rol asignado: <strong className={accent.textClass}>{rolesText}</strong>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold shrink-0">
                          Solicitud
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateAllMyRolesInEvent('confirmed')}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aceptar
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateAllMyRolesInEvent('declined')}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-white dark:bg-slate-900 border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Declinar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Sin eventos próximos asignados por ahora.</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('eventos')}
                  className={`font-bold ${accent.textClass} shrink-0`}
                >
                  Eventos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. DEBAJO: FEED DE ACTIVIDADES INMEDIATAS (ORDENADO Y LIMPIO, SIN PLAYLIST DUPLICADA) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${accent.textClass}`} />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Feed de Actividades Recientes
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Últimas {recentActivityFeed.length} actividades
          </span>
        </div>

        {/* Avisos urgentes dentro del Feed */}
        {alerts.map((al) => (
          <div
            key={al.id}
            className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  {al.title}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                  {al.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('eventos')}
              className="min-h-[34px] px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold whitespace-nowrap shrink-0"
            >
              Ver Evento
            </button>
          </div>
        ))}

        {recentActivityFeed.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentActivityFeed.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between gap-2.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {item.actorName}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          item.actorRole === 'leader'
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-sky-600 dark:text-sky-400 font-semibold'
                        }
                      >
                        {item.actorRole === 'leader' ? 'Líder' : 'Miembro'}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums shrink-0">{item.timestamp}</span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.targetTab === 'cancionero' && item.targetId) {
                        onOpenSongInSongbook(item.targetId);
                      } else {
                        onNavigate(item.targetTab);
                      }
                    }}
                    className="min-h-[34px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                  >
                    <span>
                      {item.type === 'song_added'
                        ? 'Ver Canción'
                        : item.type === 'playlist_updated'
                        ? 'Ver Playlist'
                        : 'Abrir'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aquí aparecerán las canciones agregadas al repertorio, los eventos programados y las confirmaciones del equipo.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('cancionero')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Canción</span>
              </button>
              {isLeader && (
                <button
                  type="button"
                  onClick={() => onNavigate('eventos')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Programar Evento</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

