import React, { useEffect, useState } from 'react';
import {
  ALL_INSTRUMENT_ROLES,
  AccentColorId,
  BandMember,
  EventSongItem,
  InstrumentRole,
  MemberAvailabilityRecord,
  NoticeAlert,
  RSVPStatus,
  Song,
  WorshipEvent,
} from '../types';
import { getAccentClasses } from './IdentityModal';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  HelpCircle,
  ListMusic,
  Lock,
  MapPin,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserX,
  X,
  XCircle,
} from 'lucide-react';

interface EventsModuleProps {
  events: WorshipEvent[];
  songs: Song[];
  members: BandMember[];
  alerts: NoticeAlert[];
  availabilityRecords: MemberAvailabilityRecord[];
  activeMember: BandMember;
  accentColor: AccentColorId;
  onUpdateRSVP: (eventId: string, role: InstrumentRole, status: RSVPStatus) => void;
  onReassignRole: (eventId: string, role: InstrumentRole, memberId: string) => void;
  onUpdateEventPlaylist: (eventId: string, updatedSongs: EventSongItem[]) => void;
  onCreateEvent: (newEvent: Omit<WorshipEvent, 'id'>) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddAlert: (alert: Omit<NoticeAlert, 'id' | 'createdAt'>) => void;
  onDismissAlert: (alertId: string) => void;
  onSaveAvailability: (record: {
    date: string;
    status: 'unavailable' | 'available';
    reason: string;
  }) => void;
  onRemoveAvailability: (recordId: string) => void;
  onOpenSongInSongbook: (songId: string, customKey?: string) => void;
}

