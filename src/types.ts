export type AccentColorId = 'amber' | 'indigo' | 'emerald' | 'rose' | 'sky' | 'violet';

export type BrandIconId = 'pick_cross' | 'music' | 'flame' | 'crown' | 'guitar' | 'mic' | 'heart';

export type UserRole = 'leader' | 'member';

export type NavigationTab =
  | 'inicio'
  | 'eventos'
  | 'cancionero'
  | 'devocionales'
  | 'chat'
  | 'herramientas';

export type InstrumentRole =
  | 'Vocalista líder'
  | 'Coros'
  | 'Guitarra eléctrica'
  | 'Acústica'
  | 'Teclado'
  | 'Batería'
  | 'Bajo'
  | 'Violín'
  | 'Metales'
  | 'Percusión'
  | 'Secuencias'
  | 'Sonido/Multimedia'
  | 'Proyección'
  | 'Danza'
  | (string & {});

export const ALL_INSTRUMENT_ROLES: InstrumentRole[] = [
  'Vocalista líder',
  'Coros',
  'Guitarra eléctrica',
  'Acústica',
  'Teclado',
  'Batería',
  'Bajo',
  'Violín',
  'Metales',
  'Percusión',
  'Secuencias',
  'Sonido/Multimedia',
  'Proyección',
  'Danza',
];

export const MAX_GROUPS_PER_USER = 6;

export interface AppUser {
  id: string;
  name: string;
  username: string;
  email: string;
  password: string;
  instruments: InstrumentRole[];
  avatarInitials: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface AppIdentity {
  ministryName: string;
  inviteCode: string;
  iconId: BrandIconId;
  customImageUrl?: string;
  accentColor: AccentColorId;
  darkMode: boolean;
}

export interface BandMember {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: UserRole;
  instruments: InstrumentRole[];
  phone: string;
  isLeader?: boolean;
  avatarInitials: string;
  avatarUrl?: string;
  joinedAt?: string;
}

export interface GmailInvitation {
  id: string;
  groupId?: string;
  groupName?: string;
  identifier: string; // username or email
  email: string;
  username?: string;
  invitedName: string;
  suggestedInstrument: InstrumentRole;
  inviteCode: string;
  status: 'sent' | 'accepted';
  sentByLeaderName: string;
  sentAt: string;
}

export type RSVPStatus = 'confirmed' | 'pending' | 'declined';

export interface ServiceAssignment {
  id?: string;
  role: InstrumentRole;
  roles?: InstrumentRole[];
  memberId: string;
  memberName: string;
  rsvpStatus: RSVPStatus;
}

export interface EventSongItem {
  songId: string;
  customKey?: string;
  vocalLeader?: string;
  backingVocals?: string[];
}

export interface WorshipEvent {
  id: string;
  title: string;
  type: 'sunday' | 'rehearsal' | 'special';
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  callTime: string; // HH:mm
  location: string;
  preacherOrTheme: string;
  alertReminder?: string;
  notes: string;
  personalNotes?: Record<string, string>; // keyed by memberId / userId
  songs: EventSongItem[];
  assignments: ServiceAssignment[];
  spotifyPlaylistUrl?: string;
}

export type TimeSignature = '2/4' | '3/4' | '4/4' | '6/8';

export interface SongVoiceNote {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  audioDataUrl: string;
  durationSec: number;
  createdAt: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  bpm: number;
  timeSignature: TimeSignature;
  style: 'Adoración' | 'Alabanza / Júbilo' | 'Intimidad' | 'Congregacional';
  characteristics: string[];
  structure?: string[]; // Ordered song sections, e.g. ['Intro', 'Verso 1', 'Coro', 'Puente x2', 'Final']
  spotifyUrl?: string;
  spotifyTrackId?: string;
  referenceDuration: string;
  chordProgPreview: string[];
  lyricsAndChords: string;
  chordSheetImageUrl?: string;
  attachedFileName?: string;
  notes?: string;
  groupNotes?: string; // Shared band notes for the song
  personalNotes?: Record<string, string>; // Private notes per memberId / userId
  addedByUserId: string;
  addedByName: string;
  addedByRole: UserRole;
  addedAt: string;
  voiceNotes?: SongVoiceNote[];
}

export interface MemberAvailabilityRecord {
  id: string;
  memberId: string;
  memberName: string;
  memberUsername?: string;
  date: string; // YYYY-MM-DD
  status: 'unavailable' | 'available';
  reason?: string;
  updatedAt: string;
}

export interface DevotionalComment {
  id: string;
  authorName: string;
  authorRole: string;
  text: string;
  createdAt: string;
}

export interface StudyVerse {
  id: string;
  reference: string;
  text: string;
}

export interface StudySession {
  id: string;
  sessionNumber: number;
  title: string;
  content: string;
  verses: StudyVerse[];
  completedByMemberIds: string[];
}

export interface Devotional {
  id: string;
  title: string;
  description: string;
  authorName: string;
  authorRole: string;
  date: string;
  category:
    | 'Corazón de Adorador'
    | 'Excelencia Musical'
    | 'Unidad en el Espíritu'
    | 'Estudio Bíblico';
  sessions: StudySession[];
  completedByMemberIds: string[];
  comments: DevotionalComment[];
}

export type ChatChannelId = 'avisos' | 'general' | 'ensayos' | 'sugerencias' | 'oracion';

export interface ChatMessage {
  id: string;
  groupId?: string;
  channel: ChatChannelId;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  senderRole: UserRole;
  senderInstrument: string;
  text: string;
  timestamp: string;
  createdAtMs?: number;
  isPinned?: boolean;
  prayerCount?: number;
  prayedByMemberIds?: string[];
  attachedSongId?: string;
  mentionedUsernames?: string[];
  voiceClipUrl?: string;
  voiceClipDurationSec?: number;
}

export interface NoticeAlert {
  id: string;
  title: string;
  message: string;
  priority: 'high' | 'normal';
  createdAt: string;
  eventRefId?: string;
}

export interface ActivityFeedItem {
  id: string;
  type:
    | 'song_added'
    | 'event_scheduled'
    | 'playlist_updated'
    | 'rsvp_confirmed'
    | 'devotional_published'
    | 'member_joined';
  actorName: string;
  actorRole: UserRole;
  title: string;
  description: string;
  timestamp: string;
  targetTab: NavigationTab;
  targetId?: string;
}

export type NotificationCategory =
  | 'new_event'
  | 'new_song'
  | 'mention'
  | 'role_assigned'
  | 'study_published'
  | 'group_invite';

export interface AppNotification {
  id: string;
  recipientUserId: string; // User ID who receives this notification ('all' or specific user.id)
  groupId: string;
  groupName: string;
  category: NotificationCategory;
  title: string;
  message: string;
  actorName: string;
  actorUsername?: string;
  createdAt: string;
  readByUserIds: string[];
  targetTab: NavigationTab;
  targetId?: string;
}

export interface WorshipGroup {
  id: string;
  leaderUserId: string;
  memberIds?: string[];
  invitedIdentifiers?: string[];
  inviteCodeNormalized?: string;
  identity: AppIdentity;
  members: BandMember[];
  invitations: GmailInvitation[];
  events: WorshipEvent[];
  songs: Song[];
  devotionals: Devotional[];
  chatMessages: ChatMessage[];
  alerts: NoticeAlert[];
  activityFeed: ActivityFeedItem[];
  availabilityRecords?: MemberAvailabilityRecord[];
}
