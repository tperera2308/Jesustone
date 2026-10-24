import { EventRehearsal, Song, WorshipEvent } from '../types';

/**
 * Formatea una fecha YYYY-MM-DD y hora HH:mm en formato YYYYMMDDTHHmm00
 */
function toCalendarTimestamp(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/[^0-9]/g, '').slice(0, 8);
  const timeParts = timeStr.split(':');
  const hh = (timeParts[0] || '09').padStart(2, '0');
  const mm = (timeParts[1] || '00').padStart(2, '0');
  return `${cleanDate}T${hh}${mm}00`;
}

/**
 * Calcula la hora de finalización sumando minutos a la hora inicial
 */
function calculateEndTimeStamp(
  dateStr: string,
  startTimeStr: string,
  durationMinutes = 120
): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = startTimeStr.split(':').map(Number);
  const startDate = new Date(y, (m || 1) - 1, d || 1, hh || 9, mm || 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const yyyy = endDate.getFullYear();
  const month = String(endDate.getMonth() + 1).padStart(2, '0');
  const day = String(endDate.getDate()).padStart(2, '0');
  const endH = String(endDate.getHours()).padStart(2, '0');
  const endM = String(endDate.getMinutes()).padStart(2, '0');

  return `${yyyy}${month}${day}T${endH}${endM}00`;
}

/**
 * Compila una descripción completa y legible para el calendario
 */
function buildEventCalendarDescription(
  event: WorshipEvent,
  ministryName?: string,
  songs: Song[] = []
): string {
  const lines: string[] = [];

  if (ministryName) {
    lines.push(`🏛️ Ministerio: ${ministryName}`);
  }
  lines.push(`⏰ Citación: ${event.callTime || event.time}`);
  lines.push(`🎸 Inicio: ${event.time}`);
  if (event.location) {
    lines.push(`📍 Lugar: ${event.location}`);
  }
  if (event.preacherOrTheme) {
    lines.push(`📖 Tema / Prédica: ${event.preacherOrTheme}`);
  }

  // Lista de canciones / repertorio
  if (event.songs && event.songs.length > 0) {
    lines.push('');
    lines.push('🎶 REPERTORIO / SETLIST:');
    event.songs.forEach((item, idx) => {
      const songObj = songs.find((s) => s.id === item.songId);
      const title = songObj ? songObj.title : `Canción #${idx + 1}`;
      const key = item.customKey || songObj?.originalKey || '';
      const vocal = item.vocalLeader ? ` (Voz: ${item.vocalLeader})` : '';
      lines.push(`  ${idx + 1}. ${title} ${key ? `[${key}]` : ''}${vocal}`);
    });
  }

  // Ensayos asociados
  if (event.rehearsals && event.rehearsals.length > 0) {
    lines.push('');
    lines.push('🎵 ENSAYOS PROGRAMADOS:');
    event.rehearsals.forEach((r, idx) => {
      lines.push(
        `  • ${r.title || `Ensayo #${idx + 1}`}: ${r.date} a las ${r.time} hrs (${r.location || 'Salón de ensayo'})`
      );
    });
  }

  // Equipo y roles
  if (event.assignments && event.assignments.length > 0) {
    lines.push('');
    lines.push('👥 CONVOCATORIA DE EQUIPO:');
    event.assignments.forEach((a) => {
      const roleStr = a.roles && a.roles.length > 0 ? a.roles.join(', ') : a.role;
      lines.push(`  • ${a.memberName}: ${roleStr}`);
    });
  }

  if (event.notes) {
    lines.push('');
    lines.push('📝 INDICACIONES:');
    lines.push(event.notes);
  }

  lines.push('');
  lines.push('Organizado en JesusTone Worship Manager.');

  return lines.join('\n');
}

/**
 * Genera el enlace directo para añadir a Google Calendar en 1 clic
 */