const ALL_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + daysToAdd);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const EventsModule: React.FC<EventsModuleProps> = ({
  events,
  songs,
  members,
  alerts,
  availabilityRecords,
  activeMember,
  accentColor,
  onUpdateRSVP,
  onReassignRole,
  onUpdateEventPlaylist,
  onCreateEvent,
  onDeleteEvent,
  onAddAlert,
  onDismissAlert,
  onSaveAvailability,
  onRemoveAvailability,
  onOpenSongInSongbook,
}) => {
  const accent = getAccentClasses(accentColor);
  const isLeader = activeMember.role === 'leader';

  const [filterType, setFilterType] = useState<'all' | 'sunday' | 'rehearsal' | 'special'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showPlaylistEditor, setShowPlaylistEditor] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);

  // Availability Form State (for any member or leader)
  const [availDate, setAvailDate] = useState('2026-11-01');
  const [availStatus, setAvailStatus] = useState<'unavailable' | 'available'>('unavailable');
  const [availReason, setAvailReason] = useState('');

  // New Event Form State + Recurrence + Templates
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'sunday' | 'rehearsal' | 'special'>('sunday');
  const [newDate, setNewDate] = useState('2026-11-01');
  const [newTime, setNewTime] = useState('10:30');
  const [newCallTime, setNewCallTime] = useState('08:45');
  const [newLocation, setNewLocation] = useState('Auditorio Central');
  const [newTheme, setNewTheme] = useState('');
  const [newAlertReminder, setNewAlertReminder] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [recurrenceWeeks, setRecurrenceWeeks] = useState<number>(1); // 1, 2, or 4 weeks
  const [selectedSongItems, setSelectedSongItems] = useState<EventSongItem[]>(() =>
    songs.slice(0, 3).map((s) => ({
      songId: s.id,
      customKey: s.originalKey,
      vocalLeader: activeMember.name,
    }))
  );

  // Helper to check a member's availability on a specific YYYY-MM-DD date
  const getMemberAvailabilityForDate = (
    memberId: string,
    dateStr: string
  ): MemberAvailabilityRecord | undefined => {
    return availabilityRecords.find(
      (r) => r.memberId === memberId && r.date === dateStr
    );
  };

  const buildSmartRoleMemberMapForDate = (
    dateStr: string
  ): Record<InstrumentRole, string> => {
    const map: Record<string, string> = {};
    const availableMembers = members.filter(
      (m) => getMemberAvailabilityForDate(m.id, dateStr)?.status !== 'unavailable'
    );
    const pool = availableMembers.length > 0 ? availableMembers : members;

    ALL_INSTRUMENT_ROLES.forEach((role, idx) => {
      const matchingAvailable = availableMembers.find((m) =>
        m.instruments.includes(role)
      );
      const fallbackMember =
        matchingAvailable ||
        pool[idx % pool.length] ||
        members[0];
      map[role] = fallbackMember?.id || '';
    });
    return map as Record<InstrumentRole, string>;
  };

  const [roleMemberMap, setRoleMemberMap] = useState<Record<InstrumentRole, string>>(() =>
    buildSmartRoleMemberMapForDate('2026-11-01')
  );

  // When newDate changes in Create Event modal, auto-prioritize available members
  useEffect(() => {
    if (showCreateModal) {
      setRoleMemberMap(buildSmartRoleMemberMapForDate(newDate));
    }
  }, [newDate, showCreateModal, availabilityRecords.length, members.length]);

  // New Alert Form State
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertPriority, setAlertPriority] = useState<'high' | 'normal'>('high');

  const filteredEvents = events.filter((ev) =>
    filterType === 'all' ? true : ev.type === filterType
  );

  const activeEvent =
    events.find((e) => e.id === selectedEventId) || filteredEvents[0] || events[0];

  // Apply 1-tap Event Template
  const applyEventTemplate = (
    template: 'sunday' | 'rehearsal' | 'special' | 'copy_last'
  ) => {
    if (template === 'sunday') {
      setNewTitle('Domingo de Servicio y Alabanza');
      setNewType('sunday');
      setNewCallTime('08:30');
      setNewTime('10:30');
      setNewLocation('Auditorio Principal');
      setNewTheme('Servicio Dominical Congregacional');
      setNewNotes('Prueba de sonido 08:30 hrs. Oración en camerino 10:00 hrs.');
    } else if (template === 'rehearsal') {
      setNewTitle('Ensayo General de Banda y Voces');
      setNewType('rehearsal');
      setNewCallTime('19:00');
      setNewTime('19:30');
      setNewLocation('Salón de Ensayo Principal');
      setNewTheme('Montaje de repertorio, voces y secuencias de la semana');
      setNewNotes('Traer in-ears e instrumentos afinados. Escuchar lista previa.');
    } else if (template === 'special') {
      setNewTitle('Noche Especial de Adoración');
      setNewType('special');
      setNewCallTime('17:30');
      setNewTime('19:30');
      setNewLocation('Auditorio Central');
      setNewTheme('Velada de Adoración e Intercesión');
      setNewNotes('Setlist extendido con transiciones espontáneas.');
    } else if (template === 'copy_last' && events[0]) {
      const last = events[0];
      setNewTitle(last.title);
      setNewType(last.type);
      setNewDate(addDaysToDateStr(last.date, 7));
      setNewCallTime(last.callTime);
      setNewTime(last.time);
      setNewLocation(last.location);
      setNewTheme(last.preacherOrTheme);
      setNewNotes(last.notes);
      setSelectedSongItems(last.songs);
    }
  };

  // Duplicate an existing event to next week (+7 days)
  const handleDuplicateEventNextWeek = (ev: WorshipEvent) => {
    if (!isLeader) return;
    const nextDate = addDaysToDateStr(ev.date, 7);
    const smartMap = buildSmartRoleMemberMapForDate(nextDate);
    const assignments = ALL_INSTRUMENT_ROLES.map((role) => {
      const prevAssign = ev.assignments.find((a) => a.role === role);
      const isPrevUnavailable =
        prevAssign &&
        getMemberAvailabilityForDate(prevAssign.memberId, nextDate)?.status ===
          'unavailable';
      const chosenMemberId =
        !isPrevUnavailable && prevAssign
          ? prevAssign.memberId
          : smartMap[role] || members[0]?.id || '';
      const memberObj =
        members.find((m) => m.id === chosenMemberId) || members[0];
      return {
        role,
        memberId: memberObj.id,
        memberName: memberObj.name,
        rsvpStatus: 'pending' as RSVPStatus,
      };
    });

    onCreateEvent({
      title: `${ev.title}`,
      type: ev.type,
      date: nextDate,
      time: ev.time,
      callTime: ev.callTime,
      location: ev.location,
      preacherOrTheme: ev.preacherOrTheme,
      alertReminder: ev.alertReminder,
      notes: ev.notes,
      songs: ev.songs.map((s) => ({ ...s })),
      assignments,
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const totalWeeks = Math.max(1, Math.min(4, recurrenceWeeks));
    for (let weekIdx = 0; weekIdx < totalWeeks; weekIdx++) {
      const eventDate = addDaysToDateStr(newDate, weekIdx * 7);
      const weekMap =
        weekIdx === 0
          ? roleMemberMap
          : buildSmartRoleMemberMapForDate(eventDate);

      const assignments = ALL_INSTRUMENT_ROLES.map((role) => {
        const mId = weekMap[role] || members[0]?.id || 'm1';
        const memberObj = members.find((m) => m.id === mId) || members[0];
        return {
          role,
          memberId: memberObj.id,
          memberName: memberObj.name,
          rsvpStatus: 'pending' as RSVPStatus,
        };
      });

      const titleSuffix =
        totalWeeks > 1 ? ` (Semana ${weekIdx + 1}/${totalWeeks})` : '';

      onCreateEvent({
        title: `${newTitle.trim()}${titleSuffix}`,
        type: newType,
        date: eventDate,
        time: newTime,
        callTime: newCallTime,
        location: newLocation.trim() || 'Auditorio Principal',
        preacherOrTheme: newTheme.trim() || 'Servicio General de Alabanza',
        alertReminder: newAlertReminder.trim() || undefined,
        notes: newNotes.trim() || 'Llegar puntuales para prueba de sonido y oración.',
        songs: selectedSongItems.map((item) => ({ ...item })),
        assignments,
      });
    }

    setNewTitle('');
    setNewTheme('');
    setNewAlertReminder('');
    setRecurrenceWeeks(1);
    setShowCreateModal(false);
  };

  const handleAlertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle.trim() || !alertMessage.trim()) return;
    onAddAlert({
      title: alertTitle.trim(),
      message: alertMessage.trim(),
      priority: alertPriority,
      eventRefId: activeEvent?.id,
    });
    setAlertTitle('');
    setAlertMessage('');
    setShowAlertModal(false);
  };

  const handleAvailabilitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!availDate) return;
    onSaveAvailability({
      date: availDate,
      status: availStatus,
      reason: availReason.trim(),
    });
    setAvailReason('');
  };

  const toggleSongInActiveEvent = (song: Song) => {
    if (!activeEvent || !isLeader) return;
    const exists = activeEvent.songs.some((s) => s.songId === song.id);
    const updated: EventSongItem[] = exists
      ? activeEvent.songs.filter((s) => s.songId !== song.id)
      : [
          ...activeEvent.songs,
          {
            songId: song.id,
            customKey: song.originalKey,
            vocalLeader: activeMember.name,
          },
        ];
    onUpdateEventPlaylist(activeEvent.id, updated);
  };

  const updateSongWeeklyKeyInActiveEvent = (
    songId: string,
    customKey: string
  ) => {
    if (!activeEvent || !isLeader) return;
    const updated = activeEvent.songs.map((item) =>
      item.songId === songId ? { ...item, customKey } : item
    );
    onUpdateEventPlaylist(activeEvent.id, updated);
  };

  const getEventTypeLabel = (type: WorshipEvent['type']) => {
    switch (type) {
      case 'sunday':
        return 'Domingo de Servicio';
      case 'rehearsal':
        return 'Ensayo General';
      case 'special':
        return 'Noche Especial';
    }
  };

  // Compute availability summary for the selected date in the Create Event modal
  const membersUnavailableOnNewDate = members.filter(
    (m) => getMemberAvailabilityForDate(m.id, newDate)?.status === 'unavailable'
  );
  const membersAvailableOnNewDate = members.filter(
    (m) => getMemberAvailabilityForDate(m.id, newDate)?.status !== 'unavailable'
  );

  const myAvailabilityRecords = availabilityRecords.filter(
    (r) => r.memberId === activeMember.id
  );

  return (
    <div className="space-y-6">
      {/* Alertas visuales */}
      {alerts.length > 0 && (
        <div className="space-y-2.5">
          {alerts.map((al) => (
            <div
              key={al.id}
              className="flex items-start justify-between gap-4 p-4 rounded-3xl border bg-amber-500/10 border-amber-500/30 text-slate-900 dark:text-slate-100"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {al.title}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{al.createdAt}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                    {al.message}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDismissAlert(al.id)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botones Grandes de Filtro + Bloqueo de Fechas / Disponibilidad + Acciones de Líder */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="grid grid-cols-4 gap-2 p-1.5 rounded-2xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'sunday', label: 'Domingos' },
            { id: 'rehearsal', label: 'Ensayos' },
            { id: 'special', label: 'Especiales' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as typeof filterType)}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                filterType === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botón para todos (Miembros y Líder): Bloquear fechas o registrar disponibilidad */}
          <button
            type="button"
            onClick={() => setShowAvailabilityModal(true)}
            className="min-h-[48px] flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-amber-500/50 transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarOff className="w-4 h-4 text-rose-500" />
            <span>Mi Disponibilidad / Bloquear Fechas</span>
            {availabilityRecords.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-mono text-[10px]">
                {availabilityRecords.length}
              </span>
            )}
          </button>

          {isLeader && (
            <>
              <button
                type="button"
                onClick={() => setShowAlertModal(true)}
                className="min-h-[48px] flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
              >
                <Bell className="w-4 h-4 text-amber-500" />
                Publicar Aviso
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className={`min-h-[48px] flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-md whitespace-nowrap shrink-0 ${accent.bgClass}`}
              >
                <Plus className="w-4 h-4" />
                Programar Evento / Serie (Líder)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Layout Principal */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4">
          <div
            className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
          >
            <Calendar className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Aún no hay eventos ni ensayos programados
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {isLeader
                ? 'Usa plantillas rápidas o series recurrentes para programar los domingos y ensayos del mes viendo en vivo quién está disponible.'
                : 'Puedes registrar desde ahora tus fechas disponibles o bloqueadas para que el Líder lo vea al armar el rol.'}
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowAvailabilityModal(true)}
              className="min-h-[52px] px-5 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2"
            >
              <CalendarOff className="w-4 h-4 text-rose-500" />
              <span>Ingresar Mis Fechas Disponibles / Bloqueadas</span>
            </button>
            {isLeader && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className={`min-h-[52px] px-6 py-3 rounded-2xl text-sm font-bold inline-flex items-center gap-2 shadow-lg ${accent.bgClass}`}
              >
                <Plus className="w-5 h-5" />
                <span>Programar Primer Evento</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Lista de Eventos */}
          <div className="lg:col-span-4 space-y-3">
            {filteredEvents.map((ev) => {
              const isSelected = activeEvent?.id === ev.id;
              const confirmedCount = ev.assignments.filter(
                (a) => a.rsvpStatus === 'confirmed'
              ).length;
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => setSelectedEventId(ev.id)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all ${
                    isSelected
                      ? `bg-white dark:bg-slate-900 ${accent.borderClass} ring-2 ring-amber-500/20 shadow-sm`
                      : 'bg-white/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    <span className={`font-bold ${accent.textClass}`}>
                      {getEventTypeLabel(ev.type)}
                    </span>
                    <span className="font-mono tabular-nums">{ev.date}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {ev.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                    {ev.preacherOrTheme}
                  </p>
                  <div className="flex items-center justify-between text-xs pt-2.5 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums text-slate-500">
                    <span>{ev.songs.length} canciones en playlist</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {confirmedCount}/{ev.assignments.length} RSVP
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detalle del Evento: Playlist con Tonos por Semana + Matriz de Roles y Disponibilidad */}
          {activeEvent && (
            <div className="lg:col-span-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`font-bold ${accent.textClass}`}>
                      {getEventTypeLabel(activeEvent.type)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="w-3.5 h-3.5" />
                      {activeEvent.date}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5" />
                      Citación: {activeEvent.callTime} / Inicio: {activeEvent.time}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    {activeEvent.title}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {activeEvent.preacherOrTheme}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin className="w-3.5 h-3.5" />
                    {activeEvent.location}
                  </p>
                </div>

                {isLeader && (
                  <div className="flex items-center gap-2 self-start shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDuplicateEventNextWeek(activeEvent)}
                      className="min-h-[42px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500"
                      title="Duplicar este evento para la próxima semana (+7 días)"
                    >
                      <Copy className="w-3.5 h-3.5 text-amber-500" />
                      <span>Duplicar (+7 días)</span>
                    </button>

                    {events.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteEvent(activeEvent.id)}
                        className="min-h-[42px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-bold text-rose-600 dark:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* PLAYLIST DEL EVENTO CON TONALIDAD POR SEMANA */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ListMusic className={`w-5 h-5 ${accent.textClass}`} />
                      Playlist y Tonos de esta Semana ({activeEvent.songs.length})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Toca cualquier canción para abrirla en el Cancionero con el <strong>tono asignado para esta fecha</strong>.
                    </p>
                  </div>

                  {isLeader ? (
                    <button
                      type="button"
                      onClick={() => setShowPlaylistEditor(true)}
                      className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 ${accent.bgClass}`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Armar Playlist y Tonos Semanales
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Playlist gestionada por el Líder
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeEvent.songs.map((item, index) => {
                    const songObj = songs.find((s) => s.id === item.songId);
                    if (!songObj) return null;
                    const weeklyKey = item.customKey || songObj.originalKey;
                    const isModifiedKey = weeklyKey !== songObj.originalKey;
                    return (
                      <button
                        key={`${item.songId}-${index}`}
                        type="button"
                        onClick={() =>
                          onOpenSongInSongbook(songObj.id, weeklyKey)
                        }
                        className="min-h-[72px] flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-amber-500/50 transition-all text-left"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            0{index + 1}. {songObj.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            Tono Normal Base: {songObj.originalKey} · {songObj.bpm} BPM
                          </p>
                        </div>
                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <div
                            className={`text-xs font-bold px-2.5 py-1 rounded-xl ${
                              isModifiedKey
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                : accent.textClass
                            }`}
                          >
                            Semana: {weeklyKey}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Matriz de Roles + Estado de Disponibilidad para la Fecha del Evento */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-500" />
                    Matriz de Roles y Confirmación (RSVP) — {activeEvent.date}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Muestra alertas automáticas si un miembro bloqueó esta fecha
                  </span>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {activeEvent.assignments.map((assign) => {
                    const isCurrentUser = assign.memberId === activeMember.id;
                    const memberAvail = getMemberAvailabilityForDate(
                      assign.memberId,
                      activeEvent.date
                    );
                    const isBlockedDate = memberAvail?.status === 'unavailable';

                    return (
                      <div
                        key={assign.role}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 ${
                          isBlockedDate
                            ? 'bg-rose-500/5'
                            : isCurrentUser
                            ? 'bg-amber-500/5'
                            : 'bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-36 shrink-0">
                            {assign.role}
                          </span>

                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            {isLeader ? (
                              <select
                                value={assign.memberId}
                                onChange={(e) =>
                                  onReassignRole(
                                    activeEvent.id,
                                    assign.role,
                                    e.target.value
                                  )
                                }
                                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                              >
                                {members.map((m) => {
                                  const mAv = getMemberAvailabilityForDate(
                                    m.id,
                                    activeEvent.date
                                  );
                                  const tag =
                                    mAv?.status === 'unavailable'
                                      ? `⚠️ NO DISPONIBLE (${mAv.reason || 'Bloqueó fecha'})`
                                      : '✓ Disponible';
                                  return (
                                    <option key={m.id} value={m.id}>
                                      {m.name} — {tag}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {assign.memberName}
                                {isCurrentUser && (
                                  <span
                                    className={`ml-1.5 text-xs ${accent.textClass}`}
                                  >
                                    · (Tu rol)
                                  </span>
                                )}
                              </span>
                            )}

                            {isBlockedDate && (
                              <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1">
                                <CalendarOff className="w-3 h-3" />
                                No disponible ({memberAvail?.reason || 'Fecha bloqueada'})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateRSVP(activeEvent.id, assign.role, 'confirmed')
                            }
                            className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                              assign.rsvpStatus === 'confirmed'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmar
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateRSVP(activeEvent.id, assign.role, 'pending')
                            }
                            className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                              assign.rsvpStatus === 'pending'
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                            Pendiente
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateRSVP(activeEvent.id, assign.role, 'declined')
                            }
                            className={`min-h-[42px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                              assign.rsvpStatus === 'declined'
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Declinar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL: MI DISPONIBILIDAD Y BLOQUEO DE FECHAS (PARA TODOS LOS MIEMBROS)
         ===================================================================== */}
      {showAvailabilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarOff className="w-5 h-5 text-rose-500" />
                  Bloqueo de Fechas y Disponibilidad del Equipo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Registra qué días <strong>no estarás disponible</strong> o qué fechas tienes libres. El Líder lo verá automáticamente al programar eventos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAvailabilityModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleAvailabilitySubmit}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Registrar Fecha para {activeMember.name}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={availDate}
                    onChange={(e) => setAvailDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Estado en esa Fecha
                  </label>
                  <select
                    value={availStatus}
                    onChange={(e) =>
                      setAvailStatus(e.target.value as 'unavailable' | 'available')
                    }
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
                  >
                    <option value="unavailable">No Disponible (Bloquear Fecha)</option>
                    <option value="available">Disponible Confirmado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Motivo / Nota (Opcional)
                  </label>
                  <input
                    type="text"
                    value={availReason}
                    onChange={(e) => setAvailReason(e.target.value)}
                    placeholder="Ej. Viaje familiar, Trabajo..."
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${accent.bgClass}`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Guardar Fecha en el Calendario del Grupo</span>
                </button>
              </div>
            </form>

            {/* Mis Fechas Registradas */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Mis Fechas Registradas ({myAvailabilityRecords.length})
              </h4>
              {myAvailabilityRecords.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  No has bloqueado ninguna fecha todavía. Por defecto apareces disponible para todos los eventos.
                </p>
              ) : (
                <div className="space-y-2">
                  {myAvailabilityRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {rec.status === 'unavailable' ? (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 font-mono text-xs font-bold">
                            {rec.date} · No Disponible
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold">
                            {rec.date} · Disponible
                          </span>
                        )}
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {rec.reason || 'Sin motivo especificado'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveAvailability(rec.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fechas Bloqueadas de Todo el Grupo */}
            {availabilityRecords.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Registro General del Equipo ({availabilityRecords.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availabilityRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="text-slate-900 dark:text-white">
                          {rec.memberName}
                        </strong>{' '}
                        —{' '}
                        <span
                          className={
                            rec.status === 'unavailable'
                              ? 'text-rose-500 font-bold'
                              : 'text-emerald-500 font-bold'
                          }
                        >
                          {rec.status === 'unavailable'
                            ? 'No disponible'
                            : 'Disponible'}
                        </span>
                        {rec.reason && (
                          <span className="text-slate-500"> ({rec.reason})</span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {rec.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Armar Playlist del Evento y Tonos por Semana (Solo Líder) */}
      {showPlaylistEditor && activeEvent && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Playlist y Tonos para «{activeEvent.title}»
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Elige las canciones y ajusta su tonalidad para esta semana aparte de su tono normal
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPlaylistEditor(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[55vh] overflow-y-auto">
              {songs.map((song) => {
                const evItem = activeEvent.songs.find(
                  (s) => s.songId === song.id
                );
                const included = Boolean(evItem);
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
                      onClick={() => toggleSongInActiveEvent(song)}
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
                          Tono Normal: <strong>{song.originalKey}</strong> ·{' '}
                          {song.bpm} BPM
                        </p>
                      </div>
                    </button>

                    {included && evItem && (
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Tono esta semana:
                        </span>
                        <select
                          value={evItem.customKey || song.originalKey}
                          onChange={(e) =>
                            updateSongWeeklyKeyInActiveEvent(
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
              onClick={() => setShowPlaylistEditor(false)}
              className={`w-full min-h-[48px] rounded-2xl text-sm font-bold ${accent.bgClass}`}
            >
              Guardar Playlist y Tonos del Evento
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: PROGRAMAR EVENTO CON PLANTILLAS, RECURRENCIA Y DISPONIBILIDAD EN VIVO
         ===================================================================== */}
      {showCreateModal && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Programar Evento, Serie Recurrente y Asignar Miembros Disponibles
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Usa plantillas rápidas y revisa en tiempo real quiénes están disponibles para la fecha elegida.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 1. PLANTILLAS RÁPIDAS DE EVENTO */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Plantillas Rápidas de Eventos (1 Toque)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => applyEventTemplate('sunday')}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-amber-500 text-left"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Domingo Servicio
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Cit: 08:30 · Ini: 10:30
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyEventTemplate('rehearsal')}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-amber-500 text-left"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Ensayo General
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Cit: 19:00 · Ini: 19:30
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyEventTemplate('special')}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-amber-500 text-left"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Noche Especial
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    Cit: 17:30 · Ini: 19:30
                  </p>
                </button>

                {events.length > 0 && (
                  <button
                    type="button"
                    onClick={() => applyEventTemplate('copy_last')}
                    className="p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-left"
                  >
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      Copiar Último
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {events[0].title}
                    </p>
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título del Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ej. Domingo de Alabanza"
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Evento
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as WorshipEvent['type'])}
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="sunday">Domingo de Servicio</option>
                    <option value="rehearsal">Ensayo General</option>
                    <option value="special">Noche Especial</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fecha Inicial
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora Citación
                  </label>
                  <input
                    type="time"
                    required
                    value={newCallTime}
                    onChange={(e) => setNewCallTime(e.target.value)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Repeat className="w-3.5 h-3.5 text-amber-500" />
                    Serie Recurrente
                  </label>
                  <select
                    value={recurrenceWeeks}
                    onChange={(e) => setRecurrenceWeeks(Number(e.target.value))}
                    className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value={1}>Solo esta fecha (1)</option>
                    <option value={2}>Repetir 2 semanas</option>
                    <option value={4}>Repetir 4 semanas (Mes)</option>
                  </select>
                </div>
              </div>

              {/* ===============================================================
                  PANEL EN VIVO DE DISPONIBILIDAD DE MIEMBROS PARA LA FECHA ELEGIDA
                 =============================================================== */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CalendarCheck className="w-4 h-4 text-emerald-500" />
                    Disponibilidad del Equipo para el{' '}
                    <span className="font-mono underline">{newDate}</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {membersAvailableOnNewDate.length} disponibles ·{' '}
                    {membersUnavailableOnNewDate.length} no disponibles
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Columna Disponibles */}
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      Disponibles ({membersAvailableOnNewDate.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {membersAvailableOnNewDate.map((m) => (
                        <span
                          key={m.id}
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/30 text-[11px] font-bold text-slate-800 dark:text-slate-200"
                        >
                          ✓ {m.name} ({m.instruments[0] || 'Banda'})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Columna No Disponibles */}
                  <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <UserX className="w-3.5 h-3.5" />
                      No Disponibles / Bloqueados ({membersUnavailableOnNewDate.length})
                    </p>
                    {membersUnavailableOnNewDate.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Nadie ha bloqueado esta fecha. ¡Equipo completo disponible!
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {membersUnavailableOnNewDate.map((m) => {
                          const rec = getMemberAvailabilityForDate(m.id, newDate);
                          return (
                            <div
                              key={m.id}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center justify-between"
                            >
                              <span>⚠️ {m.name}</span>
                              <span className="font-normal opacity-90">
                                {rec?.reason || 'Fecha bloqueada'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Asignación de Roles para el nuevo evento con aviso de disponibilidad */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 space-y-2">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Asignación de Instrumentos para este Evento:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ALL_INSTRUMENT_ROLES.map((role) => {
                      const selectedMemberId =
                        roleMemberMap[role] || members[0]?.id || '';
                      const selAvail = getMemberAvailabilityForDate(
                        selectedMemberId,
                        newDate
                      );
                      const isBlocked = selAvail?.status === 'unavailable';
                      return (
                        <div
                          key={role}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                            isBlocked
                              ? 'border-rose-500/50 bg-rose-500/10'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                            {role}
                          </span>
                          <select
                            value={selectedMemberId}
                            onChange={(e) =>
                              setRoleMemberMap((prev) => ({
                                ...prev,
                                [role]: e.target.value,
                              }))
                            }
                            className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white max-w-[180px]"
                          >
                            {members.map((m) => {
                              const av = getMemberAvailabilityForDate(
                                m.id,
                                newDate
                              );
                              return (
                                <option key={m.id} value={m.id}>
                                  {av?.status === 'unavailable' ? '⚠️ ' : '✓ '}
                                  {m.name}
                                  {av?.status === 'unavailable'
                                    ? ' (No disp.)'
                                    : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Seleccionar Playlist + Tono por Semana para el nuevo evento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Seleccionar Playlist y Tono de cada Canción para este Evento
                </label>
                <div className="space-y-2 max-h-44 overflow-y-auto p-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                  {songs.length === 0 ? (
                    <p className="text-xs text-slate-500 p-2">
                      Aún no hay canciones en el Repertorio Base. Puedes agregarlas después.
                    </p>
                  ) : (
                    songs.map((song) => {
                      const itemObj = selectedSongItems.find(
                        (i) => i.songId === song.id
                      );
                      const checked = Boolean(itemObj);
                      return (
                        <div
                          key={song.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSongItems((prev) =>
                                checked
                                  ? prev.filter((i) => i.songId !== song.id)
                                  : [
                                      ...prev,
                                      {
                                        songId: song.id,
                                        customKey: song.originalKey,
                                        vocalLeader: activeMember.name,
                                      },
                                    ]
                              )
                            }
                            className="flex items-center gap-2 text-left flex-1 min-w-0"
                          >
                            <div
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${
                                checked
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                              }`}
                            >
                              {checked ? <Check className="w-3.5 h-3.5" /> : '+'}
                            </div>
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {song.title}{' '}
                              <span className="text-slate-400 font-normal">
                                (Base: {song.originalKey})
                              </span>
                            </span>
                          </button>

                          {checked && itemObj && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-bold text-slate-500">
                                Tono Semana:
                              </span>
                              <select
                                value={itemObj.customKey || song.originalKey}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSelectedSongItems((prev) =>
                                    prev.map((i) =>
                                      i.songId === song.id
                                        ? { ...i, customKey: val }
                                        : i
                                    )
                                  );
                                }}
                                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold text-slate-900 dark:text-white"
                              >
                                {ALL_KEYS.map((k) => (
                                  <option key={k} value={k}>
                                    {k}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[46px] px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[46px] px-6 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  {recurrenceWeeks > 1
                    ? `Publicar Serie (${recurrenceWeeks} Semanas)`
                    : 'Publicar Evento y Notificar Roles'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Publicar Aviso */}
      {showAlertModal && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Publicar Aviso para el Grupo
              </h3>
              <button
                type="button"
                onClick={() => setShowAlertModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAlertSubmit} className="space-y-4 pt-4">
              <input
                type="text"
                required
                value={alertTitle}
                onChange={(e) => setAlertTitle(e.target.value)}
                placeholder="Título del aviso"
                className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
              <textarea
                rows={3}
                required
                value={alertMessage}
                onChange={(e) => setAlertMessage(e.target.value)}
                placeholder="Mensaje para la banda..."
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAlertModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Publicar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
