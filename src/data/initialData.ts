import {
  ActivityFeedItem,
  AppIdentity,
  BandMember,
  ChatMessage,
  Devotional,
  GmailInvitation,
  NoticeAlert,
  Song,
  WorshipEvent,
} from '../types';

export const INITIAL_IDENTITY: AppIdentity = {
  ministryName: 'Mi Grupo de Alabanza',
  inviteCode: 'JSTONE-2026',
  iconId: 'pick_cross',
  accentColor: 'amber',
  darkMode: true,
};

// La aplicación inicia completamente limpia (sin datos precargados)
export const INITIAL_MEMBERS: BandMember[] = [];

export const INITIAL_INVITATIONS: GmailInvitation[] = [];

export const INITIAL_SONGS: Song[] = [];

export const INITIAL_EVENTS: WorshipEvent[] = [];

export const INITIAL_DEVOTIONALS: Devotional[] = [];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [];

export const INITIAL_ALERTS: NoticeAlert[] = [];

export const INITIAL_FEED: ActivityFeedItem[] = [];

export function generateSimpleChordSvgDataUrl(
  title: string,
  key: string,
  bpm: number,
  structure: string
): string {
  const safeTitle = (title || 'Canción').replace(/[<>&"]/g, '');
  const safeKey = (key || 'C').replace(/[<>&"]/g, '');
  const safeBpm = String(bpm || 75).replace(/[<>&"]/g, '');
  const safeStructure = (structure || 'Intro → Verso → Coro').replace(/[<>&"]/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
    <rect width="100%" height="100%" fill="#0f172a" rx="16"/>
    <rect x="20" y="20" width="560" height="360" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <circle cx="50" cy="55" r="16" fill="#f59e0b" fill-opacity="0.2"/>
    <text x="50" y="61" text-anchor="middle" fill="#f59e0b" font-family="sans-serif" font-weight="bold" font-size="14">♪</text>
    <text x="80" y="60" fill="#f8fafc" font-family="sans-serif" font-weight="bold" font-size="20">${safeTitle}</text>
    <line x1="40" y1="90" x2="560" y2="90" stroke="#334155" stroke-width="1.5"/>
    <rect x="40" y="110" width="120" height="44" rx="8" fill="#0f172a" stroke="#475569" stroke-width="1"/>
    <text x="55" y="128" fill="#94a3b8" font-family="sans-serif" font-size="11">TONALIDAD</text>
    <text x="55" y="146" fill="#38bdf8" font-family="sans-serif" font-weight="bold" font-size="16">${safeKey}</text>
    <rect x="180" y="110" width="120" height="44" rx="8" fill="#0f172a" stroke="#475569" stroke-width="1"/>
    <text x="195" y="128" fill="#94a3b8" font-family="sans-serif" font-size="11">TEMPO (BPM)</text>
    <text x="195" y="146" fill="#10b981" font-family="sans-serif" font-weight="bold" font-size="16">${safeBpm} BPM</text>
    <rect x="40" y="175" width="520" height="60" rx="8" fill="#0f172a" stroke="#475569" stroke-width="1"/>
    <text x="55" y="196" fill="#94a3b8" font-family="sans-serif" font-size="11">ESTRUCTURA</text>
    <text x="55" y="218" fill="#e2e8f0" font-family="sans-serif" font-size="13">${safeStructure}</text>
    <text x="300" y="300" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="13">Partitura / Cifrado en línea disponible en el cancionero</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

