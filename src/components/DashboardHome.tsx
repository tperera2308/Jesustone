import React, { useState } from 'react';
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
  WorshipGroup,
} from '../types';
import { BrandIconDisplay, getAccentClasses } from './IdentityModal';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FolderPlus,
  MessageSquare,
  Music,
  Plus,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserCheck,
  Users,
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
  userGroups?: WorshipGroup[];
  activeGroupId?: string;
  currentUserId?: string;
  friendsCount?: number;
  pendingFriendRequestsCount?: number;
  onSelectGroup?: (groupId: string) => void;
  onNavigate: (tab: NavigationTab) => void;
  onOpenIdentityModal: (section: 'grupo' | 'temas' | 'invitaciones') => void;
  onOpenAuthModal: () => void;
  onOpenMusicianProfile: (
    userId?: string,
    tab?: 'perfil' | 'amigos' | 'explorar'
  ) => void;
  onUpdateRSVP: (
    eventId: string,
    role: InstrumentRole,
    status: RSVPStatus,
    assignmentIndex?: number,
    assignmentId?: string
  ) => void;
  onOpenSongInSongbook: (
    songId: string,
    customKey?: string,
    eventId?: string,
    autoStageMode?: boolean
  ) => void;
  onOpenMetronomeWithSong: (bpm: number, timeSignature: TimeSignature) => void;
  initialOpenGroupScreen?: boolean;
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
  userGroups = [],
  activeGroupId = '',
  currentUserId = '',
  friendsCount = 0,
  pendingFriendRequestsCount = 0,
  onSelectGroup,
  onNavigate,
  onOpenIdentityModal,
  onOpenAuthModal,
  onOpenMusicianProfile,
  onUpdateRSVP,
  onOpenSongInSongbook,
  initialOpenGroupScreen = false,
}) => {
  const accent = getAccentClasses(identity.accentColor);
  const isLeader = activeMember.role === 'leader';
  const todayStr = getTodayStr();

  // Estado: false = Inicio General / Personal resumido; true = Pantalla Propia del Grupo
  const [isGroupScreenOpen, setIsGroupScreenOpen] = useState(
    Boolean(initialOpenGroupScreen)
  );
  const [groupSectionTab, setGroupSectionTab] = useState<
    'todo' | 'fechas' | 'estudio' | 'feed'
  >('todo');
  const [novedadesFilter, setNovedadesFilter] = useState<
    'all' | 'eventos' | 'mensajes' | 'repertorio'
  >('all');

  const resolvedUserId = currentUserId || activeMember.id;

  // Eventos próximos del grupo activo ordenados del más cercano al más lejano
  const upcomingEvents = [...events]
    .filter((ev) => ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const recentActivityFeed = activityFeed.slice(0, 6);

  // =========================================================================
  // DATOS AGREGADOS Y RESUMIDOS DE TODOS LOS GRUPOS DONDE PARTICIPA EL USUARIO
  // =========================================================================
  const groupsToSummarize: WorshipGroup[] =
    userGroups.length > 0
      ? userGroups
      : [
          {
            id: activeGroupId || 'active',
            leaderUserId: isLeader ? resolvedUserId : '',
            identity,
            members,
            invitations: [],
            events,
            songs,
            devotionals,
            chatMessages: [],
            alerts,
            activityFeed,
          },
        ];

  // Próximas fechas donde el usuario está asignado en cualquiera de sus grupos
  const crossGroupMyUpcomingAssignments = groupsToSummarize
    .flatMap((grp) => {
      const myMemberInGrp = grp.members.find((m) => m.id === resolvedUserId);
      const memberIdToMatch = myMemberInGrp?.id || activeMember.id;

      return grp.events
        .filter((ev) => ev.date >= todayStr)
        .map((ev) => {
          const myAssigns = ev.assignments
            .map((a, index) => ({ assignment: a, index }))
            .filter((item) => item.assignment.memberId === memberIdToMatch);
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
            groupId: grp.id,
            groupName: grp.identity.ministryName,
            isActiveGroup: grp.id === activeGroupId || userGroups.length === 0,
            event: ev,
            myAssigns,
            status,
            rolesText: combinedRoles.join(' + '),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    })
    .sort(
      (a, b) =>
        a.event.date.localeCompare(b.event.date) ||
        a.event.time.localeCompare(b.event.time)
    );

  // =========================================================================
  // SECCIÓN CONSOLIDADA DE "NOVEDADES" (EVENTOS, MENSAJES IMPORTANTES Y REPERTORIO)
  // DE TODOS LOS GRUPOS DONDE PARTICIPA EL USUARIO
  // =========================================================================
  interface ConsolidatedNovedadItem {
    id: string;
    category: 'eventos' | 'mensajes' | 'repertorio';
    categoryLabel: string;
    groupId: string;
    groupName: string;
    title: string;
    subtitle: string;
    metaRight: string;
    priorityHigh?: boolean;
    onClick: () => void;
  }

  const consolidatedNovedades: ConsolidatedNovedadItem[] = [];

  groupsToSummarize.forEach((grp) => {
    const myMemberInGrp = grp.members.find((m) => m.id === resolvedUserId);
    const isGuestInGrp = Boolean(
      myMemberInGrp?.isGuest && grp.leaderUserId !== resolvedUserId
    );

    // 1. Avisos importantes del grupo (Mensajes importantes)
    if (!isGuestInGrp) {
      (grp.alerts || []).slice(0, 2).forEach((al) => {
        consolidatedNovedades.push({
          id: `novedad-alert-${grp.id}-${al.id}`,
          category: 'mensajes',
          categoryLabel: 'Aviso Importante',
          groupId: grp.id,
          groupName: grp.identity.ministryName,
          title: al.title,
          subtitle: al.message,
          metaRight: al.createdAt || 'Reciente',
          priorityHigh: true,
          onClick: () => handleEnterGroupScreen(grp.id),
        });
      });
    }

    // 2. Próximos eventos del grupo (con sus fechas de ensayo anidadas)
    (grp.events || [])
      .filter((ev) => ev.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2)
      .forEach((ev) => {
        if (
          isGuestInGrp &&
          !ev.assignments.some((a) => a.memberId === myMemberInGrp?.id)
        ) {
          return;
        }
        const rehCount = ev.rehearsals?.length || 0;
        const rehSummary =
          rehCount > 0
            ? ` · ${rehCount} ${rehCount === 1 ? 'ensayo' : 'ensayos'} (${ev.rehearsals![0].date.slice(5)})`
            : '';
        consolidatedNovedades.push({
          id: `novedad-ev-${grp.id}-${ev.id}`,
          category: 'eventos',
          categoryLabel:
            ev.type === 'special' ? 'Evento Especial' : 'Domingo / Fecha',
          groupId: grp.id,
          groupName: grp.identity.ministryName,
          title: `${ev.title} (${ev.date})`,
          subtitle: `Cit: ${ev.callTime} · Ini: ${ev.time} · ${ev.songs.length} canciones${rehSummary}`,
          metaRight: ev.date.slice(5),
          onClick: () => {
            if (onSelectGroup && grp.id !== activeGroupId) {
              onSelectGroup(grp.id);
            }
            onNavigate('eventos');
          },
        });
      });

    // 3. Mensajes importantes recientes del chat del grupo (#general, #lideres o menciones @usuario)
    if (!isGuestInGrp) {
      (grp.chatMessages || [])
        .filter(
          (msg) =>
            msg.channel === 'general' ||
            msg.channel === 'avisos' ||
            (msg.mentionedUsernames && msg.mentionedUsernames.length > 0)
        )
        .slice(-2)
        .reverse()
        .forEach((msg) => {
          consolidatedNovedades.push({
            id: `novedad-msg-${grp.id}-${msg.id}`,
            category: 'mensajes',
            categoryLabel: `Mensaje #${msg.channel}`,
            groupId: grp.id,
            groupName: grp.identity.ministryName,
            title: `${msg.senderName} en #${msg.channel}`,
            subtitle: msg.text || 'Nota de voz / adjunto en el canal',
            metaRight: msg.timestamp,
            onClick: () => {
              if (onSelectGroup && grp.id !== activeGroupId) {
                onSelectGroup(grp.id);
              }
              onNavigate('chat');
            },
          });
        });
    }

    // 4. Cambios en el Repertorio (del feed de actividad o últimas canciones agregadas)
    if (!isGuestInGrp) {
      const repertoireFeed = (grp.activityFeed || []).filter(
        (f) => f.type === 'song_added' || f.type === 'playlist_updated'
      );
      if (repertoireFeed.length > 0) {
        repertoireFeed.slice(0, 2).forEach((f) => {
          consolidatedNovedades.push({
            id: `novedad-rep-${grp.id}-${f.id}`,
            category: 'repertorio',
            categoryLabel: 'Repertorio',
            groupId: grp.id,
            groupName: grp.identity.ministryName,
            title: f.title,
            subtitle: f.description,
            metaRight: f.timestamp,
            onClick: () => {
              if (onSelectGroup && grp.id !== activeGroupId) {
                onSelectGroup(grp.id);
              }
              if (f.targetTab === 'cancionero' && f.targetId) {
                onOpenSongInSongbook(f.targetId);
              } else {
                onNavigate('cancionero');
              }
            },
          });
        });
      } else {
        (grp.songs || []).slice(0, 2).forEach((s) => {
          consolidatedNovedades.push({
            id: `novedad-song-${grp.id}-${s.id}`,
            category: 'repertorio',
            categoryLabel: 'Canción en Repertorio',
            groupId: grp.id,
            groupName: grp.identity.ministryName,
            title: `${s.title} — ${s.artist}`,
            subtitle: `Tono Base: ${s.originalKey} · ${s.bpm} BPM (${s.style})`,
            metaRight: `Tono ${s.originalKey}`,
            onClick: () => {
              if (onSelectGroup && grp.id !== activeGroupId) {
                onSelectGroup(grp.id);
              }
              onOpenSongInSongbook(s.id);
            },
          });
        });
      }
    }
  });

  const filteredNovedades = consolidatedNovedades
    .filter(
      (item) =>
        novedadesFilter === 'all' || item.category === novedadesFilter
    )
    .slice(0, 4);

  const handleEnterGroupScreen = (targetGroupId?: string) => {
    if (targetGroupId && onSelectGroup && targetGroupId !== activeGroupId) {
      onSelectGroup(targetGroupId);
    }
    setGroupSectionTab('todo');
    setIsGroupScreenOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===========================================================================
  // PANTALLA 2: PANTALLA PROPIA DEL GRUPO (FECHAS, FEED, MIEMBROS Y AJUSTES)
  // ===========================================================================
  if (isGroupScreenOpen) {
    return (
      <div className="space-y-4 w-full max-w-full min-w-0">
        {/* Barra superior de navegación para volver al Inicio Personal */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsGroupScreenOpen(false)}
            className="min-h-[34px] px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 shadow-2xs transition-colors shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Inicio Personal</span>
          </button>

          {userGroups.length > 1 && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full py-0.5">
              {userGroups.map((g) => {
                const isCurrent = g.id === activeGroupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      if (onSelectGroup) onSelectGroup(g.id);
                    }}
                    className={`min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                      isCurrent
                        ? `${accent.bgClass} shadow-2xs`
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {g.identity.ministryName}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CABECERA EXCLUSIVA DEL GRUPO CON "CANCIONERO", "MIEMBROS" Y "⚙️" EN UNA SOLA LÍNEA */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200/90 dark:border-slate-800 p-3.5 sm:p-4 shadow-xs dark:shadow-md space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-md shrink-0 overflow-hidden ${accent.bgClass}`}
              >
                <BrandIconDisplay
                  iconId={identity.iconId}
                  customImageUrl={identity.customImageUrl}
                  className={
                    identity.customImageUrl ? 'w-full h-full' : 'w-5 h-5'
                  }
                />
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold">
                    {isLeader
                      ? 'Líder / Admin'
                      : activeMember.isGuest
                      ? 'Músico Invitado'
                      : 'Miembro Titular'}
                  </span>
                  <span>·</span>
                  <span>{members.length} integrantes</span>
                  {!activeMember.isGuest && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-slate-600 dark:text-slate-300">
                        Código: {identity.inviteCode}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-950 dark:text-white truncate">
                  {identity.ministryName}
                </h1>
              </div>
            </div>

            {/* Tres botones compactos en una sola línea: Cancionero, Miembros y Engrane ⚙️ */}
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => onNavigate('cancionero')}
                className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-xl flex items-center gap-1.5 text-[11px] sm:text-xs font-bold shadow-xs transition-all whitespace-nowrap shrink-0 ${accent.bgClass}`}
              >
                <Music className="w-3.5 h-3.5 shrink-0" />
                <span>Cancionero ({songs.length})</span>
              </button>

              {!activeMember.isGuest && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenIdentityModal('invitaciones')}
                    className="min-h-[34px] px-2.5 sm:px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 border border-slate-200 dark:border-white/15 flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-slate-800 dark:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    <span>Miembros ({members.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenIdentityModal('grupo')}
                    title="Datos del Grupo"
                    aria-label="Datos del Grupo"
                    className="min-h-[34px] w-[34px] p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/15 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                  </button>
                </>
              )}
            </div>
          </div>

          {activeMember.isGuest && (
            <div className="px-3 py-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
              <span>
                <strong>Pase de Músico Invitado:</strong> Solo ves las fechas y el repertorio de los eventos donde participas en este grupo.
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-bold shrink-0">
                Invitado
              </span>
            </div>
          )}

          {/* Pestañas Internas del Grupo en una sola línea (4 columnas): Todo | Fechas | Estudios | Feed */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-950/70 border border-slate-200/80 dark:border-white/5">
            {[
              { id: 'todo', label: 'Todo' },
              { id: 'fechas', label: `Fechas (${upcomingEvents.length})` },
              { id: 'estudio', label: `Estudios (${devotionals.length})` },
              {
                id: 'feed',
                label: `Feed (${recentActivityFeed.length + alerts.length})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setGroupSectionTab(t.id as typeof groupSectionTab)
                }
                className={`min-h-[32px] px-1.5 sm:px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold transition-all truncate ${
                  groupSectionTab === t.id
                    ? `${accent.bgClass} shadow-2xs`
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECCIÓN 1 DEL GRUPO: RESUMEN COMPACTO DE PRÓXIMAS FECHAS */}
        {(groupSectionTab === 'todo' || groupSectionTab === 'fechas') && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className={`w-4 h-4 shrink-0 ${accent.textClass}`} />
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  Resumen de Eventos ({upcomingEvents.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('eventos')}
                className={`text-xs font-bold ${accent.textClass} hover:underline flex items-center gap-1 shrink-0`}
              >
                <span>{isLeader ? 'Administrar' : 'Ver todos'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sin fechas próximas programadas.
                </p>
                {isLeader && (
                  <button
                    type="button"
                    onClick={() => onNavigate('eventos')}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 ${accent.bgClass}`}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Crear</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(groupSectionTab === 'todo'
                  ? upcomingEvents.slice(0, 3)
                  : upcomingEvents
                ).map((ev) => {
                  const confirmedCount = ev.assignments.filter(
                    (a) => a.rsvpStatus === 'confirmed'
                  ).length;
                  const myAssign = ev.assignments.find(
                    (a) => a.memberId === activeMember.id
                  );

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onNavigate('eventos')}
                      className="w-full py-2 first:pt-0.5 last:pb-0.5 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            {ev.date} · {ev.time}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {ev.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {ev.location} · {ev.songs.length} canc. · {confirmedCount}/
                          {ev.assignments.length} conf.
                          {myAssign
                            ? ` · Tu rol: ${(myAssign.roles || [myAssign.role]).join(' + ')}`
                            : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN DEL GRUPO: ESTUDIOS BÍBLICOS Y DEVOCIONALES */}
        {(groupSectionTab === 'todo' || groupSectionTab === 'estudio') && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  Estudios Bíblicos ({devotionals.length})
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('devocionales')}
                className={`min-h-[30px] px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap ${accent.bgClass}`}
              >
                <BookOpen className="w-3 h-3 shrink-0" />
                <span>Ver Estudios</span>
              </button>
            </div>

            {devotionals.length === 0 ? (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                <BookOpen className="w-7 h-7 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Aún no se han publicado estudios bíblicos en este grupo.
                </p>
                {isLeader && (
                  <button
                    type="button"
                    onClick={() => onNavigate('devocionales')}
                    className={`mt-1 min-h-[32px] px-3 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${accent.bgClass}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear Primer Estudio</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {devotionals.map((dev) => {
                  const completedSessionsCount = dev.sessions.filter((s) =>
                    s.completedByMemberIds?.includes(activeMember.id)
                  ).length;
                  const totalSessions = dev.sessions.length;
                  const progressPct =
                    totalSessions > 0
                      ? Math.round(
                          (completedSessionsCount / totalSessions) * 100
                        )
                      : 0;

                  return (
                    <div
                      key={dev.id}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 hover:border-amber-500/40 flex flex-col justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                            {dev.category}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {dev.sessions.length}{' '}
                            {dev.sessions.length === 1 ? 'sesión' : 'sesiones'}
                          </span>
                        </div>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                          {dev.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {dev.description}
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>Progreso personal</span>
                          <span className="font-bold text-emerald-500">
                            {progressPct}% ({completedSessionsCount}/
                            {totalSessions})
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => onNavigate('devocionales')}
                          className="w-full min-h-[32px] px-3 py-1 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Estudiar Serie</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN 3 DEL GRUPO: RESUMEN COMPACTO DE FEED Y AVISOS DEL GRUPO */}
        {(groupSectionTab === 'todo' || groupSectionTab === 'feed') && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className={`w-4 h-4 shrink-0 ${accent.textClass}`} />
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  Feed y Avisos ({alerts.length + recentActivityFeed.length})
                </h2>
              </div>
              {groupSectionTab === 'todo' &&
                recentActivityFeed.length + alerts.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setGroupSectionTab('feed')}
                    className={`text-xs font-bold ${accent.textClass} hover:underline flex items-center gap-1 shrink-0`}
                  >
                    <span>Ver todos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
            </div>

            {alerts.length > 0 && (
              <div className="space-y-1.5">
                {(groupSectionTab === 'todo' ? alerts.slice(0, 2) : alerts).map(
                  (al) => (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => onNavigate('eventos')}
                      className="w-full px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 text-left hover:bg-amber-500/15 transition-colors min-w-0"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <p className="text-xs text-slate-800 dark:text-slate-200 truncate">
                          <strong className="font-bold text-slate-950 dark:text-white">
                            {al.title}:
                          </strong>{' '}
                          {al.message}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                        Ver →
                      </span>
                    </button>
                  )
                )}
              </div>
            )}

            {recentActivityFeed.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(groupSectionTab === 'todo'
                  ? recentActivityFeed.slice(0, 3)
                  : recentActivityFeed
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.targetTab === 'cancionero' && item.targetId) {
                        onOpenSongInSongbook(item.targetId);
                      } else {
                        onNavigate(item.targetTab);
                      }
                    }}
                    className="w-full py-2 first:pt-0.5 last:pb-0.5 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {item.actorName} ({item.timestamp})
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              alerts.length === 0 && (
                <p className="text-xs text-slate-500 py-1.5">
                  Sin avisos ni actividad reciente en este grupo.
                </p>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // PANTALLA 1 (POR DEFECTO): INICIO GENERAL Y PERSONAL MÁS LIMPIO Y RESUMIDO
  // ===========================================================================
  return (
    <div className="space-y-4 w-full max-w-full min-w-0">
      {/* 1. BIENVENIDA PERSONAL MINIMALISTA + RED DE AMIGOS EN UNA SOLA LÍNEA */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-2xs flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onOpenMusicianProfile(resolvedUserId, 'perfil')}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 overflow-hidden shadow-xs ${accent.bgClass}`}
            title="Ver Mi Perfil de Músico"
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
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-bold text-amber-500 shrink-0">Inicio Personal</span>
              <span>·</span>
              <span className="truncate">
                {activeMember.instruments.slice(0, 2).join(', ') || 'Músico'}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              Hola, {activeMember.name.split(' ')[0]}
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenMusicianProfile(resolvedUserId, 'amigos')}
          className="min-h-[34px] px-3 py-1 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-[11px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap"
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span>Amigos ({friendsCount})</span>
          {pendingFriendRequestsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
              {pendingFriendRequestsCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. MIS GRUPOS MUSICALES: PRESIONA EL NOMBRE DEL GRUPO PARA ENTRAR A SU PANTALLA */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mis Grupos Musicales ({groupsToSummarize.length})
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Presiona el nombre de un grupo para abrir su pantalla completa (fechas, feed, miembros y ajustes)
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/50 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
            <span>+ Grupo</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {groupsToSummarize.map((grp) => {
            const isCurrentActive =
              grp.id === activeGroupId || groupsToSummarize.length === 1;
            const grpAccent = getAccentClasses(grp.identity.accentColor);
            const myMember = grp.members.find((m) => m.id === resolvedUserId);
            const isGrpLeader =
              grp.leaderUserId === resolvedUserId ||
              myMember?.role === 'leader';
            const grpUpcomingCount = grp.events.filter(
              (ev) => ev.date >= todayStr
            ).length;

            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => handleEnterGroupScreen(grp.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 group min-w-0 ${
                  isCurrentActive
                    ? 'bg-amber-500/10 dark:bg-slate-900 border-amber-500/60 dark:border-slate-800 text-slate-950 dark:text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900/70 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${grpAccent.bgClass}`}
                  >
                    <BrandIconDisplay
                      iconId={grp.identity.iconId}
                      customImageUrl={grp.identity.customImageUrl}
                      className={
                        grp.identity.customImageUrl
                          ? 'w-full h-full'
                          : 'w-5 h-5'
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors text-slate-950 dark:text-white">
                        {grp.identity.ministryName}
                      </p>
                      {isGrpLeader && (
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] truncate text-slate-500 dark:text-slate-400">
                      {grp.members.length} miembros · {grpUpcomingCount}{' '}
                      {grpUpcomingCount === 1 ? 'fecha' : 'fechas'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-500 shrink-0">
                  <span className="hidden sm:inline">Abrir</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. DOS COLUMNAS LIMPIAS: TU AGENDA PERSONAL + NOVEDADES RESUMIDAS DE TUS GRUPOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Columna Izquierda (6 cols): Tu Asistencia y Próximas Fechas (en todos tus grupos) */}
        <div className="lg:col-span-6 space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Tus Próximas Fechas y Confirmaciones</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('eventos')}
              className={`text-xs font-bold ${accent.textClass} hover:underline`}
            >
              Ver calendario →
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
            {crossGroupMyUpcomingAssignments.length > 0 ? (
              <div className="space-y-2">
                {crossGroupMyUpcomingAssignments
                  .slice(0, 4)
                  .map(
                    ({
                      groupId,
                      groupName,
                      isActiveGroup,
                      event,
                      myAssigns,
                      status,
                      rolesText,
                    }) => {
                      const handleUpdateAllMyRolesInEvent = (
                        nextStatus: RSVPStatus
                      ) => {
                        if (!isActiveGroup && onSelectGroup) {
                          onSelectGroup(groupId);
                        }
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

                      if (status === 'confirmed') {
                        return (
                          <button
                            key={`${groupId}-${event.id}`}
                            type="button"
                            onClick={() => {
                              if (!isActiveGroup && onSelectGroup) {
                                onSelectGroup(groupId);
                              }
                              onNavigate('eventos');
                            }}
                            className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-left transition-colors min-w-0"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                <span className="px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-sans font-bold">
                                  {groupName}
                                </span>
                                <span>·</span>
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

                      return (
                        <div
                          key={`${groupId}-${event.id}`}
                          className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-sans font-bold">
                                  {groupName}
                                </span>
                                <span>·</span>
                                <span>{event.date}</span>
                                <span>·</span>
                                <span>Cit: {event.callTime}</span>
                              </div>
                              <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                                {event.title}
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                Rol asignado:{' '}
                                <strong className={accent.textClass}>
                                  {rolesText}
                                </strong>
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold shrink-0">
                              Pendiente
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateAllMyRolesInEvent('confirmed')
                              }
                              className="min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aceptar
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateAllMyRolesInEvent('declined')
                              }
                              className="min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-white dark:bg-slate-900 border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Declinar
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>No tienes fechas pendientes por confirmar.</span>
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

        {/* Columna Derecha (6 cols): Sección de 'Novedades' Consolidada y Filtrada (Feed Minimalista) */}
        <div className="lg:col-span-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Activity className={`w-3.5 h-3.5 ${accent.textClass}`} />
              <span>Novedades de Tus Grupos</span>
            </h2>

            {/* Filtro minimalista del Feed de Novedades */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Todo' },
                { id: 'eventos', label: 'Eventos' },
                { id: 'mensajes', label: 'Mensajes' },
                { id: 'repertorio', label: 'Repertorio' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    setNovedadesFilter(f.id as typeof novedadesFilter)
                  }
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors ${
                    novedadesFilter === f.id
                      ? `${accent.bgClass}`
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
            {filteredNovedades.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredNovedades.map((nov) => (
                  <button
                    key={nov.id}
                    type="button"
                    onClick={nov.onClick}
                    className="w-full py-2.5 first:pt-0.5 last:pb-0.5 flex items-center justify-between gap-2.5 text-left hover:opacity-85 transition-opacity min-w-0"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          nov.priorityHigh
                            ? 'bg-amber-500/20 text-amber-500'
                            : nov.category === 'eventos'
                            ? 'bg-sky-500/15 text-sky-500'
                            : nov.category === 'mensajes'
                            ? 'bg-indigo-500/15 text-indigo-500'
                            : 'bg-emerald-500/15 text-emerald-500'
                        }`}
                      >
                        {nov.priorityHigh ? (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        ) : nov.category === 'eventos' ? (
                          <Calendar className="w-3.5 h-3.5" />
                        ) : nov.category === 'mensajes' ? (
                          <MessageSquare className="w-3.5 h-3.5" />
                        ) : (
                          <Music className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 truncate max-w-[125px]">
                            {nov.groupName}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-amber-600 dark:text-amber-400 truncate">
                            {nov.categoryLabel}
                          </span>
                          <span>·</span>
                          <span className="font-mono shrink-0">
                            {nov.metaRight}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
                          {nov.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {nov.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                No hay novedades en esta categoría. Toca cualquiera de tus grupos arriba para abrir su repertorio, fechas y miembros.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
