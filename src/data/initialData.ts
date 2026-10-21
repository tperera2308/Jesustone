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
