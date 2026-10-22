import React, { useEffect, useState } from 'react';
import {
  ALL_INSTRUMENT_ROLES,
  AccentColorId,
  AppUser,
  BandMember,
  EventSongItem,
  InstrumentRole,
  MemberAvailabilityRecord,
  NoticeAlert,
  RSVPStatus,
  ServiceAssignment,
  Song,
  WorshipEvent,
} from '../types';
import { getAccentClasses } from './IdentityModal';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  FileText,
  Headphones,
  HelpCircle,
  ListMusic,
  Lock,
  MapPin,
  Mic,
  Plus,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserX,
  Users,
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
  onUpdateRSVP: (
    eventId: string,
    role: InstrumentRole,
    status: RSVPStatus,
    assignmentIndex?: number,
    assignmentId?: string
  ) => void;
  onReassignRole: (
    eventId: string,
    role: InstrumentRole,
    memberId: string,
    assignmentIndex?: number
  ) => void;
  onUpdateEventAssignments: (
    eventId: string,
    updatedAssignments: ServiceAssignment[]
  ) => void;
  onUpdateEventPlaylist: (eventId: string, updatedSongs: EventSongItem[]) => void;
  onUpdateEventNotes: (
    eventId: string,
    updatedGroupNotes: string,
    updatedPersonalNotes?: Record<string, string>
  ) => void;
  onCreateEvent: (newEvent: Omit<WorshipEvent, 'id'>) => void;
  onUpdateEvent: (updatedEvent: WorshipEvent) => void;
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
  friends?: AppUser[];
  onConvokeFriendAsGuest?: (friendUser: AppUser) => BandMember;
}

const MAJOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DAY_NAMES_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getTodayDateStr(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getNextDayOfWeekDateStr(targetDayOfWeek: number): string {
  const now = new Date();
  const currentDay = now.getDay();
  let diff = (targetDayOfWeek - currentDay + 7) % 7;
  if (diff === 0) diff = 7;
  now.setDate(now.getDate() + diff);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatReadableDateEs(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const dayName = DAY_NAMES_SHORT_ES[dt.getDay()] || '';
  const monthName = (MONTH_NAMES_ES[m - 1] || '').slice(0, 3);
  return `${dayName} ${String(d).padStart(2, '0')} ${monthName} ${y}`;
}

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

interface InteractiveDatePickerProps {
  value: string;
  onChange: (newDate: string) => void;
  label?: string;
}

const InteractiveDatePicker: React.FC<InteractiveDatePickerProps> = ({
  value,
  onChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [manualText, setManualText] = useState(value);

  const parsedParts = value.split('-').map(Number);
  const selectedYear = parsedParts[0] || new Date().getFullYear();
  const selectedMonth = (parsedParts[1] || new Date().getMonth() + 1) - 1; // 0-indexed
  const selectedDay = parsedParts[2] || new Date().getDate();

  const [viewYear, setViewYear] = useState(selectedYear);
  const [viewMonth, setViewMonth] = useState(selectedMonth);

  useEffect(() => {
    setManualText(value);
    const parts = value.split('-').map(Number);
    if (parts[0] && parts[1]) {
      setViewYear(parts[0]);
      setViewMonth(parts[1] - 1);
    }
  }, [value]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const formatted = `${viewYear}-${mm}-${dd}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDirectPartChange = (newY: number, newMZero: number, newD: number) => {
    const maxD = new Date(newY, newMZero + 1, 0).getDate();
    const clampedD = Math.min(newD, maxD);
    const formatted = `${newY}-${String(newMZero + 1).padStart(2, '0')}-${String(clampedD).padStart(2, '0')}`;
    onChange(formatted);
  };

  const handleManualInputChange = (raw: string) => {
    setManualText(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      onChange(raw);
    }
  };

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}

      {/* Botón principal que abre/cierra el calendario interactivo */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-amber-500/60 text-left flex items-center justify-between gap-2 transition-all"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="truncate">
            <span className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              {formatReadableDateEs(value)}
            </span>
            <span className="block text-[10px] font-mono text-slate-500 dark:text-slate-400">
              {value} · Toca para elegir
            </span>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
          {isOpen ? 'Cerrar' : 'Calendario'}
        </span>
      </button>

      {/* Panel de Calendario Desplegable + Teclado + Selectores Rápidos */}
      {isOpen && (
        <div className="mt-2 p-3.5 rounded-2xl border border-amber-500/40 bg-white dark:bg-slate-900 shadow-2xl space-y-3 z-40">
          {/* Atajos de 1 toque */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(getTodayDateStr());
                setIsOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-[11px] font-bold text-slate-700 dark:text-slate-200"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(getNextDayOfWeekDateStr(0));
                setIsOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-[11px] font-bold text-amber-600 dark:text-amber-400"
            >
              Próximo Domingo
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(getNextDayOfWeekDateStr(4));
                setIsOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-[11px] font-bold text-slate-700 dark:text-slate-200"
            >
              Próximo Jueves
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(getNextDayOfWeekDateStr(6));
                setIsOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-[11px] font-bold text-slate-700 dark:text-slate-200"
            >
              Próximo Sábado
            </button>
          </div>

          {/* Cabecera del Calendario: Mes Anterior / Mes y Año / Mes Siguiente */}
          <div className="flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-xl">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              title="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => {
                  const newM = Number(e.target.value);
                  setViewMonth(newM);
                  handleDirectPartChange(viewYear, newM, selectedDay);
                }}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              >
                {MONTH_NAMES_ES.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => {
                  const newY = Number(e.target.value);
                  setViewYear(newY);
                  handleDirectPartChange(newY, viewMonth, selectedDay);
                }}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
              >
                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              title="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Cuadrícula de días del mes */}
          <div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {DAY_NAMES_SHORT_ES.map((dName) => (
                <span
                  key={dName}
                  className="text-[10px] font-bold uppercase text-slate-400 py-1"
                >
                  {dName}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-9" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNumber = idx + 1;
                const isSelected =
                  viewYear === selectedYear &&
                  viewMonth === selectedMonth &&
                  dayNumber === selectedDay;
                const isSunday =
                  new Date(viewYear, viewMonth, dayNumber).getDay() === 0;

                return (
                  <button
                    key={dayNumber}
                    type="button"
                    onClick={() => handleSelectDay(dayNumber)}
                    className={`h-9 rounded-xl text-xs font-mono font-bold flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                        : isSunday
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {dayNumber}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Escritura manual con teclado por si el usuario prefiere escribir la fecha */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">
                O escribe (AAAA-MM-DD):
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={manualText}
                onChange={(e) => handleManualInputChange(e.target.value)}
                placeholder="2026-11-01"
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shrink-0"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_STEP_5 = [
  '00',
  '05',
  '10',
  '15',
  '20',
  '25',
  '30',
  '35',
  '40',
  '45',
  '50',
  '55',
];

const QUICK_TIMES = [
  '08:00',
  '08:30',
  '08:45',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '17:00',
  '18:00',
  '19:00',
  '19:30',
  '20:00',
];

function format12HourLabel(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = mStr || '00';
  if (Number.isNaN(h)) return time24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

interface InteractiveTimePickerProps {
  value: string;
  onChange: (newTime: string) => void;
  label: string;
}

const InteractiveTimePicker: React.FC<InteractiveTimePickerProps> = ({
  value,
  onChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [manualTime, setManualTime] = useState(value);

  const parts = value.split(':');
  const currentHour = parts[0] && parts[0].length === 2 ? parts[0] : '09';
  const currentMin = parts[1] && parts[1].length === 2 ? parts[1] : '00';

  useEffect(() => {
    setManualTime(value);
  }, [value]);

  const handleHourChange = (newH: string) => {
    onChange(`${newH}:${currentMin}`);
  };

  const handleMinChange = (newM: string) => {
    onChange(`${currentHour}:${newM}`);
  };

  const handleManualInput = (raw: string) => {
    setManualTime(raw);
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(raw)) {
      onChange(raw);
    }
  };

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
        {label}
      </label>

      {/* Controles directos de Hora y Minuto + Botón de horarios rápidos */}
      <div className="flex items-center gap-1.5 min-h-[46px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <Clock className="w-4 h-4 text-amber-500 shrink-0" />

        {/* Selector directo de Hora */}
        <select
          value={currentHour}
          onChange={(e) => handleHourChange(e.target.value)}
          aria-label={`${label} - Hora`}
          className="px-1.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
        >
          {HOURS_24.map((h) => (
            <option key={h} value={h}>
              {h} h
            </option>
          ))}
        </select>

        <span className="font-mono font-bold text-slate-500">:</span>

        {/* Selector directo de Minutos */}
        <select
          value={MINUTES_STEP_5.includes(currentMin) ? currentMin : '00'}
          onChange={(e) => handleMinChange(e.target.value)}
          aria-label={`${label} - Minutos`}
          className="px-1.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
        >
          {MINUTES_STEP_5.map((m) => (
            <option key={m} value={m}>
              {m} m
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="ml-auto px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0"
        >
          {isOpen ? 'Cerrar' : format12HourLabel(value)}
        </button>
      </div>

      {/* Panel desplegable de horarios rápidos + teclado numérico */}
      {isOpen && (
        <div className="mt-2 p-3 rounded-2xl border border-amber-500/40 bg-white dark:bg-slate-900 shadow-2xl space-y-2.5 z-40">
          <p className="text-[11px] font-bold text-slate-500">
            Toque rápido de horario ({format12HourLabel(value)}):
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {QUICK_TIMES.map((qt) => (
              <button
                key={qt}
                type="button"
                onClick={() => {
                  onChange(qt);
                  setIsOpen(false);
                }}
                className={`px-2 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                  value === qt
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-500/20'
                }`}
              >
                {qt}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 shrink-0">
              Escribir (HH:MM):
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={manualTime}
              onChange={(e) => handleManualInput(e.target.value)}
              placeholder="08:45"
              className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold shrink-0"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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
  onUpdateEventAssignments,
  onUpdateEventPlaylist,
  onUpdateEventNotes,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddAlert,
  onDismissAlert,
  onSaveAvailability,
  onRemoveAvailability,
  onOpenSongInSongbook,
  friends = [],
  onConvokeFriendAsGuest,
}) => {
  const accent = getAccentClasses(accentColor);
  const isLeader = activeMember.role === 'leader';

  const [filterType, setFilterType] = useState<'all' | 'sunday' | 'rehearsal' | 'special' | 'past'>('all');
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  // Vista inicial en tarjetas resumidas; al tocar una tarjeta se abre toda la información del evento
  const [openedEventId, setOpenedEventId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditEventModal, setShowEditEventModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showPlaylistEditor, setShowPlaylistEditor] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [songSearchCreate, setSongSearchCreate] = useState('');
  const [songSearchEditor, setSongSearchEditor] = useState('');
  const [expandedDraftMemberId, setExpandedDraftMemberId] = useState<string | null>(null);
  const [showExtraEventFields, setShowExtraEventFields] = useState(false);
  const [showAddMemberInDetail, setShowAddMemberInDetail] = useState(false);

  // Edit Existing Event Form State
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<'sunday' | 'rehearsal' | 'special'>('sunday');
  const [editDate, setEditDate] = useState(() => getTodayDateStr());
  const [editCallTime, setEditCallTime] = useState('08:45');
  const [editTime, setEditTime] = useState('10:30');
  const [editLocation, setEditLocation] = useState('');
  const [editTheme, setEditTheme] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSpotifyPlaylistUrl, setEditSpotifyPlaylistUrl] = useState('');

  // Event Group Notes & Personal Notes State
  const [eventGroupNotesDraft, setEventGroupNotesDraft] = useState<string>('');
  const [eventPersonalNotesDraft, setEventPersonalNotesDraft] = useState<string>('');
  const [eventNotesSavedNotice, setEventNotesSavedNotice] = useState<string>('');

  // Availability Form State (for any member or leader)
  const [availDate, setAvailDate] = useState(() => getTodayDateStr());
  const [availStatus, setAvailStatus] = useState<'unavailable' | 'available'>('unavailable');
  const [availReason, setAvailReason] = useState('');

  // New Event Form State + Recurrence + Templates
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'sunday' | 'rehearsal' | 'special'>('sunday');
  const [newDate, setNewDate] = useState(() => getTodayDateStr());
  const [newTime, setNewTime] = useState('10:30');
  const [newCallTime, setNewCallTime] = useState('08:45');
  const [newLocation, setNewLocation] = useState('Auditorio Central');
  const [newTheme, setNewTheme] = useState('');
  const [newAlertReminder, setNewAlertReminder] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newSpotifyPlaylistUrl, setNewSpotifyPlaylistUrl] = useState('');
  const [recurrenceWeeks, setRecurrenceWeeks] = useState<number>(1); // 1, 2, or 4 weeks
  const [selectedSongItems, setSelectedSongItems] = useState<EventSongItem[]>(() =>
    songs.slice(0, 3).map((s) => ({
      songId: s.id,
      customKey: s.originalKey,
      vocalLeader: activeMember.name,
      backingVocals: [],
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

  const buildSmartAssignmentsForDate = (
    dateStr: string
  ): ServiceAssignment[] => {
    const regularPool = members.filter((m) => !m.isGuest);
    const availableRegular = regularPool.filter(
      (m) => getMemberAvailabilityForDate(m.id, dateStr)?.status !== 'unavailable'
    );
    const pool = availableRegular.length > 0 ? availableRegular : regularPool;

    return pool.map((m, idx) => {
      const memberRoles =
        m.instruments && m.instruments.length > 0 ? m.instruments : ['Coros'];
      return {
        id: `asg-${Date.now()}-${idx}-${m.id}`,
        memberId: m.id,
        memberName: m.name,
        role: memberRoles[0],
        roles: memberRoles,
        rsvpStatus: 'pending' as RSVPStatus,
        isGuest: Boolean(m.isGuest),
      };
    });
  };

  const [draftAssignments, setDraftAssignments] = useState<ServiceAssignment[]>(
    () => buildSmartAssignmentsForDate(getTodayDateStr())
  );

  // State for adding a new member + multiple instruments/voices inside an already created event
  const [addActiveMemberId, setAddActiveMemberId] = useState<string>(
    members[0]?.id || ''
  );
  const [addActiveRoles, setAddActiveRoles] = useState<InstrumentRole[]>(() =>
    members[0]?.instruments?.length ? [...members[0].instruments] : ['Coros']
  );
  const [customInstrumentInput, setCustomInstrumentInput] = useState<string>('');

  // All available roles combining default roles + any custom instruments members have
  const allAvailableRoles: InstrumentRole[] = Array.from(
    new Set([
      ...ALL_INSTRUMENT_ROLES,
      ...members.flatMap((m) => m.instruments || []),
    ])
  );

  // When Create Event modal opens, initialize draftAssignments if empty
  useEffect(() => {
    if (showCreateModal && draftAssignments.length === 0 && members.length > 0) {
      setDraftAssignments(buildSmartAssignmentsForDate(newDate));
    }
  }, [showCreateModal, members.length]);

  const handleAddDraftAssignment = (
    memberObj?: BandMember,
    customRole?: InstrumentRole
  ) => {
    const targetMember = memberObj || members[0];
    if (!targetMember) return;
    const defaultRoles = customRole
      ? [customRole]
      : targetMember.instruments && targetMember.instruments.length > 0
      ? [...targetMember.instruments]
      : ['Coros'];
    setDraftAssignments((prev) => [
      ...prev,
      {
        id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        memberId: targetMember.id,
        memberName: targetMember.name,
        role: defaultRoles[0],
        roles: defaultRoles,
        rsvpStatus: 'pending',
      },
    ]);
  };

  const handleUpdateDraftAssignmentMember = (index: number, newMemberId: string) => {
    const mObj = members.find((m) => m.id === newMemberId);
    if (!mObj) return;
    const memberRoles =
      mObj.instruments && mObj.instruments.length > 0
        ? [...mObj.instruments]
        : ['Coros'];
    setDraftAssignments((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              memberId: mObj.id,
              memberName: mObj.name,
              role: memberRoles[0],
              roles: memberRoles,
            }
          : item
      )
    );
  };

  const handleToggleDraftAssignmentRole = (
    index: number,
    targetRole: InstrumentRole
  ) => {
    setDraftAssignments((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const currentRoles =
          item.roles && item.roles.length > 0 ? item.roles : [item.role];
        const exists = currentRoles.includes(targetRole);
        const nextRoles = exists
          ? currentRoles.length > 1
            ? currentRoles.filter((r) => r !== targetRole)
            : currentRoles
          : [...currentRoles, targetRole];
        return {
          ...item,
          role: nextRoles[0],
          roles: nextRoles,
        };
      })
    );
  };

  const handleRemoveDraftAssignment = (index: number) => {
    setDraftAssignments((prev) => prev.filter((_, idx) => idx !== index));
  };

  // New Alert Form State
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertPriority, setAlertPriority] = useState<'high' | 'normal'>('high');

  const todayStr = getTodayDateStr();
  const pastEventsCount = events.filter((ev) => ev.date < todayStr).length;

  const filteredEvents = events
    .filter((ev) => {
      const isPast = ev.date < todayStr;
      if (filterType === 'past') return isPast;
      if (isPast) return false;
      return filterType === 'all' ? true : ev.type === filterType;
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')
    );

  const activeEvent =
    events.find((e) => e.id === (openedEventId || selectedEventId)) ||
    filteredEvents[0] ||
    events[0];

  useEffect(() => {
    if (activeEvent) {
      setEventGroupNotesDraft(activeEvent.notes || '');
      setEventPersonalNotesDraft(
        activeEvent.personalNotes?.[activeMember.id] || ''
      );
    }
  }, [activeEvent?.id, activeMember.id]);

  const handleOpenEditEventModal = (ev: WorshipEvent) => {
    setEditTitle(ev.title);
    setEditType(ev.type);
    setEditDate(ev.date);
    setEditCallTime(ev.callTime);
    setEditTime(ev.time);
    setEditLocation(ev.location);
    setEditTheme(ev.preacherOrTheme);
    setEditNotes(ev.notes);
    setEditSpotifyPlaylistUrl(ev.spotifyPlaylistUrl || '');
    setShowEditEventModal(true);
  };

  const handleEditEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !editTitle.trim()) return;
    onUpdateEvent({
      ...activeEvent,
      title: editTitle.trim(),
      type: editType,
      date: editDate,
      callTime: editCallTime,
      time: editTime,
      location: editLocation.trim() || 'Auditorio Principal',
      preacherOrTheme: editTheme.trim() || 'Servicio General de Alabanza',
      notes: editNotes.trim(),
      spotifyPlaylistUrl: editSpotifyPlaylistUrl.trim() || undefined,
    });
    setShowEditEventModal(false);
    setEventNotesSavedNotice('Datos del evento actualizados correctamente');
    window.setTimeout(() => setEventNotesSavedNotice(''), 3000);
  };

  const handleSaveActiveEventGroupNotes = () => {
    if (!activeEvent) return;
    onUpdateEventNotes(
      activeEvent.id,
      eventGroupNotesDraft.trim(),
      activeEvent.personalNotes || {}
    );
    setEventNotesSavedNotice('Notas grupales del evento guardadas para todo el equipo');
    window.setTimeout(() => setEventNotesSavedNotice(''), 3000);
  };

  const handleSaveActiveEventPersonalNotes = () => {
    if (!activeEvent) return;
    const nextPersonal = {
      ...(activeEvent.personalNotes || {}),
      [activeMember.id]: eventPersonalNotesDraft.trim(),
    };
    onUpdateEventNotes(activeEvent.id, activeEvent.notes || '', nextPersonal);
    setEventNotesSavedNotice(`Tu nota personal para este evento fue guardada (${activeMember.name})`);
    window.setTimeout(() => setEventNotesSavedNotice(''), 3000);
  };

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
      setNewTitle('Evento Especial de Adoración');
      setNewType('special');
      setNewCallTime('17:30');
      setNewTime('19:30');
      setNewLocation('Auditorio Central');
      setNewTheme('Evento Especial de Adoración e Intercesión');
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
      if (last.assignments && last.assignments.length > 0) {
        setDraftAssignments(
          last.assignments.map((a, idx) => ({
            ...a,
            id: `asg-copy-${Date.now()}-${idx}`,
            rsvpStatus: 'pending' as RSVPStatus,
          }))
        );
      }
    }
  };

  // Duplicate an existing event to next week (+7 days)
  const handleDuplicateEventNextWeek = (ev: WorshipEvent) => {
    if (!isLeader) return;
    const nextDate = addDaysToDateStr(ev.date, 7);
    const assignments: ServiceAssignment[] = ev.assignments.map((prevAssign, idx) => ({
      id: `asg-${Date.now()}-${idx}`,
      role: prevAssign.role,
      roles: prevAssign.roles ? [...prevAssign.roles] : [prevAssign.role],
      memberId: prevAssign.memberId,
      memberName: prevAssign.memberName,
      rsvpStatus: 'pending' as RSVPStatus,
    }));

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
      spotifyPlaylistUrl: ev.spotifyPlaylistUrl,
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

      const assignments: ServiceAssignment[] = draftAssignments.map((item, idx) => {
        const memberObj = members.find((m) => m.id === item.memberId);
        const resolvedRoles =
          item.roles && item.roles.length > 0 ? item.roles : [item.role];
        return {
          id: `asg-${Date.now()}-${weekIdx}-${idx}`,
          role: resolvedRoles[0],
          roles: resolvedRoles,
          memberId: memberObj?.id || item.memberId,
          memberName: memberObj?.name || item.memberName,
          rsvpStatus: 'pending' as RSVPStatus,
          isGuest: Boolean(item.isGuest || memberObj?.isGuest),
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
        spotifyPlaylistUrl: newSpotifyPlaylistUrl.trim() || undefined,
        songs: selectedSongItems.map((item) => ({ ...item })),
        assignments,
      });
    }

    setNewTitle('');
    setNewTheme('');
    setNewAlertReminder('');
    setNewSpotifyPlaylistUrl('');
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
            backingVocals: [],
          },
        ];
    onUpdateEventPlaylist(activeEvent.id, updated);
  };

  const updateSongItemInActiveEvent = (
    songId: string,
    patch: Partial<EventSongItem>
  ) => {
    if (!activeEvent || !isLeader) return;
    const updated = activeEvent.songs.map((item) =>
      item.songId === songId ? { ...item, ...patch } : item
    );
    onUpdateEventPlaylist(activeEvent.id, updated);
  };

  const moveSongInActiveEvent = (index: number, direction: -1 | 1) => {
    if (!activeEvent || !isLeader) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeEvent.songs.length) return;
    const copy = [...activeEvent.songs];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    onUpdateEventPlaylist(activeEvent.id, copy);
  };

  const getEventTypeLabel = (type: WorshipEvent['type']) => {
    switch (type) {
      case 'sunday':
        return 'Domingo de Servicio';
      case 'rehearsal':
        return 'Ensayo General';
      case 'special':
        return 'Evento Especial';
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
    <div className="space-y-6 w-full max-w-full min-w-0">
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

      {/* Barra compacta de Filtros + Acciones en fila ordenada */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
          {[
            { id: 'all', label: 'Próximos' },
            { id: 'sunday', label: 'Domingos' },
            { id: 'rehearsal', label: 'Ensayos' },
            { id: 'special', label: 'Especiales' },
            {
              id: 'past',
              label: pastEventsCount > 0 ? `Pasados (${pastEventsCount})` : 'Pasados',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as typeof filterType)}
              className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                filterType === tab.id
                  ? `${accent.bgClass} shadow-xs`
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setShowAvailabilityModal(true)}
            className="min-h-[34px] flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500/50 transition-colors whitespace-nowrap shrink-0"
            title="Mi Disponibilidad / Bloquear Fechas"
          >
            <CalendarOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Disponibilidad</span>
            {availabilityRecords.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 font-mono text-[10px]">
                {availabilityRecords.length}
              </span>
            )}
          </button>

          {isLeader && (
            <>
              <button
                type="button"
                onClick={() => setShowAlertModal(true)}
                className="min-h-[34px] flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
                title="Publicar Aviso"
              >
                <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Aviso</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSongSearchCreate('');
                  setShowCreateModal(true);
                }}
                className={`min-h-[34px] flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] sm:text-xs font-bold shadow-xs whitespace-nowrap shrink-0 ${accent.bgClass}`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Nuevo Evento</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Layout Principal: 1) Vista de Tarjetas Resumidas vs 2) Detalle Completo al tocar una Tarjeta */}
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
      ) : !openedEventId || !activeEvent ? (
        /* =====================================================================
           PANTALLA PRINCIPAL DE EVENTOS: TARJETAS RESUMIDAS (TOCA PARA ABRIR)
           ===================================================================== */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Selecciona la tarjeta de un evento para abrir toda su información, playlist y tu invitación personal:
            </p>
            <span className="text-xs font-mono font-bold text-slate-500">
              {filteredEvents.length}{' '}
              {filteredEvents.length === 1 ? 'evento' : 'eventos'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((ev) => {
              const confirmedCount = ev.assignments.filter(
                (a) => a.rsvpStatus === 'confirmed'
              ).length;
              const myAssigns = ev.assignments.filter(
                (a) => a.memberId === activeMember.id
              );
              const myStatus = myAssigns[0]?.rsvpStatus;
              const myRolesList = Array.from(
                new Set(
                  myAssigns.flatMap((a) =>
                    a.roles && a.roles.length > 0 ? a.roles : [a.role]
                  )
                )
              );

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    setSelectedEventId(ev.id);
                    setOpenedEventId(ev.id);
                  }}
                  className="w-full text-left p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-500/60 hover:shadow-lg transition-all flex flex-col justify-between gap-4 group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`px-2.5 py-1 rounded-xl font-bold ${accent.softBgClass}`}
                      >
                        {getEventTypeLabel(ev.type)}
                      </span>
                      <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                        {formatReadableDateEs(ev.date)}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                        {ev.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {ev.preacherOrTheme}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        Cit: {ev.callTime} · Ini: {ev.time}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {ev.location}
                      </span>
                    </div>

                    {/* Estado resumido de mi propia invitación en la tarjeta */}
                    {myAssigns.length > 0 ? (
                      <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Tu Invitación ({myRolesList.join(', ')})
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              myStatus === 'confirmed'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : myStatus === 'declined'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {myStatus === 'confirmed'
                              ? '✓ Aceptada / Confirmada'
                              : myStatus === 'declined'
                              ? '✕ Declinada'
                              : '⏳ Pendiente de responder'}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-[11px] text-slate-500 flex items-center justify-between">
                        <span>No estás asignado en este evento</span>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums text-slate-500">
                    <span>{ev.songs.length} canciones</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {confirmedCount}/{ev.assignments.length} confirmados
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* =====================================================================
           VISTA DETALLE COMPLETO DEL EVENTO SELECCIONADO
           ===================================================================== */
        <div className="space-y-4">
          {/* Barra superior para volver a las tarjetas de eventos */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpenedEventId(null)}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:border-amber-500 flex items-center gap-2 shadow-xs"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" />
              <span>Volver a las Tarjetas de Eventos</span>
            </button>

            {filteredEvents.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                {filteredEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setSelectedEventId(ev.id);
                      setOpenedEventId(ev.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      activeEvent.id === ev.id
                        ? `${accent.bgClass} shadow-xs`
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {ev.title} ({ev.date.slice(5)})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
            {/* Cabecera del Evento + Botones de Editar / Duplicar / Eliminar para Líder */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`font-bold ${accent.textClass}`}>
                    {getEventTypeLabel(activeEvent.type)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 font-mono tabular-nums">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatReadableDateEs(activeEvent.date)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    Cit: {activeEvent.callTime} / Ini: {activeEvent.time}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  {activeEvent.title}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{activeEvent.preacherOrTheme}</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {activeEvent.location}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 self-start shrink-0">
                {activeEvent.spotifyPlaylistUrl && (
                  <a
                    href={activeEvent.spotifyPlaylistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 py-1.5 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs shadow-xs transition-colors"
                    title="Escuchar playlist del evento en Spotify"
                  >
                    <Headphones className="w-3.5 h-3.5 text-black" />
                    <span>Spotify</span>
                  </a>
                )}

                {isLeader && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenEditEventModal(activeEvent)}
                      className="min-h-[34px] flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicateEventNextWeek(activeEvent)}
                      className="min-h-[34px] flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500"
                      title="Duplicar este evento para la próxima semana (+7 días)"
                    >
                      <Copy className="w-3.5 h-3.5 text-amber-500" />
                      <span>+7 días</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onDeleteEvent(activeEvent.id);
                        setOpenedEventId(null);
                      }}
                      className="min-h-[34px] flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-bold text-rose-600 dark:text-rose-400"
                      title="Eliminar evento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ===============================================================
                1. INVITACIÓN PERSONAL: RESUMIDA SI YA FUE ACEPTADA
               =============================================================== */}
            {(() => {
              const myAssignments = activeEvent.assignments
                .map((a, idx) => ({ assign: a, idx }))
                .filter((item) => item.assign.memberId === activeMember.id);

              if (myAssignments.length === 0) {
                return (
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>
                        No estás convocado en la lista de este evento actualmente.
                      </span>
                    </div>
                  </div>
                );
              }

              const currentStatus = myAssignments[0].assign.rsvpStatus;
              const myRolesCombined = Array.from(
                new Set(
                  myAssignments.flatMap(({ assign }) =>
                    assign.roles && assign.roles.length > 0
                      ? assign.roles
                      : [assign.role]
                  )
                )
              );

              const handleUpdateMyOwnRSVP = (newStatus: RSVPStatus) => {
                myAssignments.forEach(({ assign, idx }) => {
                  onUpdateRSVP(
                    activeEvent.id,
                    assign.role,
                    newStatus,
                    idx,
                    assign.id
                  );
                });
              };

              if (currentStatus === 'confirmed') {
                return (
                  <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 truncate">
                        Asistencia confirmada ·{' '}
                        <span className="font-semibold">
                          {myRolesCombined.join(' + ')}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdateMyOwnRSVP('declined')}
                      className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 hover:border-rose-500 text-[11px] font-bold text-rose-600 dark:text-rose-400 transition-colors shrink-0"
                    >
                      Declinar
                    </button>
                  </div>
                );
              }

              return (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider">
                        Tu Invitación
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {myRolesCombined.join(' + ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {currentStatus === 'declined'
                        ? 'Has declinado esta invitación. Puedes confirmar si cambió tu disponibilidad:'
                        : 'Confirma o declina tu participación en este evento:'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUpdateMyOwnRSVP('confirmed')}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Aceptar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateMyOwnRSVP('declined')}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        currentStatus === 'declined'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-rose-500'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{currentStatus === 'declined' ? 'Declinada' : 'Declinar'}</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ===============================================================
                2. PLAYLIST DEL EVENTO CON REORDENAMIENTO, TONOS Y VOCES POR CANCIÓN
               =============================================================== */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ListMusic className={`w-5 h-5 ${accent.textClass}`} />
                    Playlist, Orden y Voces de cada Canción ({activeEvent.songs.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Toca una canción para abrirla en el Cancionero. El Líder puede reordenar la lista y asignar quién lleva la voz principal y coros en cada tema.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {activeEvent.spotifyPlaylistUrl && (
                    <a
                      href={activeEvent.spotifyPlaylistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs flex items-center gap-2 shadow-sm transition-colors"
                      title="Abrir playlist en Spotify"
                    >
                      <Headphones className="w-4 h-4 text-black" />
                      <span>Playlist Spotify</span>
                    </a>
                  )}

                  {isLeader ? (
                    <button
                      type="button"
                      onClick={() => setShowPlaylistEditor(true)}
                      className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 ${accent.bgClass}`}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Editar Playlist, Orden y Voces
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Playlist gestionada por el Líder
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeEvent.songs.map((item, index) => {
                  const songObj = songs.find((s) => s.id === item.songId);
                  if (!songObj) return null;
                  const weeklyKey = item.customKey || songObj.originalKey;
                  const isModifiedKey = weeklyKey !== songObj.originalKey;
                  const backingList = item.backingVocals || [];

                  return (
                    <div
                      key={`${item.songId}-${index}`}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-amber-500/50 transition-all flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenSongInSongbook(songObj.id, weeklyKey)
                          }
                          className="text-left min-w-0 flex-1"
                        >
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate hover:text-amber-500">
                            0{index + 1}. {songObj.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            Tono Base: {songObj.originalKey} · {songObj.bpm} BPM
                          </p>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          {isLeader && activeEvent.songs.length > 1 && (
                            <div className="flex items-center gap-0.5 mr-1">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => moveSongInActiveEvent(index, -1)}
                                className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-amber-500 hover:text-slate-950"
                                title="Subir canción en la playlist"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === activeEvent.songs.length - 1}
                                onClick={() => moveSongInActiveEvent(index, 1)}
                                className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-amber-500 hover:text-slate-950"
                                title="Bajar canción en la playlist"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          <span
                            className={`font-mono text-xs font-bold px-2.5 py-1 rounded-xl ${
                              isModifiedKey
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                : accent.softBgClass
                            }`}
                          >
                            Tono: {weeklyKey}
                          </span>
                        </div>
                      </div>

                      {/* Voces asignadas en esta canción (Voz Principal y Coros) */}
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          Voz Principal: {item.vocalLeader || 'Por definir'}
                        </span>
                        {backingList.length > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold">
                            Coros: {backingList.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===============================================================
                3. LISTA GENERAL DE MIEMBROS EN EL EVENTO (VISTA NORMAL DE EQUIPO)
                   + CONTROLES DEL LÍDER PARA AGREGAR/ELIMINAR Y ASIGNAR MÚLTIPLES INSTRUMENTOS
               =============================================================== */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-500" />
                    Miembros en este Evento ({activeEvent.assignments.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Equipo convocado y estado de confirmación.
                  </p>
                </div>

                {isLeader && (
                  <button
                    type="button"
                    onClick={() => setShowAddMemberInDetail((prev) => !prev)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                      showAddMemberInDetail
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                        : accent.bgClass
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {showAddMemberInDetail
                        ? 'Cerrar panel'
                        : 'Agregar Miembro / Invitado'}
                    </span>
                  </button>
                )}
              </div>

              {/* Panel desplegable del Líder/Admin para agregar un miembro o amigo invitado al evento */}
              {isLeader && showAddMemberInDetail && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                        Integrante:
                      </span>
                      <select
                        value={addActiveMemberId || members[0]?.id || ''}
                        onChange={(e) => {
                          const mId = e.target.value;
                          setAddActiveMemberId(mId);
                          const mObj = members.find((m) => m.id === mId);
                          if (mObj?.instruments?.length) {
                            setAddActiveRoles([...mObj.instruments]);
                          } else {
                            setAddActiveRoles(['Coros']);
                          }
                        }}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white flex-1"
                      >
                        {members.map((m) => {
                          const av = getMemberAvailabilityForDate(
                            m.id,
                            activeEvent.date
                          );
                          return (
                            <option key={m.id} value={m.id}>
                              {av?.status === 'unavailable' ? '⚠️ ' : '✓ '}
                              {m.name} {m.isGuest ? '(Suplente) ' : ''}(
                              {m.instruments.join(', ') || 'Miembro'})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetM =
                          members.find((m) => m.id === addActiveMemberId) ||
                          members[0];
                        if (!targetM) return;
                        const finalRoles =
                          addActiveRoles.length > 0 ? addActiveRoles : ['Coros'];
                        const newRow: ServiceAssignment = {
                          id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          memberId: targetM.id,
                          memberName: targetM.name,
                          role: finalRoles[0],
                          roles: finalRoles,
                          rsvpStatus: 'pending',
                          isGuest: Boolean(targetM.isGuest),
                        };
                        onUpdateEventAssignments(activeEvent.id, [
                          ...activeEvent.assignments,
                          newRow,
                        ]);
                        setShowAddMemberInDetail(false);
                      }}
                      className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 ${accent.bgClass}`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>Asignar al Evento</span>
                    </button>
                  </div>

                  {/* Selección múltiple de instrumentos/voces */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      Instrumentos / voces en este evento:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {allAvailableRoles.map((r) => {
                        const active = addActiveRoles.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() =>
                              setAddActiveRoles((prev) =>
                                prev.includes(r)
                                  ? prev.length > 1
                                    ? prev.filter((item) => item !== r)
                                    : prev
                                  : [...prev, r]
                              )
                            }
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all ${
                              active
                                ? `${accent.bgClass} border-transparent`
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {active ? '✓ ' : '+ '}
                            {r}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customInstrumentInput}
                        onChange={(e) => setCustomInstrumentInput(e.target.value)}
                        placeholder="Otro instrumento o rol personalizado..."
                        className="flex-1 min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = customInstrumentInput.trim();
                          if (!clean) return;
                          if (!addActiveRoles.includes(clean)) {
                            setAddActiveRoles((prev) => [...prev, clean]);
                          }
                          setCustomInstrumentInput('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0"
                      >
                        + Rol
                      </button>
                    </div>
                  </div>

                  {/* Convocar Amigo Suplente directamente a este evento */}
                  {friends.filter(
                    (f) =>
                      !activeEvent.assignments.some((a) => a.memberId === f.id)
                  ).length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
                      <span className="text-[11px] font-bold text-indigo-500 block">
                        O convoca a un Amigo como Músico Invitado solo para esta fecha:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {friends
                          .filter(
                            (f) =>
                              !activeEvent.assignments.some(
                                (a) => a.memberId === f.id
                              )
                          )
                          .map((friend) => (
                            <button
                              key={friend.id}
                              type="button"
                              onClick={() => {
                                const existingM = members.find(
                                  (m) => m.id === friend.id
                                );
                                const guestM =
                                  existingM ||
                                  (onConvokeFriendAsGuest
                                    ? onConvokeFriendAsGuest(friend)
                                    : {
                                        id: friend.id,
                                        name: friend.name,
                                        username: friend.username,
                                        email: friend.email,
                                        role: 'member' as const,
                                        instruments:
                                          friend.instruments?.length > 0
                                            ? friend.instruments
                                            : ['Coros'],
                                        phone: '',
                                        isGuest: true,
                                        avatarInitials: friend.avatarInitials,
                                        avatarUrl: friend.avatarUrl,
                                      });
                                const rolesForGuest =
                                  guestM.instruments?.length > 0
                                    ? guestM.instruments
                                    : ['Guitarra eléctrica'];
                                onUpdateEventAssignments(activeEvent.id, [
                                  ...activeEvent.assignments,
                                  {
                                    id: `asg-guest-${Date.now()}-${friend.id}`,
                                    memberId: guestM.id,
                                    memberName: guestM.name,
                                    role: rolesForGuest[0],
                                    roles: rolesForGuest,
                                    rsvpStatus: 'pending',
                                    isGuest: true,
                                  },
                                ]);
                                setShowAddMemberInDetail(false);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{friend.name}</span>
                              <span className="text-[10px] opacity-75">
                                ({friend.instruments[0] || 'Invitado'})
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lista Normal de Miembros en el Evento (con insignias de Estado y sin botones RSVP ajenos) */}
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {activeEvent.assignments.map((assign, assignIdx) => {
                  const isCurrentUser = assign.memberId === activeMember.id;
                  const memberAvail = getMemberAvailabilityForDate(
                    assign.memberId,
                    activeEvent.date
                  );
                  const isBlockedDate = memberAvail?.status === 'unavailable';
                  const assignedRolesList =
                    assign.roles && assign.roles.length > 0
                      ? assign.roles
                      : [assign.role];

                  return (
                    <div
                      key={
                        assign.id ||
                        `${assign.memberId}-${assign.role}-${assignIdx}`
                      }
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 ${
                        isBlockedDate
                          ? 'bg-rose-500/5'
                          : isCurrentUser
                          ? 'bg-amber-500/5'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {assign.memberName}
                          </span>
                          {(assign.isGuest ||
                            members.find((m) => m.id === assign.memberId)?.isGuest) && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold">
                              Invitado
                            </span>
                          )}
                          {isCurrentUser && (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${accent.softBgClass}`}
                            >
                              Tú
                            </span>
                          )}
                          {isBlockedDate && (
                            <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1">
                              <CalendarOff className="w-3 h-3" />
                              No disponible ({memberAvail?.reason || 'Fecha bloqueada'})
                            </span>
                          )}
                        </div>

                        {/* Instrumentos / Voces asignados a este miembro en este evento */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {assignedRolesList.map((rItem) => (
                            <span
                              key={rItem}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold"
                            >
                              <span>{rItem}</span>
                              {isLeader && assignedRolesList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextRoles = assignedRolesList.filter(
                                      (x) => x !== rItem
                                    );
                                    const updated = activeEvent.assignments.map(
                                      (a, i) =>
                                        i === assignIdx
                                          ? {
                                              ...a,
                                              role: nextRoles[0],
                                              roles: nextRoles,
                                            }
                                          : a
                                    );
                                    onUpdateEventAssignments(
                                      activeEvent.id,
                                      updated
                                    );
                                  }}
                                  className="text-rose-500 hover:text-rose-400 ml-0.5 font-bold"
                                  title="Quitar este instrumento/rol"
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}

                          {/* Selector rápido para que el Líder sume otro instrumento o voz a este miembro */}
                          {isLeader && (
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value as InstrumentRole;
                                if (!val) return;
                                if (assignedRolesList.includes(val)) return;
                                const nextRoles = [...assignedRolesList, val];
                                const updated = activeEvent.assignments.map(
                                  (a, i) =>
                                    i === assignIdx
                                      ? {
                                          ...a,
                                          role: nextRoles[0],
                                          roles: nextRoles,
                                        }
                                      : a
                                );
                                onUpdateEventAssignments(activeEvent.id, updated);
                              }}
                              className="px-2 py-0.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-[11px] font-bold text-slate-500 hover:border-amber-500"
                            >
                              <option value="">+ Sumar instrumento/voz</option>
                              {allAvailableRoles.map((rOpt) => (
                                <option
                                  key={rOpt}
                                  value={rOpt}
                                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                >
                                  {rOpt}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Estado de Invitación (Solo lectura en la lista general) + Botón de Eliminar para el Líder */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {assign.rsvpStatus === 'confirmed' && (
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmado
                          </span>
                        )}
                        {assign.rsvpStatus === 'pending' && (
                          <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5" />
                            Pendiente
                          </span>
                        )}
                        {assign.rsvpStatus === 'declined' && (
                          <span className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" />
                            Declinado
                          </span>
                        )}

                        {isLeader && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = activeEvent.assignments.filter(
                                (_, i) => i !== assignIdx
                              );
                              onUpdateEventAssignments(activeEvent.id, updated);
                            }}
                            title="Eliminar miembro de este evento"
                            className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* =============================================================
                4. NOTAS GRUPALES Y NOTAS PERSONALES DE ESTE EVENTO
               ============================================================= */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              {eventNotesSavedNotice && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{eventNotesSavedNotice}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tarjeta 1: Notas Grupales del Evento */}
                <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className={`w-4 h-4 ${accent.textClass}`} />
                        <span>Notas Grupales del Evento</span>
                      </h3>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                        Para todo el grupo
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Indicaciones generales de horarios, código de vestimenta, prueba de sonido o transiciones del servicio.
                    </p>
                    <textarea
                      rows={3}
                      value={eventGroupNotesDraft}
                      onChange={(e) => setEventGroupNotesDraft(e.target.value)}
                      placeholder="Ej. Prueba de sonido puntual a las 08:30 hrs; vestimenta tonos neutros; transición continua entre canción 1 y 2..."
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveActiveEventGroupNotes}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Nota Grupal del Evento</span>
                    </button>
                  </div>
                </div>

                {/* Tarjeta 2: Mis Notas Personales en este Evento */}
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
                      Tus recordatorios privados para este evento (cables, pedales, partes que te tocan o pendientes).
                    </p>
                    <textarea
                      rows={3}
                      value={eventPersonalNotesDraft}
                      onChange={(e) => setEventPersonalNotesDraft(e.target.value)}
                      placeholder="Escribe aquí tus apuntes personales para este evento..."
                      className="w-full p-3 rounded-xl border border-emerald-500/30 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveActiveEventPersonalNotes}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Mi Nota del Evento</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: EDITAR DATOS DE UN EVENTO YA CREADO (LÍDER / CO-LÍDER)
         ===================================================================== */}
      {showEditEventModal && activeEvent && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Editar Datos del Evento
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modifica el título, fecha, horarios o lugar de «{activeEvent.title}»
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditEventModal(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditEventSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Título del Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Evento
                  </label>
                  <select
                    value={editType}
                    onChange={(e) =>
                      setEditType(e.target.value as WorshipEvent['type'])
                    }
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="sunday">Domingo de Servicio</option>
                    <option value="rehearsal">Ensayo General</option>
                    <option value="special">Evento Especial</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InteractiveDatePicker
                  label="Fecha"
                  value={editDate}
                  onChange={(d) => setEditDate(d)}
                />
                <InteractiveTimePicker
                  label="Hora Citación"
                  value={editCallTime}
                  onChange={(t) => setEditCallTime(t)}
                />
                <InteractiveTimePicker
                  label="Hora Inicio"
                  value={editTime}
                  onChange={(t) => setEditTime(t)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ubicación / Lugar
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tema o Descripción Breve
                  </label>
                  <input
                    type="text"
                    value={editTheme}
                    onChange={(e) => setEditTheme(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Headphones className="w-3.5 h-3.5 text-emerald-500" />
                  Enlace de Playlist de Spotify del Evento (Opcional)
                </label>
                <input
                  type="url"
                  value={editSpotifyPlaylistUrl}
                  onChange={(e) => setEditSpotifyPlaylistUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/... (para que el equipo escuche los temas)"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditEventModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[44px] px-6 py-2 rounded-xl text-xs font-bold ${accent.bgClass}`}
                >
                  Guardar Cambios del Evento
                </button>
              </div>
            </form>
          </div>
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
                  <InteractiveDatePicker
                    label="Fecha"
                    value={availDate}
                    onChange={(d) => setAvailDate(d)}
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

      {/* =====================================================================
          MODAL: ARMAR PLAYLIST, ORDENAR CANCIONES Y ASIGNAR VOCES (LÍDER)
         ===================================================================== */}
      {showPlaylistEditor && activeEvent && isLeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Playlist, Orden y Voces para «{activeEvent.title}»
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reordena las canciones, elige el tono de la semana y asigna Voz Principal y Coros en cada canción.
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

            {/* Vinculación de Playlist de Spotify del Evento */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-emerald-300 flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-emerald-500" />
                Playlist de Spotify de este Evento (para escuchar la setlist)
              </label>
              <input
                type="url"
                defaultValue={activeEvent.spotifyPlaylistUrl || ''}
                onBlur={(e) => {
                  onUpdateEvent({
                    ...activeEvent,
                    spotifyPlaylistUrl: e.target.value.trim() || undefined,
                  });
                }}
                placeholder="https://open.spotify.com/playlist/... (se guarda al salir del campo)"
                className="w-full min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />
            </div>

            {/* 1. Orden actual de la Playlist y Asignación de Voces por Canción */}
            {activeEvent.songs.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  1. Orden de Canciones Seleccionadas ({activeEvent.songs.length})
                </p>
                <div className="space-y-2.5">
                  {activeEvent.songs.map((evItem, idx) => {
                    const song = songs.find((s) => s.id === evItem.songId);
                    if (!song) return null;
                    const backing = evItem.backingVocals || [];

                    return (
                      <div
                        key={`${evItem.songId}-${idx}`}
                        className="p-3.5 rounded-2xl border border-amber-500/40 bg-amber-500/5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 font-mono text-xs font-extrabold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">
                                {song.title}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Tono Base: {song.originalKey} · {song.bpm} BPM
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveSongInActiveEvent(idx, -1)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-bold disabled:opacity-30"
                              title="Subir"
                            >
                              ↑ Subir
                            </button>
                            <button
                              type="button"
                              disabled={idx === activeEvent.songs.length - 1}
                              onClick={() => moveSongInActiveEvent(idx, 1)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-bold disabled:opacity-30"
                              title="Bajar"
                            >
                              ↓ Bajar
                            </button>
                            <select
                              value={evItem.customKey || song.originalKey}
                              onChange={(e) =>
                                updateSongItemInActiveEvent(song.id, {
                                  customKey: e.target.value,
                                })
                              }
                              className="min-h-[34px] px-2.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold text-slate-900 dark:text-white"
                            >
                              <optgroup label="Tonalidades Mayores">
                                {MAJOR_KEYS.map((k) => (
                                  <option key={k} value={k}>
                                    Tono: {k} Mayor {k === song.originalKey ? '(Base)' : ''}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Tonalidades Menores">
                                {MINOR_KEYS.map((k) => (
                                  <option key={k} value={k}>
                                    Tono: {k} ({k.replace(/m$/, '')}m) {k === song.originalKey ? '(Base)' : ''}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <button
                              type="button"
                              onClick={() => toggleSongInActiveEvent(song)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                              title="Quitar de la playlist"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Selector de Voz Principal y Coros para esta canción */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 mb-1">
                              Voz Principal en esta canción:
                            </label>
                            <select
                              value={evItem.vocalLeader || ''}
                              onChange={(e) =>
                                updateSongItemInActiveEvent(song.id, {
                                  vocalLeader: e.target.value,
                                })
                              }
                              className="w-full min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                            >
                              <option value="">Sin asignar / Instrumental</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.name}>
                                  {m.name} ({m.instruments.join(', ')})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-500 mb-1">
                              Coros en esta canción (toca para elegir):
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {members.map((m) => {
                                const isBacking = backing.includes(m.name);
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      const nextBacking = isBacking
                                        ? backing.filter((n) => n !== m.name)
                                        : [...backing, m.name];
                                      updateSongItemInActiveEvent(song.id, {
                                        backingVocals: nextBacking,
                                      });
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                      isBacking
                                        ? 'bg-sky-600 text-white border-transparent'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {isBacking ? '✓ ' : '+ '}
                                    {m.name.split(' ')[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Buscador para agregar más canciones del Repertorio Base */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Buscar y agregar canciones del Repertorio Base
              </p>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={songSearchEditor}
                  onChange={(e) => setSongSearchEditor(e.target.value)}
                  placeholder="Escribe el nombre o autor de la canción para buscar..."
                  className="w-full min-h-[40px] pl-9 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
                {songSearchEditor && (
                  <button
                    type="button"
                    onClick={() => setSongSearchEditor('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {songs
                  .filter((song) => {
                    const q = songSearchEditor.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      song.title.toLowerCase().includes(q) ||
                      song.artist.toLowerCase().includes(q)
                    );
                  })
                  .map((song) => {
                    const included = activeEvent.songs.some(
                      (s) => s.songId === song.id
                    );
                    return (
                      <button
                        key={song.id}
                        type="button"
                        onClick={() => toggleSongInActiveEvent(song)}
                        className={`w-full px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-left transition-all ${
                          included
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              included
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                            }`}
                          >
                            {included ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {song.title}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {song.artist} · Tono Base: {song.originalKey}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 shrink-0">
                          {included ? 'Agregada' : '+ Agregar'}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPlaylistEditor(false)}
              className={`w-full min-h-[48px] rounded-2xl text-sm font-bold ${accent.bgClass}`}
            >
              Listo · Guardar Playlist, Orden y Voces
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
                    Evento Especial
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
                    <option value="special">Evento Especial</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <InteractiveDatePicker
                    label="Fecha"
                    value={newDate}
                    onChange={(d) => setNewDate(d)}
                  />
                </div>
                <div>
                  <InteractiveTimePicker
                    label="Hora Citación"
                    value={newCallTime}
                    onChange={(t) => setNewCallTime(t)}
                  />
                </div>
                <div>
                  <InteractiveTimePicker
                    label="Hora Inicio"
                    value={newTime}
                    onChange={(t) => setNewTime(t)}
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

              {/* Opciones Adicionales Colapsables (Ubicación, Tema, Notas, Spotify) para vista limpia */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowExtraEventFields((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <span>
                    Detalles opcionales (Ubicación, Notas grupales, Link de Spotify)
                  </span>
                  <span className="text-[11px] text-amber-500">
                    {showExtraEventFields ? 'Ocultar ▲' : 'Editar detalles ▼'}
                  </span>
                </button>

                {showExtraEventFields && (
                  <div className="p-3.5 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Ubicación / Lugar
                        </label>
                        <input
                          type="text"
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          placeholder="Ej. Auditorio Central"
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Tema o Descripción Breve
                        </label>
                        <input
                          type="text"
                          value={newTheme}
                          onChange={(e) => setNewTheme(e.target.value)}
                          placeholder="Ej. Servicio Dominical"
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          Notas Grupales (Vestimenta, indicaciones)
                        </label>
                        <input
                          type="text"
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                          placeholder="Ej. Vestimenta neutra, llegar 15 min antes..."
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                          <Headphones className="w-3 h-3 text-emerald-500" />
                          Playlist de Spotify (Opcional)
                        </label>
                        <input
                          type="url"
                          value={newSpotifyPlaylistUrl}
                          onChange={(e) => setNewSpotifyPlaylistUrl(e.target.value)}
                          placeholder="https://open.spotify.com/playlist/..."
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ===============================================================
                  SECCIÓN MINIMALISTA DE MIEMBROS Y SUPLENTES/AMIGOS PARA EL EVENTO
                 =============================================================== */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-500" />
                      Equipo Convocado ({draftAssignments.length})
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Marca quiénes participan el <span className="font-mono">{newDate}</span> ({membersAvailableOnNewDate.length} disp. / {membersUnavailableOnNewDate.length} no disp.)
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftAssignments(buildSmartAssignmentsForDate(newDate))
                      }
                      className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                    >
                      Solo disponibles
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftAssignments([])}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:text-rose-500"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                {/* Lista compacta de 1 fila por miembro (Titulares y Suplentes en el grupo) */}
                <div className="divide-y divide-slate-200/80 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-60 overflow-y-auto">
                  {members.map((m) => {
                    const draftIndex = draftAssignments.findIndex(
                      (a) => a.memberId === m.id
                    );
                    const isSelected = draftIndex !== -1;
                    const draftItem = isSelected ? draftAssignments[draftIndex] : null;
                    const avail = getMemberAvailabilityForDate(m.id, newDate);
                    const isUnavailable = avail?.status === 'unavailable';
                    const isExpanded = expandedDraftMemberId === m.id;
                    const currentRoles =
                      draftItem?.roles && draftItem.roles.length > 0
                        ? draftItem.roles
                        : draftItem
                        ? [draftItem.role]
                        : m.instruments?.length
                        ? m.instruments
                        : ['Coros'];

                    const toggleMemberSelection = () => {
                      if (isSelected) {
                        handleRemoveDraftAssignment(draftIndex);
                        if (isExpanded) setExpandedDraftMemberId(null);
                      } else {
                        handleAddDraftAssignment(m);
                      }
                    };

                    return (
                      <div key={m.id} className="px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={toggleMemberSelection}
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                          >
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0 ${
                                isSelected
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-xs font-bold truncate ${
                                    isSelected
                                      ? 'text-slate-900 dark:text-white'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {m.name}
                                </span>
                                {m.isGuest && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[9px] font-bold">
                                    Suplente
                                  </span>
                                )}
                                {isUnavailable ? (
                                  <span
                                    className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-semibold truncate"
                                    title={avail?.reason || 'Fecha bloqueada'}
                                  >
                                    ⚠️ No disp.
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                    · Disp.
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          {isSelected ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDraftMemberId(isExpanded ? null : m.id)
                              }
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 shrink-0 max-w-[170px]"
                              title="Cambiar o agregar instrumentos para este evento"
                            >
                              <span className="truncate">
                                {currentRoles.join(' + ')}
                              </span>
                              <span className="text-[9px] opacity-75">
                                {isExpanded ? '▲' : '▾'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                              {m.instruments[0] || 'Músico'}
                            </span>
                          )}
                        </div>

                        {/* Selector desplegable de instrumentos solo cuando el líder toca el rol del miembro */}
                        {isSelected && isExpanded && (
                          <div className="pt-1.5 pl-7 flex flex-wrap gap-1">
                            {allAvailableRoles.map((roleOpt) => {
                              const activeRole = currentRoles.includes(roleOpt);
                              return (
                                <button
                                  key={roleOpt}
                                  type="button"
                                  onClick={() =>
                                    handleToggleDraftAssignmentRole(
                                      draftIndex,
                                      roleOpt
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                                    activeRole
                                      ? 'bg-amber-500 text-slate-950 border-transparent'
                                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                                  }`}
                                >
                                  {activeRole ? '✓ ' : '+ '}
                                  {roleOpt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Convocar Amigo Músico como Invitado / Suplente desde la Red de Amigos */}
                {friends.filter(
                  (f) => !draftAssignments.some((a) => a.memberId === f.id)
                ).length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 block">
                      + Convocar Amigo Suplente (Solo verá este evento y sus canciones):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {friends
                        .filter(
                          (f) =>
                            !draftAssignments.some((a) => a.memberId === f.id)
                        )
                        .map((friend) => (
                          <button
                            key={friend.id}
                            type="button"
                            onClick={() => {
                              const existingMember = members.find(
                                (m) => m.id === friend.id
                              );
                              const guestMember =
                                existingMember ||
                                (onConvokeFriendAsGuest
                                  ? onConvokeFriendAsGuest(friend)
                                  : {
                                      id: friend.id,
                                      name: friend.name,
                                      username: friend.username,
                                      email: friend.email,
                                      role: 'member' as const,
                                      instruments:
                                        friend.instruments?.length > 0
                                          ? friend.instruments
                                          : ['Coros'],
                                      phone: '',
                                      isGuest: true,
                                      avatarInitials: friend.avatarInitials,
                                      avatarUrl: friend.avatarUrl,
                                    });
                              setDraftAssignments((prev) => [
                                ...prev,
                                {
                                  id: `asg-guest-${Date.now()}-${friend.id}`,
                                  memberId: guestMember.id,
                                  memberName: guestMember.name,
                                  role:
                                    guestMember.instruments[0] || 'Guitarra eléctrica',
                                  roles:
                                    guestMember.instruments.length > 0
                                      ? guestMember.instruments
                                      : ['Guitarra eléctrica'],
                                  rsvpStatus: 'pending',
                                  isGuest: true,
                                },
                              ]);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-[11px] font-bold text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{friend.name}</span>
                            <span className="text-[10px] opacity-75">
                              ({friend.instruments[0] || 'Suplente'})
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Buscador interactivo de Canciones + Tono por Semana para el nuevo evento */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Canciones del Evento ({selectedSongItems.length} seleccionadas)
                  </label>
                  {selectedSongItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedSongItems([])}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-500"
                    >
                      Limpiar lista
                    </button>
                  )}
                </div>

                {/* Buscador para filtrar canciones conforme se escribe */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={songSearchCreate}
                    onChange={(e) => setSongSearchCreate(e.target.value)}
                    placeholder="Buscar canción por nombre o artista para agregar..."
                    className="w-full min-h-[40px] pl-9 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                  {songSearchCreate && (
                    <button
                      type="button"
                      onClick={() => setSongSearchCreate('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Resultados de búsqueda (o sugerencias rápidas) */}
                {songs.length === 0 ? (
                  <p className="text-xs text-slate-500 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    Aún no hay canciones en el Repertorio Base. Puedes agregarlas después.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                    {songs
                      .filter((song) => {
                        const q = songSearchCreate.trim().toLowerCase();
                        if (!q) return !selectedSongItems.some((i) => i.songId === song.id);
                        return (
                          song.title.toLowerCase().includes(q) ||
                          song.artist.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, songSearchCreate.trim() ? 30 : 8)
                      .map((song) => {
                        const checked = selectedSongItems.some(
                          (i) => i.songId === song.id
                        );
                        return (
                          <button
                            key={song.id}
                            type="button"
                            onClick={() => {
                              setSelectedSongItems((prev) =>
                                checked
                                  ? prev.filter((i) => i.songId !== song.id)
                                  : [
                                      ...prev,
                                      {
                                        songId: song.id,
                                        customKey: song.originalKey,
                                        vocalLeader: activeMember.name,
                                        backingVocals: [],
                                      },
                                    ]
                              );
                              if (!checked && songSearchCreate.trim()) {
                                setSongSearchCreate('');
                              }
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                              checked
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-500/50'
                            }`}
                          >
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {song.title}{' '}
                              <span className="text-slate-400 font-normal">
                                · {song.artist} ({song.originalKey})
                              </span>
                            </span>
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                              {checked ? '✓ Agregada' : '+ Agregar'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Lista de canciones ya seleccionadas para este evento con su selector de Tono */}
                {selectedSongItems.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                    {selectedSongItems.map((itemObj, idx) => {
                      const song = songs.find((s) => s.id === itemObj.songId);
                      if (!song) return null;
                      return (
                        <div
                          key={song.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              0{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {song.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
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
                              className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px] font-bold text-slate-900 dark:text-white"
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
                                    {k} ({k.replace(/m$/, '')}m)
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedSongItems((prev) =>
                                  prev.filter((i) => i.songId !== song.id)
                                )
                              }
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-500"
                              title="Quitar canción"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