export function generateGoogleCalendarUrl(
  event: WorshipEvent,
  ministryName?: string,
  songs: Song[] = []
): string {
  const startTime = event.callTime || event.time || '09:00';
  const startStamp = toCalendarTimestamp(event.date, startTime);
  const endStamp = calculateEndTimeStamp(event.date, startTime, 150);

  const titlePrefix = ministryName ? `[${ministryName}] ` : '';
  const title = `${titlePrefix}${event.title}`;
  const details = buildEventCalendarDescription(event, ministryName, songs);
  const location = event.location || '';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startStamp}/${endStamp}`,
    details,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Genera el archivo .ics universal para Apple Calendar, Outlook y calendarios nativos móviles
 */
export function generateIcsContent(
  event: WorshipEvent,
  ministryName?: string,
  songs: Song[] = []
): string {
  const startTime = event.callTime || event.time || '09:00';
  const startStamp = toCalendarTimestamp(event.date, startTime);
  const endStamp = calculateEndTimeStamp(event.date, startTime, 150);
  const nowStamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .split('.')[0] + 'Z';

  const titlePrefix = ministryName ? `[${ministryName}] ` : '';
  const title = `${titlePrefix}${event.title}`.replace(/[,;]/g, ' ');
  const details = buildEventCalendarDescription(event, ministryName, songs)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
  const location = (event.location || '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JesusTone//Worship Band Manager//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:jst-${event.id}-${Date.now()}@jesustone.app`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    `LOCATION:${location}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio: Citación de Alabanza',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1440M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio mañana: Servicio de Alabanza',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Descarga directamente el archivo .ics en el dispositivo del usuario
 */
export function downloadEventIcs(
  event: WorshipEvent,
  ministryName?: string,
  songs: Song[] = []
): void {
  const icsText = generateIcsContent(event, ministryName, songs);
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeTitle = event.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 25);
  link.download = `${event.date}_${safeTitle}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Genera enlace de Google Calendar para un ensayo específico
 */
export function generateRehearsalGoogleCalendarUrl(
  rehearsal: EventRehearsal,
  parentEventTitle: string,
  ministryName?: string
): string {
  const startTime = rehearsal.time || rehearsal.callTime || '19:00';
  const startStamp = toCalendarTimestamp(rehearsal.date, startTime);
  const endStamp = calculateEndTimeStamp(rehearsal.date, startTime, 120);

  const titlePrefix = ministryName ? `[${ministryName}] ` : '';
  const title = `${titlePrefix}Ensayo: ${rehearsal.title} (${parentEventTitle})`;
  const details = [
    `🎵 Ensayo para: ${parentEventTitle}`,
    `⏰ Horario: ${rehearsal.time}`,
    `📍 Lugar: ${rehearsal.location || 'Salón de ensayos'}`,
    rehearsal.notes ? `📝 Notas: ${rehearsal.notes}` : '',
    '',
    'JesusTone Worship Manager',
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startStamp}/${endStamp}`,
    details,
    location: rehearsal.location || '',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Descarga archivo .ics para un ensayo específico
 */
export function downloadRehearsalIcs(
  rehearsal: EventRehearsal,
  parentEventTitle: string,
  ministryName?: string
): void {
  const startTime = rehearsal.time || rehearsal.callTime || '19:00';
  const startStamp = toCalendarTimestamp(rehearsal.date, startTime);
  const endStamp = calculateEndTimeStamp(rehearsal.date, startTime, 120);
  const nowStamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .split('.')[0] + 'Z';

  const titlePrefix = ministryName ? `[${ministryName}] ` : '';
  const title = `${titlePrefix}Ensayo: ${rehearsal.title} (${parentEventTitle})`.replace(
    /[,;]/g,
    ' '
  );
  const details = `Ensayo de preparacion para ${parentEventTitle}. Lugar: ${rehearsal.location || 'Auditorio'}`
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JesusTone//Worship Band Manager//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:reh-${rehearsal.id}-${Date.now()}@jesustone.app`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    `LOCATION:${rehearsal.location || ''}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de Ensayo',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeTitle = (rehearsal.title || 'Ensayo')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 20);
  link.download = `${rehearsal.date}_${safeTitle}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
