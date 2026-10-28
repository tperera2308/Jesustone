import React, { useEffect, useState } from 'react';
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
  onOpenEvent?: (eventId: string, groupId?: string) => void;
  onOpenDevotional?: (devotionalId: string, groupId?: string) => void;
  onToggleGroupScreen?: (open: boolean) => void;
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
  onOpenEvent,
  onOpenDevotional,
  onToggleGroupScreen,
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

  useEffect(() => {
    setIsGroupScreenOpen(Boolean(initialOpenGroupScreen));
  }, [initialOpenGroupScreen]);

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
          subtitle: `Cita: ${ev.callTime} · Inicio: ${ev.time} · ${ev.songs.length} canciones${rehSummary}`,
          metaRight: ev.date.slice(5),
          onClick: () => {
            if (onOpenEvent) {
              onOpenEvent(ev.id, grp.id);
            } else {
              if (onSelectGroup && grp.id !== activeGroupId) {
                onSelectGroup(grp.id);
              }
              onNavigate('eventos');
            }
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
    if (onToggleGroupScreen) onToggleGroupScreen(true);
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
            onClick={() => {
              setIsGroupScreenOpen(false);
              if (onToggleGroupScreen) onToggleGroupScreen(false);
            }}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-500/60 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 shadow-2xs transition-colors shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Inicio Personal</span>
          </button>

          {userGroups.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full py-0.5">
              {userGroups.map((g) => {
                const isCurrent = g.id === activeGroupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      if (onSelectGroup) onSelectGroup(g.id);
                    }}
                    className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                      isCurrent
                        ? `${accent.bgClass} shadow-2xs`
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
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
        <div className="rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs dark:shadow-md space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-12 h-12 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center shadow-md shrink-0 overflow-hidden ${accent.bgClass}`}
              >
                <BrandIconDisplay
                  iconId={identity.iconId}
                  customImageUrl={identity.customImageUrl}
                  className={
                    identity.customImageUrl ? 'w-full h-full' : 'w-6 h-6'
                  }
                />
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                    {isLeader
                      ? 'Líder / Admin'
                      : activeMember.isGuest
                      ? 'Músico Invitado'
                      : 'Miembro Titular'}
                  </span>
                  <span>·</span>
                  <span className="font-medium">{members.length} integrantes</span>
                  {!activeMember.isGuest && (
                    <>
                      <span>·</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        Código: {identity.inviteCode}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-950 dark:text-white truncate">
                  {identity.ministryName}
                </h1>
              </div>
            </div>

            {/* Tres botones amplios y táctiles en una sola línea: Cancionero, Miembros y Engrane ⚙️ */}
            <div className="flex items-center gap-2 flex-nowrap shrink-0 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => onNavigate('cancionero')}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-bold shadow-xs transition-all whitespace-nowrap shrink-0 ${accent.bgClass}`}
              >
                <Music className="w-4 h-4 shrink-0" />
                <span>Cancionero ({songs.length})</span>
              </button>

              {!activeMember.isGuest && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenIdentityModal('invitaciones')}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 border border-slate-200 dark:border-white/15 flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    <Users className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    <span>Miembros ({members.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenIdentityModal('grupo')}
                    title="Datos del Grupo"
                    aria-label="Datos del Grupo"
                    className="min-h-[42px] w-[42px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 border border-slate-200 dark:border-white/15 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors shrink-0"
                  >
                    <Settings className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                  </button>
                </>
              )}
            </div>
          </div>

          {activeMember.isGuest && (
            <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <span>
                <strong>Pase de Músico Invitado:</strong> Solo ves las fechas y el repertorio de los eventos donde participas en este grupo.
              </span>
              <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 text-xs font-bold shrink-0">
                Invitado
              </span>
            </div>
          )}

          {/* Pestañas Internas del Grupo en una sola línea (4 columnas): Todo | Fechas | Estudios | Feed */}
          <div className="grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-950/70 border border-slate-200/80 dark:border-white/10">
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
                className={`min-h-[40px] px-2 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all truncate ${
                  groupSectionTab === t.id
                    ? `${accent.bgClass} shadow-2xs`
                    : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECCIÓN 1 DEL GRUPO: RESUMEN COMPACTO DE PRÓXIMAS FECHAS */}
        {(groupSectionTab === 'todo' || groupSectionTab === 'fechas') && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className={`w-4 h-4 shrink-0 ${accent.textClass}`} />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Resumen de Eventos ({upcomingEvents.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('eventos')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold ${accent.textClass} hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 shrink-0 transition-colors`}
              >
                <span>{isLeader ? 'Administrar' : 'Ver todos'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  Sin fechas próximas programadas.
                </p>
                {isLeader && (
                  <button
                    type="button"
                    onClick={() => onNavigate('eventos')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${accent.bgClass}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
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
                      onClick={() => {
                        if (onOpenEvent) {
                          onOpenEvent(ev.id, activeGroupId);
                        } else {
                          onNavigate('eventos');
                        }
                      }}
                      className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            {ev.date} · Cita: {ev.callTime}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {ev.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          {ev.location} · {ev.songs.length} canciones · {confirmedCount}/
                          {ev.assignments.length} confirmados
                          {myAssign
                            ? ` · Tu rol: ${(myAssign.roles || [myAssign.role]).join(' + ')}`
                            : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN DEL GRUPO: ESTUDIOS BÍBLICOS Y DEVOCIONALES (RESUMIDO EN 'TODO', COMPLETO EN 'ESTUDIO') */}
        {(groupSectionTab === 'todo' || groupSectionTab === 'estudio') && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-emerald-500 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Estudios Bíblicos ({devotionals.length})
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('devocionales')}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold ${accent.textClass} hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 shrink-0 transition-colors`}
              >
                <span>Ver todos</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {devotionals.length === 0 ? (
              <div className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  Sin estudios bíblicos publicados.
                </p>
                {isLeader && (
                  <button
                    type="button"
                    onClick={() => onNavigate('devocionales')}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${accent.bgClass}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear</span>
                  </button>
                )}
              </div>
            ) : groupSectionTab === 'todo' ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {devotionals.slice(0, 2).map((dev) => {
                  const completedSessionsCount = dev.sessions.filter((s) =>
                    s.completedByMemberIds?.includes(activeMember.id)
                  ).length;
                  const totalSessions = dev.sessions.length;
                  return (
                    <button
                      key={dev.id}
                      type="button"
                      onClick={() => {
                        if (onOpenDevotional) {
                          onOpenDevotional(dev.id, activeGroupId);
                        } else {
                          onNavigate('devocionales');
                        }
                      }}
                      className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                            {dev.category}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {dev.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          {completedSessionsCount}/{totalSessions}{' '}
                          {totalSessions === 1 ? 'sesión' : 'sesiones'} · {dev.description}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                    </button>
                  );
                })}
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
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-amber-500/40 flex flex-col justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                            {dev.category}
                          </span>
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                            {dev.sessions.length}{' '}
                            {dev.sessions.length === 1 ? 'sesión' : 'sesiones'}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-1">
                          {dev.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                          {dev.description}
                        </p>
                      </div>

                      <div className="space-y-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-700/60">
                        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                          <span>Tu progreso</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {progressPct}% ({completedSessionsCount}/
                            {totalSessions})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenDevotional) {
                              onOpenDevotional(dev.id, activeGroupId);
                            } else {
                              onNavigate('devocionales');
                            }
                          }}
                          className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5"
                        >
                          <BookOpen className="w-4 h-4 text-emerald-500" />
                          <span>Abrir Estudio</span>
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
        {(groupSectionTab === 'feed' ||
          (groupSectionTab === 'todo' &&
            alerts.length + recentActivityFeed.length > 0)) && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className={`w-4 h-4 shrink-0 ${accent.textClass}`} />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Feed y Avisos ({alerts.length + recentActivityFeed.length})
                </h2>
              </div>
              {groupSectionTab === 'todo' &&
                recentActivityFeed.length + alerts.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setGroupSectionTab('feed')}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold ${accent.textClass} hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 shrink-0 transition-colors`}
                  >
                    <span>Ver todos</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
            </div>

            {alerts.length > 0 && (
              <div className="space-y-2">
                {(groupSectionTab === 'todo' ? alerts.slice(0, 2) : alerts).map(
                  (al) => (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => {
                        if (al.eventRefId && onOpenEvent) {
                          onOpenEvent(al.eventRefId, activeGroupId);
                        } else {
                          onNavigate('eventos');
                        }
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 text-left hover:bg-amber-500/15 transition-colors min-w-0"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 truncate">
                          <strong className="font-bold text-slate-950 dark:text-white">
                            {al.title}:
                          </strong>{' '}
                          {al.message}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
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
                      } else if (
                        item.targetTab === 'eventos' &&
                        item.targetId &&
                        onOpenEvent
                      ) {
                        onOpenEvent(item.targetId, activeGroupId);
                      } else if (
                        item.targetTab === 'devocionales' &&
                        item.targetId &&
                        onOpenDevotional
                      ) {
                        onOpenDevotional(item.targetId, activeGroupId);
                      } else {
                        onNavigate(item.targetTab);
                      }
                    }}
                    className="w-full py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 shrink-0">
                          {item.actorName} ({item.timestamp})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              alerts.length === 0 && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 py-2">
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
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3.5 sm:px-5 sm:py-4 shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onOpenMusicianProfile(resolvedUserId, 'perfil')}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-sm sm:text-base font-bold shrink-0 overflow-hidden shadow-xs ${accent.bgClass}`}
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
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">
                Inicio Personal
              </span>
              <span>·</span>
              <span className="truncate font-medium">
                {activeMember.instruments.slice(0, 2).join(', ') || 'Músico'}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-950 dark:text-white truncate">
              Hola, {activeMember.name.split(' ')[0]}
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenMusicianProfile(resolvedUserId, 'amigos')}
          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap"
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>Amigos ({friendsCount})</span>
          {pendingFriendRequestsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold">
              {pendingFriendRequestsCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. MIS GRUPOS MUSICALES: ACCESO DIRECTO EN 1 TOQUE A GRUPO, CANCIONERO Y FECHAS */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Mis Grupos Musicales ({groupsToSummarize.length})
          </h2>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-500/60 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 shrink-0"
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            <span>+ Grupo</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <div
                key={grp.id}
                role="button"
                tabIndex={0}
                onClick={() => handleEnterGroupScreen(grp.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleEnterGroupScreen(grp.id);
                  }
                }}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group min-w-0 cursor-pointer ${
                  isCurrentActive
                    ? 'bg-amber-500/10 dark:bg-slate-900 border-amber-500/60 dark:border-slate-700 text-slate-950 dark:text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900/70 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2.5 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${grpAccent.bgClass}`}
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
                        <p className="text-base font-bold truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors text-slate-950 dark:text-white">
                          {grp.identity.ministryName}
                        </p>
                        {isGrpLeader && (
                          <ShieldCheck className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs truncate text-slate-600 dark:text-slate-300">
                        {grp.members.length} miembros · {grp.songs.length} canciones
                      </p>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
                </div>

                {/* Propuesta A: Acceso directo en 1 toque a Cancionero y Fechas con botones amplios */}
                <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-200/70 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectGroup && grp.id !== activeGroupId) {
                        onSelectGroup(grp.id);
                      }
                      onNavigate('cancionero');
                    }}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all truncate ${grpAccent.bgClass}`}
                  >
                    <Music className="w-4 h-4 shrink-0" />
                    <span className="truncate">Cancionero ({grp.songs.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectGroup && grp.id !== activeGroupId) {
                        onSelectGroup(grp.id);
                      }
                      onNavigate('eventos');
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 transition-colors truncate"
                  >
                    <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="truncate">
                      Fechas ({grpUpcomingCount})
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. DOS COLUMNAS LIMPIAS: TU AGENDA PERSONAL + NOVEDADES RESUMIDAS DE TUS GRUPOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Columna Izquierda (6 cols): Tu Asistencia y Próximas Fechas (en todos tus grupos) */}
        <div className="lg:col-span-6 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-500" />
              <span>Tus Próximas Fechas y Confirmaciones</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('eventos')}
              className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs sm:text-sm font-bold ${accent.textClass} hover:underline`}
            >
              Ver calendario →
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            {crossGroupMyUpcomingAssignments.length > 0 ? (
              <div className="space-y-2.5">
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

                      const handleOpenThisEvent = () => {
                        if (onOpenEvent) {
                          onOpenEvent(event.id, groupId);
                        } else {
                          if (!isActiveGroup && onSelectGroup) {
                            onSelectGroup(groupId);
                          }
                          onNavigate('eventos');
                        }
                      };

                      if (status === 'confirmed') {
                        return (
                          <button
                            key={`${groupId}-${event.id}`}
                            type="button"
                            onClick={handleOpenThisEvent}
                            className="w-full p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-left transition-colors min-w-0"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-700 dark:text-slate-200">
                                <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-sans font-bold text-xs">
                                  {groupName}
                                </span>
                                <span>·</span>
                                <span>{event.date}</span>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                                  Cita: {event.callTime}
                                </span>
                              </div>
                              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate mt-1">
                                {event.title}
                              </p>
                              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 truncate">
                                Rol: <strong className={accent.textClass}>{rolesText}</strong>
                              </p>
                            </div>

                            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 shrink-0">
                              <CheckCircle2 className="w-4 h-4" />
                              Confirmado
                            </span>
                          </button>
                        );
                      }

                      return (
                        <div
                          key={`${groupId}-${event.id}`}
                          className="p-3.5 sm:p-4 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-3"
                        >
                          <button
                            type="button"
                            onClick={handleOpenThisEvent}
                            className="w-full flex items-start justify-between gap-2 text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 font-mono">
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 font-sans font-bold text-xs">
                                  {groupName}
                                </span>
                                <span>·</span>
                                <span>{event.date}</span>
                                <span>·</span>
                                <span>Cita: {event.callTime}</span>
                              </div>
                              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate mt-1 hover:text-amber-500 transition-colors">
                                {event.title}
                              </p>
                              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                                Rol asignado:{' '}
                                <strong className={accent.textClass}>
                                  {rolesText}
                                </strong>
                              </p>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0">
                              Pendiente
                            </span>
                          </button>

                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateAllMyRolesInEvent('confirmed')
                              }
                              className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Aceptar
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateAllMyRolesInEvent('declined')
                              }
                              className="min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all bg-white dark:bg-slate-900 border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white"
                            >
                              <XCircle className="w-4 h-4" />
                              Declinar
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>No tienes fechas pendientes por confirmar.</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('eventos')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold ${accent.textClass} shrink-0`}
                >
                  Eventos
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha (6 cols): Sección de 'Novedades' Consolidada y Filtrada (Feed Minimalista) */}
        <div className="lg:col-span-6 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Activity className={`w-4 h-4 ${accent.textClass}`} />
              <span>Novedades de Tus Grupos</span>
            </h2>

            {/* Filtro táctil del Feed de Novedades */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    novedadesFilter === f.id
                      ? `${accent.bgClass}`
                      : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
            {filteredNovedades.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredNovedades.map((nov) => (
                  <button
                    key={nov.id}
                    type="button"
                    onClick={nov.onClick}
                    className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity min-w-0"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
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
                          <AlertTriangle className="w-4 h-4" />
                        ) : nov.category === 'eventos' ? (
                          <Calendar className="w-4 h-4" />
                        ) : nov.category === 'mensajes' ? (
                          <MessageSquare className="w-4 h-4" />
                        ) : (
                          <Music className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[135px]">
                            {nov.groupName}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-amber-700 dark:text-amber-300 truncate">
                            {nov.categoryLabel}
                          </span>
                          <span>·</span>
                          <span className="font-mono shrink-0">
                            {nov.metaRight}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate mt-0.5">
                          {nov.title}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                          {nov.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 py-4 text-center">
                No hay novedades en esta categoría. Toca cualquiera de tus grupos arriba para abrir su repertorio, fechas y miembros.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
