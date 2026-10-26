/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccentColorId,
  ActivityFeedItem,
  AppIdentity,
  AppNotification,
  AppUser,
  BandMember,
  BrandIconId,
  ChatChannelId,
  ChatMessage,
  CustomChatChannel,
  Devotional,
  DirectMessage,
  EventSongItem,
  FriendRequest,
  GmailInvitation,
  InstrumentRole,
  MAX_GROUPS_PER_USER,
  MemberAvailabilityRecord,
  NavigationTab,
  NoticeAlert,
  NotificationCategory,
  RSVPStatus,
  ServiceAssignment,
  Song,
  TimeSignature,
  UserRole,
  WorshipEvent,
  WorshipGroup,
} from './types';
import { INITIAL_IDENTITY } from './data/initialData';
import {
  BrandIconDisplay,
  GuitarPickCrossIcon,
  IdentityModal,
  getAccentClasses,
} from './components/IdentityModal';
import { AuthOnboardingModal } from './components/AuthOnboardingModal';
import {
  NotificationsModal,
  getNotificationCategoryLabel,
} from './components/NotificationsModal';
import { DashboardHome } from './components/DashboardHome';
import { EventsModule } from './components/EventsModule';
import { SongbookModule } from './components/SongbookModule';
import { DevotionalsModule } from './components/DevotionalsModule';
import { ChatModule } from './components/ChatModule';
import { ToolsModule } from './components/ToolsModule';
import { MusicianProfileModal } from './components/MusicianProfileModal';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import {
  ensurePushServiceWorker,
  PushNavigationPayload,
  sendWebPushToRecipients,
  showNativeNotificationViaSW,
  syncExistingPushSubscription,
} from './utils/pushNotifications';
import {
  clearAllCloudData,
  deleteChannelMessagesFromFirestore,
  deleteChatMessageFromFirestore,
  deleteDirectMessageFromFirestore,
  deleteNotificationFromFirestore,
  deleteSongFromFirestore,
  enrichGroupIndexes,
  findGroupByInviteCodeInCloud,
  MAX_CHAT_MESSAGES_PER_GROUP,
  MAX_DMS_PER_CONVERSATION,
  MAX_NOTIFICATIONS,
  signOutFirebaseOfficial,
  subscribeToJesustoneCloud,
  syncChatMessageToFirestore,
  syncDirectMessageToFirestore,
  syncFirebaseEmailAuth,
  syncFriendRequestToFirestore,
  deleteMediaFromStorage,
  syncGroupToFirestore,
  syncNotificationToFirestore,
  syncSongToFirestore,
  syncUserToFirestore,
  testFirestoreConnection,
} from './firebase';
import { runAutomaticStorageCleanup } from './utils/storageCleaner';
import {
  ArrowLeft,
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  ChevronDown,
  Download,
  FolderPlus,
  Home,
  LogOut,
  MessageSquare,
  Music,
  Palette,
  Settings,
  ShieldCheck,
  Sliders,
  Smartphone,
  User,
  Users,
  WifiOff,
  X,
} from 'lucide-react';

const STORAGE_KEYS = {
  USERS: 'jesustone_users_v4',
  CURRENT_USER_ID: 'jesustone_current_user_v4',
  GROUPS: 'jesustone_groups_v4',
  ACTIVE_GROUP_ID: 'jesustone_active_group_v4',
  THEME_PREF: 'jesustone_theme_pref_v4',
  NOTIFICATIONS: 'jesustone_notifications_v4',
  FRIEND_REQUESTS: 'jesustone_friend_requests_v4',
  DIRECT_MESSAGES: 'jesustone_direct_messages_v4',
  DELETED_SONG_IDS: 'jesustone_deleted_songs_v4',
  DELETED_EVENT_IDS: 'jesustone_deleted_events_v4',
  DELETED_MSG_IDS: 'jesustone_deleted_msgs_v4',
};

function generateMusicianCodeFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  const num = (hash % 9000) + 1000;
  return `JST-${num}`;
}

function ensureUserMusicianCode(u: AppUser): AppUser {
  if (u.musicianCode) return u;
  return {
    ...u,
    musicianCode: generateMusicianCodeFromSeed(u.id || u.username || u.email),
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSaveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Storage quota warning on key ${key}, compacting...`, err);
    runAutomaticStorageCleanup();
    if (key === STORAGE_KEYS.GROUPS && Array.isArray(value)) {
      try {
        const compacted = (value as WorshipGroup[]).map((g) => ({
          ...g,
          songs: (g.songs || []).map((s) => ({
            ...s,
            chordSheetImageUrl:
              s.chordSheetImageUrl &&
              (s.chordSheetImageUrl.startsWith('data:image/svg+xml;utf8,') ||
                (s.chordSheetImageUrl.startsWith('data:') &&
                  s.chordSheetImageUrl.length > 200000))
                ? undefined
                : s.chordSheetImageUrl,
          })),
        }));
        localStorage.setItem(key, JSON.stringify(compacted));
      } catch {
        // Fallback: keep metadata
      }
    }
  }
}

function recordDeletedId(storageKey: string, id: string): void {
  const existing = loadFromStorage<string[]>(storageKey, []);
  if (!existing.includes(id)) {
    // Conservar únicamente los últimos 100 IDs eliminados para no saturar localStorage
    const next = [...existing, id].slice(-100);
    safeSaveToStorage(storageKey, next);
  }
}

function appendGroupDeletedIds(
  existingDeletedIds: string[] | undefined,
  ...newIds: string[]
): string[] {
  const combined = Array.from(
    new Set([...(existingDeletedIds || []), ...newIds.filter(Boolean)])
  );
  return combined.slice(-200);
}

function isRecentlyCreatedLocally(id: string, maxAgeMs = 8000): boolean {
  const match = id.match(/-(\d{13})\b/);
  if (!match) return false;
  const createdMs = Number(match[1]);
  if (Number.isNaN(createdMs)) return false;
  return Date.now() - createdMs < maxAgeMs;
}

function extractMentionedUsernames(text: string): string[] {
  const matches = text.match(/@([\w._-]+)/g) || [];
  return Array.from(
    new Set(matches.map((m) => m.slice(1).toLowerCase()))
  );
}

export default function App() {
  const [users, setUsers] = useState<AppUser[]>(() =>
    loadFromStorage<AppUser[]>(STORAGE_KEYS.USERS, []).map(ensureUserMusicianCode)
  );
  const [currentUserId, setCurrentUserId] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_USER_ID, '')
  );
  const [groups, setGroups] = useState<WorshipGroup[]>(() =>
    loadFromStorage<WorshipGroup[]>(STORAGE_KEYS.GROUPS, []).map((g) => ({
      ...g,
      songs: (g.songs || []).map((s) => ({
        ...s,
        chordSheetImageUrl:
          s.chordSheetImageUrl &&
          s.chordSheetImageUrl.startsWith('data:image/svg+xml')
            ? undefined
            : s.chordSheetImageUrl,
      })),
    }))
  );
  const [activeGroupId, setActiveGroupId] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.ACTIVE_GROUP_ID, '')
  );
  const [fallbackIdentity, setFallbackIdentity] = useState<AppIdentity>(() =>
    loadFromStorage(STORAGE_KEYS.THEME_PREF, INITIAL_IDENTITY)
  );
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    loadFromStorage(STORAGE_KEYS.NOTIFICATIONS, [])
  );
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(() =>
    loadFromStorage(STORAGE_KEYS.FRIEND_REQUESTS, [])
  );
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(() =>
    loadFromStorage(STORAGE_KEYS.DIRECT_MESSAGES, [])
  );
  const [toastNotification, setToastNotification] =
    useState<AppNotification | null>(null);

  const [activeTab, setActiveTab] = useState<NavigationTab>('inicio');
  const [identityModalState, setIdentityModalState] = useState<{
    open: boolean;
    section: 'grupo' | 'temas' | 'invitaciones';
  }>({ open: false, section: 'grupo' });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] =
    useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const [profileModalState, setProfileModalState] = useState<{
    open: boolean;
    viewedUserId: string | null;
    tab: 'perfil' | 'amigos' | 'explorar';
  }>({ open: false, viewedUserId: null, tab: 'perfil' });
  const [initialDmUserId, setInitialDmUserId] = useState<string | null>(null);

  const [selectedSongNav, setSelectedSongNav] = useState<{
    songId: string | null;
    customKey: string | null;
    eventId?: string | null;
    autoStageMode?: boolean;
  }>({ songId: null, customKey: null, eventId: null, autoStageMode: false });
  const [returnToGroupScreen, setReturnToGroupScreen] = useState(false);
  const [metronomePreset, setMetronomePreset] = useState<{
    bpm: number | null;
    timeSignature: TimeSignature | null;
  }>({ bpm: null, timeSignature: null });

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'local_only'>(
    'connected'
  );

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  useEffect(() => {
    const unsub = subscribeToJesustoneCloud(
      {
        currentUserId: currentUserId || undefined,
        activeGroupId: activeGroupId || undefined,
        messageLimit: 120,
      },
      {
        onUsersSnapshot: (cloudUsers) => {
          setUsers((prevLocal) => {
            const normalizedCloud = cloudUsers.map(ensureUserMusicianCode);
            const cloudMap = new Map(normalizedCloud.map((u) => [u.id, u]));
            const merged = [...normalizedCloud];
            for (const localU of prevLocal) {
              const ensuredLocal = ensureUserMusicianCode(localU);
              if (!cloudMap.has(ensuredLocal.id)) {
                merged.push(ensuredLocal);
                syncUserToFirestore(ensuredLocal);
              }
            }
            return merged;
          });
        },
        onGroupsSnapshot: (cloudGroups) => {
          const deletedSongs = new Set<string>(
            loadFromStorage<string[]>(STORAGE_KEYS.DELETED_SONG_IDS, [])
          );
          const deletedEvents = new Set<string>(
            loadFromStorage<string[]>(STORAGE_KEYS.DELETED_EVENT_IDS, [])
          );
          const deletedMsgs = new Set<string>(
            loadFromStorage<string[]>(STORAGE_KEYS.DELETED_MSG_IDS, [])
          );

          setGroups((prevLocalGroups) => {
            const cloudGroupIds = new Set(cloudGroups.map((cg) => cg.id));
            const mergedGroups: WorshipGroup[] = cloudGroups.map((cloudGrp) => {
              const localGrp = prevLocalGroups.find((g) => g.id === cloudGrp.id);
              const combinedDeletedList = appendGroupDeletedIds(
                cloudGrp.deletedIds,
                ...(localGrp?.deletedIds || [])
              );
              const groupDeletedSet = new Set<string>([
                ...combinedDeletedList,
                ...deletedSongs,
                ...deletedEvents,
                ...deletedMsgs,
              ]);

              // Sincronizar IDs eliminados en la nube hacia el almacenamiento local de este dispositivo
              for (const delId of cloudGrp.deletedIds || []) {
                if (delId.startsWith('ev-') && !deletedEvents.has(delId)) {
                  deletedEvents.add(delId);
                  recordDeletedId(STORAGE_KEYS.DELETED_EVENT_IDS, delId);
                } else if (delId.startsWith('s-') && !deletedSongs.has(delId)) {
                  deletedSongs.add(delId);
                  recordDeletedId(STORAGE_KEYS.DELETED_SONG_IDS, delId);
                } else if (delId.startsWith('msg-') && !deletedMsgs.has(delId)) {
                  deletedMsgs.add(delId);
                  recordDeletedId(STORAGE_KEYS.DELETED_MSG_IDS, delId);
                }
              }

              if (!localGrp) {
                return enrichGroupIndexes({
                  ...cloudGrp,
                  songs: (cloudGrp.songs || []).filter(
                    (s) => !groupDeletedSet.has(s.id)
                  ),
                  events: (cloudGrp.events || []).filter(
                    (e) => !groupDeletedSet.has(e.id)
                  ),
                  devotionals: (cloudGrp.devotionals || []).filter(
                    (d) => !groupDeletedSet.has(d.id)
                  ),
                  alerts: (cloudGrp.alerts || []).filter(
                    (a) => !groupDeletedSet.has(a.id)
                  ),
                  availabilityRecords: (
                    cloudGrp.availabilityRecords || []
                  ).filter((r) => !groupDeletedSet.has(r.id)),
                  customChannels: (cloudGrp.customChannels || []).filter(
                    (ch) => !groupDeletedSet.has(ch.id)
                  ),
                  chatMessages: (cloudGrp.chatMessages || []).filter(
                    (m) =>
                      !groupDeletedSet.has(m.id) &&
                      !groupDeletedSet.has(m.channel)
                  ),
                  deletedIds: combinedDeletedList,
                });
              }

              const cloudSongMap = new Map(
                (cloudGrp.songs || [])
                  .filter((s) => !groupDeletedSet.has(s.id))
                  .map((s) => [s.id, s])
              );

              let needsResync = false;
              const mergedSongs: Song[] = [];
              const seenSongIds = new Set<string>();

              // 1. Conservar únicamente canciones recién creadas localmente (<8s) cuyo envío a la nube esté en vuelo
              for (const localSong of localGrp.songs || []) {
                if (groupDeletedSet.has(localSong.id)) continue;
                if (
                  !cloudSongMap.has(localSong.id) &&
                  isRecentlyCreatedLocally(localSong.id)
                ) {
                  mergedSongs.push(localSong);
                  seenSongIds.add(localSong.id);
                  needsResync = true;
                  syncSongToFirestore(cloudGrp.id, localSong);
                }
              }

              // 2. Añadir canciones de la nube (conservando adjuntos locales si el documento de grupo fue compactado)
              for (const cloudSong of cloudGrp.songs || []) {
                if (
                  groupDeletedSet.has(cloudSong.id) ||
                  seenSongIds.has(cloudSong.id)
                ) {
                  continue;
                }
                const localMatch = (localGrp.songs || []).find(
                  (ls) => ls.id === cloudSong.id
                );
                const rawImg =
                  cloudSong.chordSheetImageUrl ||
                  localMatch?.chordSheetImageUrl;
                mergedSongs.push({
                  ...cloudSong,
                  chordSheetImageUrl:
                    rawImg && rawImg.startsWith('data:image/svg+xml')
                      ? undefined
                      : rawImg,
                });
                seenSongIds.add(cloudSong.id);
              }

              if ((cloudGrp.songs || []).some((s) => groupDeletedSet.has(s.id))) {
                needsResync = true;
              }

              // 3. Eventos: la nube es autoritativa; solo conservar eventos locales creados hace <8s en vuelo
              const cloudEventMap = new Map(
                (cloudGrp.events || [])
                  .filter((e) => !groupDeletedSet.has(e.id))
                  .map((e) => [e.id, e])
              );
              const mergedEvents: WorshipEvent[] = [];
              const seenEventIds = new Set<string>();

              for (const localEv of localGrp.events || []) {
                if (groupDeletedSet.has(localEv.id)) continue;
                if (
                  !cloudEventMap.has(localEv.id) &&
                  isRecentlyCreatedLocally(localEv.id)
                ) {
                  mergedEvents.push(localEv);
                  seenEventIds.add(localEv.id);
                  needsResync = true;
                }
              }

              for (const cloudEv of cloudGrp.events || []) {
                if (
                  groupDeletedSet.has(cloudEv.id) ||
                  seenEventIds.has(cloudEv.id)
                ) {
                  continue;
                }
                mergedEvents.push({
                  ...cloudEv,
                  songs: (cloudEv.songs || []).filter(
                    (item) => !groupDeletedSet.has(item.songId)
                  ),
                });
                seenEventIds.add(cloudEv.id);
              }

              if ((cloudGrp.events || []).some((e) => groupDeletedSet.has(e.id))) {
                needsResync = true;
              }

              if (!cloudGrp.memberIds || cloudGrp.memberIds.length === 0) {
                needsResync = true;
              }

              const mergedCustomChannels = (
                cloudGrp.customChannels || []
              ).filter((ch) => !groupDeletedSet.has(ch.id));

              const validChannelIds = new Set<string>([
                'general',
                ...mergedCustomChannels.map((ch) => ch.id),
              ]);

              const mergedGroup: WorshipGroup = enrichGroupIndexes({
                ...cloudGrp,
                songs: mergedSongs,
                events: mergedEvents,
                devotionals: (cloudGrp.devotionals || []).filter(
                  (d) => !groupDeletedSet.has(d.id)
                ),
                alerts: (cloudGrp.alerts || []).filter(
                  (a) => !groupDeletedSet.has(a.id)
                ),
                availabilityRecords: (
                  cloudGrp.availabilityRecords || []
                ).filter((r) => !groupDeletedSet.has(r.id)),
                customChannels: mergedCustomChannels,
                chatMessages: (cloudGrp.chatMessages || []).filter(
                  (m) =>
                    !groupDeletedSet.has(m.id) &&
                    !groupDeletedSet.has(m.channel) &&
                    validChannelIds.has(m.channel)
                ),
                deletedIds: combinedDeletedList,
              });

              if (needsResync) {
                syncGroupToFirestore(mergedGroup);
              }

              return mergedGroup;
            });

            // Conservar grupos locales recién creados (<8s) que aún estén subiendo
            for (const localG of prevLocalGroups) {
              if (!cloudGroupIds.has(localG.id) && isRecentlyCreatedLocally(localG.id, 15000)) {
                const enrichedLocal = enrichGroupIndexes(localG);
                mergedGroups.push(enrichedLocal);
                if (
                  currentUserId &&
                  enrichedLocal.memberIds?.includes(currentUserId)
                ) {
                  syncGroupToFirestore(enrichedLocal);
                }
              }
            }

            return mergedGroups;
          });
        },
        onSongsSnapshot: (songsByGroup) => {
          const deletedSongs = new Set<string>(
            loadFromStorage<string[]>(STORAGE_KEYS.DELETED_SONG_IDS, [])
          );
          setGroups((prevGroups) =>
            prevGroups.map((grp) => {
              const groupDeletedSet = new Set<string>([
                ...deletedSongs,
                ...(grp.deletedIds || []),
              ]);
              const cloudGroupSongs = songsByGroup[grp.id];
              const extraSongs = (cloudGroupSongs || []).filter(
                (s) => !groupDeletedSet.has(s.id)
              );

              // Filtrar cualquier canción que haya sido marcada como eliminada
              const filteredExisting = grp.songs.filter(
                (s) => !groupDeletedSet.has(s.id)
              );
              let changed = filteredExisting.length !== grp.songs.length;
              const existingMap = new Map(
                filteredExisting.map((s) => [s.id, s])
              );
              const nextSongs = [...filteredExisting];

              for (const extSong of extraSongs) {
                const existing = existingMap.get(extSong.id);
                if (!existing) {
                  nextSongs.unshift(extSong);
                  changed = true;
                } else if (
                  !existing.chordSheetImageUrl &&
                  extSong.chordSheetImageUrl
                ) {
                  const idx = nextSongs.findIndex((x) => x.id === extSong.id);
                  if (idx !== -1) {
                    nextSongs[idx] = {
                      ...existing,
                      chordSheetImageUrl: extSong.chordSheetImageUrl,
                    };
                    changed = true;
                  }
                }
              }

              return changed ? { ...grp, songs: nextSongs } : grp;
            })
          );
        },
        onMessagesSnapshot: (groupId, cloudMessages) => {
          const deletedMsgs = new Set<string>(
            loadFromStorage<string[]>(STORAGE_KEYS.DELETED_MSG_IDS, [])
          );
          setGroups((prevGroups) =>
            prevGroups.map((grp) => {
              if (grp.id !== groupId) return grp;
              const groupDeletedSet = new Set<string>([
                ...deletedMsgs,
                ...(grp.deletedIds || []),
              ]);
              const validChannelIds = new Set<string>([
                'general',
                ...(grp.customChannels || []).map((c) => c.id),
              ]);
              const validCloud = cloudMessages.filter(
                (m) =>
                  !groupDeletedSet.has(m.id) &&
                  !groupDeletedSet.has(m.channel) &&
                  validChannelIds.has(m.channel)
              );

              const cloudMap = new Map(validCloud.map((m) => [m.id, m]));
              const combined: ChatMessage[] = [...validCloud];

              for (const localMsg of grp.chatMessages || []) {
                if (
                  groupDeletedSet.has(localMsg.id) ||
                  groupDeletedSet.has(localMsg.channel) ||
                  !validChannelIds.has(localMsg.channel)
                ) {
                  continue;
                }
                const isRecentLocal =
                  (localMsg.createdAtMs &&
                    Date.now() - localMsg.createdAtMs < 8000) ||
                  isRecentlyCreatedLocally(localMsg.id);
                if (!cloudMap.has(localMsg.id) && isRecentLocal) {
                  combined.push(localMsg);
                  syncChatMessageToFirestore(groupId, localMsg);
                }
              }

              combined.sort(
                (a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)
              );
              if (combined.length > MAX_CHAT_MESSAGES_PER_GROUP) {
                const overflow = combined.slice(
                  0,
                  combined.length - MAX_CHAT_MESSAGES_PER_GROUP
                );
                overflow.forEach((oldMsg) =>
                  deleteChatMessageFromFirestore(oldMsg.id)
                );
              }

              return {
                ...grp,
                chatMessages: combined.slice(-MAX_CHAT_MESSAGES_PER_GROUP),
              };
            })
          );
        },
        onNotificationsSnapshot: (cloudNotifs) => {
          setNotifications((prevLocal) => {
            const prevIds = new Set(prevLocal.map((n) => n.id));
            if (prevLocal.length > 0 && currentUserId) {
              const incomingNew = cloudNotifs.filter(
                (n) =>
                  !prevIds.has(n.id) &&
                  !n.readByUserIds.includes(currentUserId) &&
                  (n.recipientUserId === currentUserId ||
                    n.recipientUserId === 'all')
              );
              if (incomingNew.length > 0) {
                const latest = incomingNew[0];
                setToastNotification(latest);
                if (
                  typeof document !== 'undefined' &&
                  document.visibilityState === 'hidden'
                ) {
                  showNativeNotificationViaSW(latest);
                }
              }
            }
            return cloudNotifs.slice(0, MAX_NOTIFICATIONS);
          });
        },
        onFriendRequestsSnapshot: (cloudReqs) => {
          setFriendRequests((prevLocal) => {
            const cloudMap = new Map(cloudReqs.map((r) => [r.id, r]));
            const merged = [...cloudReqs];
            for (const localR of prevLocal) {
              if (!cloudMap.has(localR.id)) {
                merged.push(localR);
                syncFriendRequestToFirestore(localR);
              }
            }
            return merged.slice(0, 80);
          });
        },
        onDirectMessagesSnapshot: (cloudDms) => {
          setDirectMessages((prevLocal) => {
            const cloudMap = new Map(cloudDms.map((m) => [m.id, m]));
            const merged = [...cloudDms];
            for (const localDm of prevLocal) {
              if (!cloudMap.has(localDm.id)) {
                merged.push(localDm);
                syncDirectMessageToFirestore(localDm);
              }
            }
            merged.sort((a, b) => a.createdAtMs - b.createdAtMs);
            const byConv = new Map<string, DirectMessage[]>();
            merged.forEach((dm) => {
              const key =
                dm.conversationId ||
                [dm.senderId, dm.recipientId].sort().join('__');
              const list = byConv.get(key) || [];
              list.push(dm);
              byConv.set(key, list);
            });
            const trimmed: DirectMessage[] = [];
            byConv.forEach((list) => {
              trimmed.push(...list.slice(-MAX_DMS_PER_CONVERSATION));
            });
            return trimmed.sort((a, b) => a.createdAtMs - b.createdAtMs);
          });
        },
        onSyncStatusChange: (status) => setCloudStatus(status),
      }
    );
    return () => unsub();
  }, [currentUserId, activeGroupId]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.USERS, users);
  }, [users]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.CURRENT_USER_ID, currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.GROUPS, groups);
  }, [groups]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.ACTIVE_GROUP_ID, activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.NOTIFICATIONS, notifications);
  }, [notifications]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.FRIEND_REQUESTS, friendRequests);
  }, [friendRequests]);

  useEffect(() => {
    safeSaveToStorage(STORAGE_KEYS.DIRECT_MESSAGES, directMessages);
  }, [directMessages]);

  // Auto-hide toast notification after 4.5s
  useEffect(() => {
    if (!toastNotification) return;
    const timer = window.setTimeout(() => {
      setToastNotification(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toastNotification]);

  const rawCurrentUser = users.find((u) => u.id === currentUserId) || null;
  const currentUser = rawCurrentUser
    ? ensureUserMusicianCode(rawCurrentUser)
    : null;

  // All groups where currentUser is a member (max 6)
  const myGroups = currentUser
    ? groups.filter((g) => g.members.some((m) => m.id === currentUser.id))
    : [];

  const activeGroup =
    myGroups.find((g) => g.id === activeGroupId) || myGroups[0] || null;

  const identity = activeGroup ? activeGroup.identity : fallbackIdentity;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THEME_PREF, JSON.stringify(identity));
    if (identity.darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [identity]);

  // Registrar Service Worker de Push Nativas y escuchar clics en notificaciones del sistema
  const handledUrlParamsRef = useRef(false);
  useEffect(() => {
    runAutomaticStorageCleanup();
    ensurePushServiceWorker();

    if (!handledUrlParamsRef.current && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as NavigationTab | null;
      const groupIdParam = params.get('groupId');
      const targetIdParam = params.get('targetId');

      if (tabParam) {
        handledUrlParamsRef.current = true;
        if (groupIdParam) {
          setActiveGroupId(groupIdParam);
        }
        if (tabParam === 'cancionero' && targetIdParam) {
          setSelectedSongNav({ songId: targetIdParam, customKey: null });
        }
        setActiveTab(tabParam);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_NOTIFICATION_CLICK') {
        const payload = (event.data.payload || {}) as PushNavigationPayload;
        if (payload.groupId) {
          setActiveGroupId(payload.groupId);
        }
        if (payload.targetTab === 'cancionero' && payload.targetId) {
          setSelectedSongNav({ songId: payload.targetId, customKey: null });
        }
        if (payload.targetTab) {
          setActiveTab(payload.targetTab);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener(
        'message',
        handleServiceWorkerMessage
      );
    };
  }, []);

  // Sincronizar suscripción Push activa con los grupos del usuario actual
  useEffect(() => {
    if (!currentUser) return;
    const gIds = myGroups.map((g) => g.id);
    syncExistingPushSubscription({
      userId: currentUser.id,
      username: currentUser.username,
      groupIds: gIds,
    });
  }, [currentUser?.id, myGroups.length]);

  // Helper to create notifications and trigger in-app toast / Service Worker Push notification
  const dispatchNotifications = (
    items: Omit<AppNotification, 'id' | 'createdAt' | 'readByUserIds'>[]
  ) => {
    if (items.length === 0) return;
    const nowStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const createdList: AppNotification[] = items.map((item, idx) => ({
      ...item,
      id: `notif-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: nowStr,
      readByUserIds: [],
    }));

    setNotifications((prev) => {
      const combined = [...createdList, ...prev];
      if (combined.length > MAX_NOTIFICATIONS) {
        const overflow = combined.slice(MAX_NOTIFICATIONS);
        overflow.forEach((oldNotif) => {
          deleteNotificationFromFirestore(oldNotif.id);
        });
      }
      return combined.slice(0, MAX_NOTIFICATIONS);
    });
    createdList.forEach((n) => {
      syncNotificationToFirestore(n);
    });

    // Enviar Web Push real (RFC 8030) a los dispositivos suscritos de los destinatarios
    sendWebPushToRecipients(createdList, currentUser?.id);

    // Show toast for the most relevant notification for currentUser (or the first one created)
    const relevantForMe =
      createdList.find(
        (n) =>
          currentUser &&
          (n.recipientUserId === currentUser.id || n.recipientUserId === 'all')
      ) || createdList[0];

    if (relevantForMe) {
      setToastNotification(relevantForMe);
      showNativeNotificationViaSW(relevantForMe);
    }
  };

  // ============================================================================
  // HANDLERS DE AUTENTICACIÓN ESTÁNDAR + FIREBASE AUTH OFICIAL
  // ============================================================================
  const handleRegisterStandardUser = (data: {
    id?: string;
    name: string;
    username: string;
    email: string;
    password: string;
    instruments: InstrumentRole[];
    avatarUrl?: string;
  }): { ok: boolean; error?: string } => {
    const emailExists = users.some(
      (u) => u.email.toLowerCase() === data.email.toLowerCase()
    );
    if (emailExists) {
      return {
        ok: false,
        error: 'Ese correo electrónico ya está registrado. Inicia sesión.',
      };
    }

    const usernameExists = users.some(
      (u) => u.username.toLowerCase() === data.username.toLowerCase()
    );
    if (usernameExists) {
      return {
        ok: false,
        error: `El nombre de usuario @${data.username} ya está en uso. Elige otro.`,
      };
    }

    const parts = data.name.split(/\s+/);
    const initials =
      parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : data.name.slice(0, 2).toUpperCase();

    const userId = data.id || `u-${Date.now()}`;
    const randomCodeNum = Math.floor(1000 + Math.random() * 9000);
    const newUser: AppUser = {
      id: userId,
      name: data.name,
      username: data.username,
      musicianCode: `JST-${randomCodeNum}`,
      email: data.email,
      password: data.password,
      instruments: data.instruments,
      avatarInitials: initials,
      avatarUrl: data.avatarUrl,
      friendIds: [],
      createdAt: new Date().toISOString(),
    };

    setUsers((prev) => [...prev, newUser]);
    syncUserToFirestore(newUser);
    syncFirebaseEmailAuth(data.email, data.password, true);
    setCurrentUserId(newUser.id);
    return { ok: true };
  };

  const handleResetLocalPassword = (
    emailOrUsername: string,
    newPassword: string
  ): { ok: boolean; message: string } => {
    const clean = emailOrUsername.trim().toLowerCase().replace(/^@/, '');
    const targetUser = users.find(
      (u) =>
        u.email.toLowerCase() === clean || u.username.toLowerCase() === clean
    );
    if (!targetUser) {
      return {
        ok: false,
        message: 'No se encontró un usuario registrado con ese correo o @usuario.',
      };
    }
    const updatedUser: AppUser = {
      ...targetUser,
      password: newPassword,
    };
    setUsers((prev) =>
      prev.map((u) => (u.id === targetUser.id ? updatedUser : u))
    );
    syncUserToFirestore(updatedUser);
    return {
      ok: true,
      message: `¡Contraseña actualizada para @${targetUser.username}! Ya puedes ingresar.`,
    };
  };

  const handleUpdateUserAvatar = (avatarUrl: string | undefined) => {
    if (!currentUser) return;
    const updatedUser: AppUser = {
      ...currentUser,
      avatarUrl,
    };
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );
    syncUserToFirestore(updatedUser);

    // Actualizar también la foto del usuario en todos los grupos a los que pertenece
    setGroups((prev) =>
      prev.map((g) => {
        if (!g.members.some((m) => m.id === currentUser.id)) return g;
        const updatedGroup: WorshipGroup = {
          ...g,
          members: g.members.map((m) =>
            m.id === currentUser.id ? { ...m, avatarUrl } : m
          ),
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );
  };

  const handleUpdateUserInstruments = (instruments: InstrumentRole[]) => {
    if (!currentUser || instruments.length === 0) return;
    const updatedUser: AppUser = {
      ...currentUser,
      instruments,
    };
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );
    syncUserToFirestore(updatedUser);

    setGroups((prev) =>
      prev.map((g) => {
        if (!g.members.some((m) => m.id === currentUser.id)) return g;
        const updatedGroup: WorshipGroup = {
          ...g,
          members: g.members.map((m) =>
            m.id === currentUser.id ? { ...m, instruments } : m
          ),
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );
  };

  const handleLoginUser = (userId: string) => {
    const matched = users.find((u) => u.id === userId);
    if (matched) {
      syncFirebaseEmailAuth(matched.email, matched.password, false);
    }
    setCurrentUserId(userId);
    const userGroups = groups.filter((g) =>
      g.members.some((m) => m.id === userId)
    );
    if (userGroups.length > 0) {
      setActiveGroupId(userGroups[0].id);
    }
  };

  const handleLogout = () => {
    signOutFirebaseOfficial();
    setCurrentUserId('');
    setActiveGroupId('');
    setIsAuthModalOpen(false);
  };

  // ============================================================================
  // HANDLERS DE GRUPOS (CREAR GRUPO = SER LÍDER, UNIRSE = SER MIEMBRO, MÁX 6)
  // ============================================================================
  const handleCreateGroup = (data: {
    ministryName: string;
    iconId: BrandIconId;
    customImageUrl?: string;
    accentColor: AccentColorId;
  }): { ok: boolean; error?: string } => {
    if (!currentUser) {
      return { ok: false, error: 'Debes iniciar sesión primero.' };
    }
    if (myGroups.length >= MAX_GROUPS_PER_USER) {
      return {
        ok: false,
        error: `Has alcanzado el límite máximo de ${MAX_GROUPS_PER_USER} grupos por usuario.`,
      };
    }

    const codePrefix =
      data.ministryName
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4)
        .toUpperCase() || 'JSTN';
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const generatedCode = `${codePrefix}-${randomDigits}`;

    const leaderMember: BandMember = {
      id: currentUser.id,
      name: currentUser.name,
      username: currentUser.username,
      email: currentUser.email,
      role: 'leader',
      instruments: currentUser.instruments,
      phone: '',
      isLeader: true,
      avatarInitials: currentUser.avatarInitials,
      avatarUrl: currentUser.avatarUrl,
      joinedAt: 'Creador / Líder del Grupo',
    };

    const newGroup: WorshipGroup = enrichGroupIndexes({
      id: `grp-${Date.now()}`,
      leaderUserId: currentUser.id,
      identity: {
        ministryName: data.ministryName,
        inviteCode: generatedCode,
        iconId: data.iconId,
        customImageUrl: data.customImageUrl,
        accentColor: data.accentColor,
        darkMode: identity.darkMode,
      },
      members: [leaderMember],
      invitations: [],
      events: [],
      songs: [],
      devotionals: [],
      chatMessages: [],
      alerts: [],
      activityFeed: [
        {
          id: `feed-${Date.now()}`,
          type: 'member_joined',
          actorName: currentUser.name,
          actorRole: 'leader',
          title: `Grupo «${data.ministryName}» Creado`,
          description: `@${currentUser.username} creó este grupo y es su Líder / Admin. Código de invitación: ${generatedCode}.`,
          timestamp: 'Justo ahora',
          targetTab: 'inicio',
        },
      ],
    });

    setGroups((prev) => [newGroup, ...prev]);
    syncGroupToFirestore(newGroup);
    setActiveGroupId(newGroup.id);
    setActiveTab('inicio');
    return { ok: true };
  };

  const handleJoinGroupByCodeOrInvite = async (
    codeOrGroupId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) {
      return { ok: false, error: 'Debes iniciar sesión primero.' };
    }
    if (myGroups.length >= MAX_GROUPS_PER_USER) {
      return {
        ok: false,
        error: `Ya perteneces al límite máximo de ${MAX_GROUPS_PER_USER} grupos.`,
      };
    }

    const clean = codeOrGroupId.trim().toUpperCase();
    let targetGroup = groups.find(
      (g) =>
        g.id === codeOrGroupId || g.identity.inviteCode.toUpperCase() === clean
    );

    // Si el grupo pertenece a otra banda que aún no estaba descargada localmente,
    // lo consultamos directamente en Firestore por su código de invitación
    if (!targetGroup) {
      const cloudMatch = await findGroupByInviteCodeInCloud(codeOrGroupId);
      if (cloudMatch) {
        targetGroup = cloudMatch;
      }
    }

    if (!targetGroup) {
      return {
        ok: false,
        error: 'No se encontró ningún grupo con ese código de invitación.',
      };
    }

    const alreadyInGroup = targetGroup.members.some(
      (m) => m.id === currentUser.id
    );
    if (alreadyInGroup) {
      setActiveGroupId(targetGroup.id);
      return { ok: true };
    }

    const matchedInvite = targetGroup.invitations.find(
      (inv) =>
        inv.email.toLowerCase() === currentUser.email.toLowerCase() ||
        inv.username?.toLowerCase() === currentUser.username.toLowerCase() ||
        inv.identifier.toLowerCase().replace(/^@/, '') ===
          currentUser.username.toLowerCase()
    );

    const newMember: BandMember = {
      id: currentUser.id,
      name: currentUser.name,
      username: currentUser.username,
      email: currentUser.email,
      role: 'member',
      isGuest: matchedInvite?.isGuest || false,
      instruments: matchedInvite
        ? Array.from(
            new Set([
              matchedInvite.suggestedInstrument,
              ...currentUser.instruments,
            ])
          )
        : currentUser.instruments,
      phone: '',
      avatarInitials: currentUser.avatarInitials,
      avatarUrl: currentUser.avatarUrl,
      joinedAt: matchedInvite?.isGuest ? 'Músico Suplente / Invitado' : 'Miembro del Grupo',
    };

    const resolvedTarget = targetGroup;
    const updatedGroup: WorshipGroup = enrichGroupIndexes({
      ...resolvedTarget,
      members: [...resolvedTarget.members, newMember],
      invitations: resolvedTarget.invitations.map((inv) =>
        matchedInvite && inv.id === matchedInvite.id
          ? { ...inv, status: 'accepted' }
          : inv
      ),
      activityFeed: [
        {
          id: `feed-${Date.now()}`,
          type: 'member_joined' as const,
          actorName: currentUser.name,
          actorRole: 'member' as const,
          title: newMember.isGuest
            ? 'Músico Invitado en el Grupo'
            : 'Nuevo Miembro en el Grupo',
          description: `@${currentUser.username} se unió a «${resolvedTarget.identity.ministryName}».`,
          timestamp: 'Justo ahora',
          targetTab: 'inicio' as NavigationTab,
        },
        ...resolvedTarget.activityFeed,
      ].slice(0, 5),
    });

    setGroups((prev) => {
      const existsLocally = prev.some((g) => g.id === updatedGroup.id);
      if (existsLocally) {
        return prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
      }
      return [updatedGroup, ...prev];
    });
    syncGroupToFirestore(updatedGroup);

    setActiveGroupId(updatedGroup.id);
    setActiveTab('inicio');
    return { ok: true };
  };

  // ============================================================================
  // SI NO HA INICIADO SESIÓN O AÚN NO TIENE NINGÚN GRUPO ACTIVO
  // ============================================================================
  if (!currentUser || !activeGroup) {
    return (
      <div className={identity.darkMode ? 'dark' : ''}>
        <AuthOnboardingModal
          isOpen={true}
          canClose={false}
          onClose={() => {}}
          identity={identity}
          users={users}
          currentUser={currentUser}
          groups={groups}
          activeGroupId={activeGroupId}
          onLoginUser={handleLoginUser}
          onRegisterStandardUser={handleRegisterStandardUser}
          onResetLocalPassword={handleResetLocalPassword}
          onUpdateUserAvatar={handleUpdateUserAvatar}
          onUpdateUserInstruments={handleUpdateUserInstruments}
          onLogout={handleLogout}
          onCreateGroup={handleCreateGroup}
          onJoinGroupByCodeOrInvite={handleJoinGroupByCodeOrInvite}
          onSelectGroup={(gId) => setActiveGroupId(gId)}
        />
      </div>
    );
  }

  // ============================================================================
  // DENTRO DE UN GRUPO ACTIVO: DATOS, ROL, RED DE AMIGOS Y PASE DE SUPLENTE
  // ============================================================================
  const activeMember =
    activeGroup.members.find((m) => m.id === currentUser.id) ||
    activeGroup.members[0];
  const userRole =
    activeGroup.leaderUserId === currentUser.id ? 'leader' : activeMember.role;
  const accent = getAccentClasses(identity.accentColor);

  // Red de Amigos del usuario actual (combinando friendIds y solicitudes aceptadas)
  const myFriendIdSet = new Set<string>(currentUser.friendIds || []);
  friendRequests.forEach((req) => {
    if (req.status === 'accepted') {
      if (req.fromUserId === currentUser.id) myFriendIdSet.add(req.toUserId);
      if (req.toUserId === currentUser.id) myFriendIdSet.add(req.fromUserId);
    }
  });
  const myFriends: AppUser[] = users.filter(
    (u) => u.id !== currentUser.id && myFriendIdSet.has(u.id)
  );

  // Filtro de vista restringida para Músico Invitado / Suplente
  const isRestrictedGuest = Boolean(
    activeMember.isGuest && userRole !== 'leader'
  );
  const todayIsoStr = new Date().toISOString().split('T')[0];

  const visibleEvents: WorshipEvent[] = isRestrictedGuest
    ? activeGroup.events.filter(
        (ev) =>
          ev.date >= todayIsoStr &&
          (ev.assignments.some((a) => a.memberId === activeMember.id) ||
            (activeMember.guestEventIds || []).includes(ev.id))
      )
    : activeGroup.events;

  const visibleEventSongIds = isRestrictedGuest
    ? new Set(
        visibleEvents.flatMap((ev) => ev.songs.map((item) => item.songId))
      )
    : null;

  const visibleSongs: Song[] =
    isRestrictedGuest && visibleEventSongIds
      ? activeGroup.songs.filter((s) => visibleEventSongIds.has(s.id))
      : activeGroup.songs;

  // Filter notifications relevant to currentUser (across their groups or direct mentions/invites)
  const myGroupIds = myGroups.map((g) => g.id);
  const myNotifications = notifications.filter(
    (n) =>
      n.recipientUserId === currentUser.id ||
      (n.recipientUserId === 'all' &&
        myGroupIds.includes(n.groupId) &&
        !isRestrictedGuest)
  );
  const unreadNotificationsCount = myNotifications.filter(
    (n) => !n.readByUserIds.includes(currentUser.id)
  ).length;

  const handleSelectNotification = (notif: AppNotification) => {
    // Mark as read
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id === notif.id && !n.readByUserIds.includes(currentUser.id)) {
          const updated = {
            ...n,
            readByUserIds: [...n.readByUserIds, currentUser.id],
          };
          syncNotificationToFirestore(updated);
          return updated;
        }
        return n;
      })
    );
    // Switch to notification's group if needed
    if (notif.groupId && notif.groupId !== activeGroup.id) {
      const existsInMyGroups = myGroups.some((g) => g.id === notif.groupId);
      if (existsInMyGroups) {
        setActiveGroupId(notif.groupId);
      }
    }
    // Navigate to target tab / item
    if (notif.targetTab === 'cancionero' && notif.targetId) {
      setSelectedSongNav({ songId: notif.targetId, customKey: null });
    }
    setActiveTab(notif.targetTab);
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.readByUserIds.includes(currentUser.id)) return n;
        const updated = {
          ...n,
          readByUserIds: [...n.readByUserIds, currentUser.id],
        };
        syncNotificationToFirestore(updated);
        return updated;
      })
    );
  };

  const handleClearReadNotifications = () => {
    setNotifications((prev) => {
      prev.forEach((n) => {
        if (n.readByUserIds.includes(currentUser.id)) {
          deleteNotificationFromFirestore(n.id);
        }
      });
      return prev.filter((n) => !n.readByUserIds.includes(currentUser.id));
    });
  };

  const updateActiveGroup = (
    updater: (group: WorshipGroup) => WorshipGroup
  ) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== activeGroup.id) return g;
        const updated = updater(g);
        syncGroupToFirestore(updated);
        return updated;
      })
    );
  };

  const pushActivity = (item: Omit<ActivityFeedItem, 'id' | 'timestamp'>) => {
    updateActiveGroup((g) => ({
      ...g,
      activityFeed: [
        {
          ...item,
          id: `feed-${Date.now()}`,
          timestamp: 'Justo ahora',
        },
        ...g.activityFeed,
      ].slice(0, 5),
    }));
  };

  const handleSaveIdentity = (updatedIdentity: AppIdentity) => {
    setFallbackIdentity(updatedIdentity);
    updateActiveGroup((g) => ({
      ...g,
      identity: updatedIdentity,
    }));
  };

  const handleSendInvitationByUsernameOrEmail = (invite: {
    identifier: string;
    invitedName: string;
    suggestedInstrument: InstrumentRole;
    isGuest?: boolean;
  }): { ok: boolean; message: string } => {
    const cleanId = invite.identifier.trim().toLowerCase().replace(/^@/, '');
    const targetUser = users.find(
      (u) =>
        u.username.toLowerCase() === cleanId ||
        u.email.toLowerCase() === cleanId ||
        (u.musicianCode || '').toLowerCase() === cleanId
    );

    if (
      targetUser &&
      activeGroup.members.some((m) => m.id === targetUser.id)
    ) {
      return {
        ok: false,
        message: `@${targetUser.username} ya forma parte de este grupo.`,
      };
    }

    const createdInvite: GmailInvitation = {
      id: `inv-${Date.now()}`,
      groupId: activeGroup.id,
      groupName: activeGroup.identity.ministryName,
      identifier: invite.identifier.trim(),
      email: targetUser ? targetUser.email : invite.identifier.trim(),
      username: targetUser
        ? targetUser.username
        : !invite.identifier.includes('@') ||
          invite.identifier.trim().startsWith('@')
        ? cleanId
        : undefined,
      invitedName: targetUser ? targetUser.name : invite.invitedName,
      suggestedInstrument: invite.suggestedInstrument,
      inviteCode: activeGroup.identity.inviteCode,
      status: 'sent',
      sentByLeaderName: activeMember.name,
      sentAt: 'Justo ahora',
      isGuest: Boolean(invite.isGuest),
    };

    const targetUserGroupCount = targetUser
      ? groups.filter((g) => g.members.some((m) => m.id === targetUser.id))
          .length
      : 0;

    if (targetUser && targetUserGroupCount < MAX_GROUPS_PER_USER) {
      const addedMember: BandMember = {
        id: targetUser.id,
        name: targetUser.name,
        username: targetUser.username,
        email: targetUser.email,
        role: 'member',
        isGuest: Boolean(invite.isGuest),
        guestEventIds: [],
        instruments: Array.from(
          new Set([invite.suggestedInstrument, ...targetUser.instruments])
        ),
        phone: '',
        avatarInitials: targetUser.avatarInitials,
        avatarUrl: targetUser.avatarUrl,
        joinedAt: invite.isGuest
          ? `Suplente invitado por @${currentUser.username}`
          : `Invitado por @${currentUser.username}`,
      };

      updateActiveGroup((g) => ({
        ...g,
        members: [...g.members, addedMember],
        invitations: [{ ...createdInvite, status: 'accepted' }, ...g.invitations],
        activityFeed: [
          {
            id: `feed-${Date.now()}`,
            type: 'member_joined' as const,
            actorName: targetUser.name,
            actorRole: 'member' as const,
            title: invite.isGuest
              ? `Músico Suplente Agregado: @${targetUser.username}`
              : `Nuevo Miembro Invitado: @${targetUser.username}`,
            description: `${activeMember.name} agregó a ${targetUser.name} (@${targetUser.username}) en ${invite.suggestedInstrument}${
              invite.isGuest ? ' (Pase de Invitado / Suplente)' : ''
            }.`,
            timestamp: 'Justo ahora',
            targetTab: 'inicio' as NavigationTab,
          },
          ...g.activityFeed,
        ].slice(0, 5),
      }));

      dispatchNotifications([
        {
          recipientUserId: targetUser.id,
          groupId: activeGroup.id,
          groupName: activeGroup.identity.ministryName,
          category: invite.isGuest ? 'guest_event_invite' : 'group_invite',
          title: invite.isGuest
            ? `Pase de Suplente en «${activeGroup.identity.ministryName}»`
            : `Te agregaron al grupo «${activeGroup.identity.ministryName}»`,
          message: invite.isGuest
            ? `@${currentUser.username} te registró como músico suplente/invitado (${invite.suggestedInstrument}). Solo verás los eventos donde seas convocado.`
            : `@${currentUser.username} te unió al grupo con el rol sugerido de ${invite.suggestedInstrument}.`,
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          targetTab: 'inicio',
        },
      ]);

      return {
        ok: true,
        message: invite.isGuest
          ? `¡@${targetUser.username} fue agregado como Músico Suplente / Invitado!`
          : `¡@${targetUser.username} (${targetUser.name}) fue invitado y unido al grupo!`,
      };
    }

    updateActiveGroup((g) => ({
      ...g,
      invitations: [createdInvite, ...g.invitations],
    }));

    return {
      ok: true,
      message: `Invitación enviada a ${invite.identifier}. Cuando inicie sesión con ese usuario o correo verá la invitación para unirse.`,
    };
  };

  // ============================================================================
  // HANDLERS DE PERFIL SOCIAL, RED DE AMIGOS, MENSAJES DIRECTOS (DM) Y SUPLENTES
  // ============================================================================
  const handleOpenMusicianProfile = (
    userId?: string,
    tab: 'perfil' | 'amigos' | 'explorar' = 'perfil'
  ) => {
    setProfileModalState({
      open: true,
      viewedUserId: userId || currentUser.id,
      tab,
    });
  };

  const handleUpdateMySocialProfile = (updates: {
    bio?: string;
    cityOrChurch?: string;
    availableForSub?: boolean;
    instruments?: InstrumentRole[];
    avatarUrl?: string;
  }) => {
    const updatedUser: AppUser = {
      ...currentUser,
      bio: updates.bio !== undefined ? updates.bio : currentUser.bio,
      cityOrChurch:
        updates.cityOrChurch !== undefined
          ? updates.cityOrChurch
          : currentUser.cityOrChurch,
      availableForSub:
        updates.availableForSub !== undefined
          ? updates.availableForSub
          : currentUser.availableForSub,
      instruments:
        updates.instruments && updates.instruments.length > 0
          ? updates.instruments
          : currentUser.instruments,
      avatarUrl:
        updates.avatarUrl !== undefined
          ? updates.avatarUrl
          : currentUser.avatarUrl,
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );
    syncUserToFirestore(updatedUser);

    if (updates.instruments || updates.avatarUrl !== undefined) {
      setGroups((prev) =>
        prev.map((g) => {
          if (!g.members.some((m) => m.id === currentUser.id)) return g;
          const updatedGroup: WorshipGroup = {
            ...g,
            members: g.members.map((m) =>
              m.id === currentUser.id
                ? {
                    ...m,
                    instruments: updatedUser.instruments,
                    avatarUrl: updatedUser.avatarUrl,
                  }
                : m
            ),
          };
          syncGroupToFirestore(updatedGroup);
          return updatedGroup;
        })
      );
    }
  };

  const handleOpenDirectMessageWithUser = (targetUser: AppUser) => {
    setInitialDmUserId(targetUser.id);
    setActiveTab('chat');
  };

  const handleSendFriendRequest = (
    targetIdentifierOrUser: string | AppUser
  ): { ok: boolean; message: string } => {
    let targetUser: AppUser | undefined;
    if (typeof targetIdentifierOrUser === 'string') {
      const clean = targetIdentifierOrUser
        .trim()
        .toLowerCase()
        .replace(/^@/, '');
      targetUser = users.find(
        (u) =>
          u.id === targetIdentifierOrUser ||
          u.username.toLowerCase() === clean ||
          u.email.toLowerCase() === clean ||
          (u.musicianCode || '').toLowerCase() === clean
      );
    } else {
      targetUser = targetIdentifierOrUser;
    }

    if (!targetUser) {
      return {
        ok: false,
        message:
          'No se encontró ningún músico con ese @usuario, ID (JST-XXXX) o correo.',
      };
    }
    if (targetUser.id === currentUser.id) {
      return {
        ok: false,
        message: 'No puedes enviarte una solicitud de amistad a ti mismo.',
      };
    }
    if (myFriendIdSet.has(targetUser.id)) {
      return {
        ok: false,
        message: `@${targetUser.username} ya está en tu Red de Amigos.`,
      };
    }

    const existingPending = friendRequests.find(
      (r) =>
        r.status === 'pending' &&
        ((r.fromUserId === currentUser.id && r.toUserId === targetUser.id) ||
          (r.fromUserId === targetUser.id && r.toUserId === currentUser.id))
    );
    if (existingPending) {
      return {
        ok: false,
        message: `Ya existe una solicitud pendiente con @${targetUser.username}.`,
      };
    }

    const newReq: FriendRequest = {
      id: `freq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromUserId: currentUser.id,
      fromName: currentUser.name,
      fromUsername: currentUser.username,
      fromMusicianCode: currentUser.musicianCode,
      fromInstruments: currentUser.instruments,
      fromAvatarInitials: currentUser.avatarInitials,
      fromAvatarUrl: currentUser.avatarUrl,
      toUserId: targetUser.id,
      toName: targetUser.name,
      toUsername: targetUser.username,
      status: 'pending',
      createdAt: 'Justo ahora',
    };

    setFriendRequests((prev) => [newReq, ...prev]);
    syncFriendRequestToFirestore(newReq);

    dispatchNotifications([
      {
        recipientUserId: targetUser.id,
        groupId: activeGroup.id,
        groupName: 'Red de Músicos',
        category: 'friend_request',
        title: `Solicitud de amistad de @${currentUser.username}`,
        message: `${currentUser.name} (${
          currentUser.instruments[0] || 'Músico'
        }) quiere conectar contigo en la Red de Amigos de jesustone.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'chat',
      },
    ]);

    return {
      ok: true,
      message: `¡Solicitud enviada a @${targetUser.username}!`,
    };
  };

  const handleRespondFriendRequest = (requestId: string, accept: boolean) => {
    const targetReq = friendRequests.find((r) => r.id === requestId);
    if (!targetReq) return;

    const updatedReq: FriendRequest = {
      ...targetReq,
      status: accept ? 'accepted' : 'declined',
    };

    setFriendRequests((prev) =>
      prev.map((r) => (r.id === requestId ? updatedReq : r))
    );
    syncFriendRequestToFirestore(updatedReq);

    if (accept) {
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === targetReq.fromUserId) {
            const updatedFrom: AppUser = {
              ...u,
              friendIds: Array.from(
                new Set([...(u.friendIds || []), targetReq.toUserId])
              ),
            };
            syncUserToFirestore(updatedFrom);
            return updatedFrom;
          }
          if (u.id === targetReq.toUserId) {
            const updatedTo: AppUser = {
              ...u,
              friendIds: Array.from(
                new Set([...(u.friendIds || []), targetReq.fromUserId])
              ),
            };
            syncUserToFirestore(updatedTo);
            return updatedTo;
          }
          return u;
        })
      );

      dispatchNotifications([
        {
          recipientUserId: targetReq.fromUserId,
          groupId: activeGroup.id,
          groupName: 'Red de Músicos',
          category: 'friend_accepted',
          title: `¡@${currentUser.username} aceptó tu solicitud!`,
          message: `Ahora tú y ${currentUser.name} son amigos en jesustone y pueden enviarse mensajes directos o convocarse como suplentes.`,
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          targetTab: 'chat',
        },
      ]);
    }
  };

  const handleSendDirectMessage = (
    recipientOrUserId: string | AppUser,
    text: string,
    voiceClipUrl?: string,
    voiceClipDurationSec?: number,
    sharedSongSnapshot?: Song
  ) => {
    const recipientUserId =
      typeof recipientOrUserId === 'string'
        ? recipientOrUserId
        : recipientOrUserId.id;
    const recipient =
      typeof recipientOrUserId === 'string'
        ? users.find((u) => u.id === recipientUserId)
        : recipientOrUserId;

    const nowStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const conversationId = [currentUser.id, recipientUserId].sort().join('__');

    const newDm: DirectMessage = {
      id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId,
      participants: [currentUser.id, recipientUserId],
      participantIds: [currentUser.id, recipientUserId],
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderUsername: currentUser.username,
      recipientId: recipientUserId,
      text,
      timestamp: nowStr,
      createdAtMs: Date.now(),
      sharedSongSnapshot,
      voiceClipUrl,
      voiceClipDurationSec,
    };

    setDirectMessages((prev) => {
      const updatedAll = [...prev, newDm];
      const inSameConv = updatedAll.filter(
        (m) => m.conversationId === conversationId
      );
      if (inSameConv.length > MAX_DMS_PER_CONVERSATION) {
        const overflow = inSameConv.slice(
          0,
          inSameConv.length - MAX_DMS_PER_CONVERSATION
        );
        const overflowIds = new Set(overflow.map((o) => o.id));
        overflow.forEach((oldDm) => {
          deleteDirectMessageFromFirestore(oldDm.id);
        });
        return updatedAll.filter((m) => !overflowIds.has(m.id));
      }
      return updatedAll;
    });
    syncDirectMessageToFirestore(newDm);

    if (recipient) {
      dispatchNotifications([
        {
          recipientUserId: recipient.id,
          groupId: activeGroup.id,
          groupName: 'Mensaje Directo',
          category: 'direct_message',
          title: `Mensaje de @${currentUser.username}`,
          message: sharedSongSnapshot
            ? `🎵 Te compartió la canción «${sharedSongSnapshot.title}»`
            : text || '🎤 Nota de voz',
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          targetTab: 'chat',
        },
      ]);
    }
  };

  const handleImportSharedSongToRepertoire = (sharedSong: Song) => {
    const copiedSong: Song = {
      ...sharedSong,
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    syncSongToFirestore(activeGroup.id, copiedSong);
    updateActiveGroup((g) => ({
      ...g,
      songs: [copiedSong, ...g.songs],
    }));

    dispatchNotifications([
      {
        recipientUserId: currentUser.id,
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: 'new_song',
        title: `Canción guardada: «${copiedSong.title}»`,
        message: `Se copió «${copiedSong.title}» (${copiedSong.originalKey} · ${copiedSong.bpm} BPM) al repertorio de ${activeGroup.identity.ministryName}.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'cancionero',
        targetId: copiedSong.id,
      },
    ]);
  };

  const handleAddFriendToGroup = (
    friendUser: AppUser,
    asGuest: boolean,
    suggestedRole?: InstrumentRole
  ): { ok: boolean; message: string } => {
    const primaryRole =
      suggestedRole || friendUser.instruments[0] || 'Guitarra eléctrica';
    const existingMember = activeGroup.members.find(
      (m) => m.id === friendUser.id
    );

    if (existingMember) {
      updateActiveGroup((g) => ({
        ...g,
        members: g.members.map((m) =>
          m.id === friendUser.id
            ? {
                ...m,
                isGuest: asGuest,
                joinedAt: asGuest
                  ? `Suplente invitado por @${currentUser.username}`
                  : 'Miembro Titular',
              }
            : m
        ),
      }));
      return {
        ok: true,
        message: `Se actualizó a @${friendUser.username} como ${
          asGuest ? 'Suplente / Invitado' : 'Miembro Titular'
        }.`,
      };
    }

    const newMember: BandMember = {
      id: friendUser.id,
      name: friendUser.name,
      username: friendUser.username,
      email: friendUser.email,
      role: 'member',
      isGuest: asGuest,
      guestEventIds: [],
      instruments: Array.from(
        new Set([primaryRole, ...friendUser.instruments])
      ),
      phone: '',
      avatarInitials: friendUser.avatarInitials,
      avatarUrl: friendUser.avatarUrl,
      joinedAt: asGuest
        ? `Suplente invitado por @${currentUser.username}`
        : `Agregado por @${currentUser.username}`,
    };

    updateActiveGroup((g) => ({
      ...g,
      members: [...g.members, newMember],
    }));

    dispatchNotifications([
      {
        recipientUserId: friendUser.id,
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: asGuest ? 'guest_event_invite' : 'group_invite',
        title: asGuest
          ? `Pase de Suplente en «${activeGroup.identity.ministryName}»`
          : `Te agregaron a «${activeGroup.identity.ministryName}»`,
        message: asGuest
          ? `@${currentUser.username} te habilitó como Músico Suplente (${primaryRole}). Solo verás los eventos y canciones donde participes.`
          : `@${currentUser.username} te agregó como miembro titular en ${primaryRole}.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'inicio',
      },
    ]);

    return {
      ok: true,
      message: asGuest
        ? `¡@${friendUser.username} agregado como Suplente / Invitado!`
        : `¡@${friendUser.username} agregado como Miembro Titular!`,
    };
  };

  const handleToggleMemberGuestStatus = (memberId: string) => {
    if (memberId === activeGroup.leaderUserId) return;
    updateActiveGroup((g) => ({
      ...g,
      members: g.members.map((m) => {
        if (m.id !== memberId) return m;
        const nextGuest = !m.isGuest;
        return {
          ...m,
          isGuest: nextGuest,
          role: nextGuest ? 'member' : m.role,
          isLeader: nextGuest ? false : m.isLeader,
          joinedAt: nextGuest
            ? 'Músico Suplente / Invitado'
            : 'Miembro Titular',
        };
      }),
    }));
  };

  const handleConvokeFriendAsGuest = (
    friendUser: AppUser,
    role: InstrumentRole = 'Voz Principal'
  ): BandMember => {
    const existing = activeGroup.members.find((m) => m.id === friendUser.id);
    if (existing) {
      return existing;
    }

    const guestMember: BandMember = {
      id: friendUser.id,
      name: friendUser.name,
      username: friendUser.username,
      email: friendUser.email,
      role: 'member',
      isGuest: true,
      guestEventIds: [],
      instruments: Array.from(new Set([role, ...friendUser.instruments])),
      phone: '',
      avatarInitials: friendUser.avatarInitials,
      avatarUrl: friendUser.avatarUrl,
      joinedAt: `Suplente convocado por @${currentUser.username}`,
    };

    updateActiveGroup((g) => ({
      ...g,
      members: [...g.members, guestMember],
    }));

    return guestMember;
  };

  const handleConvokeFriendToEvent = (
    friendUser: AppUser,
    eventId?: string,
    role?: InstrumentRole
  ): { ok: boolean; message: string } => {
    const resolvedRole =
      role || friendUser.instruments[0] || 'Guitarra eléctrica';
    if (!eventId) {
      return handleAddFriendToGroup(friendUser, true, resolvedRole);
    }

    const targetEv = activeGroup.events.find((e) => e.id === eventId);
    if (!targetEv) {
      return { ok: false, message: 'No se encontró el evento seleccionado.' };
    }

    const newAssignment: ServiceAssignment = {
      id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: resolvedRole,
      memberId: friendUser.id,
      memberName: friendUser.name,
      rsvpStatus: 'pending',
      isGuest: true,
      isGuestAssignment: true,
    };

    updateActiveGroup((g) => {
      const existsInMembers = g.members.some((m) => m.id === friendUser.id);
      const nextMembers: BandMember[] = existsInMembers
        ? g.members.map((m) =>
            m.id === friendUser.id
              ? {
                  ...m,
                  guestEventIds: Array.from(
                    new Set([...(m.guestEventIds || []), eventId])
                  ),
                }
              : m
          )
        : [
            ...g.members,
            {
              id: friendUser.id,
              name: friendUser.name,
              username: friendUser.username,
              email: friendUser.email,
              role: 'member',
              isGuest: true,
              guestEventIds: [eventId],
              instruments: Array.from(
                new Set([resolvedRole, ...friendUser.instruments])
              ),
              phone: '',
              avatarInitials: friendUser.avatarInitials,
              avatarUrl: friendUser.avatarUrl,
              joinedAt: `Suplente en «${targetEv.title}»`,
            },
          ];

      const nextEvents = g.events.map((ev) => {
        if (ev.id !== eventId) return ev;
        const alreadyAssigned = ev.assignments.some(
          (a) => a.memberId === friendUser.id && a.role === resolvedRole
        );
        if (alreadyAssigned) return ev;
        return {
          ...ev,
          assignments: [...ev.assignments, newAssignment],
        };
      });

      return {
        ...g,
        members: nextMembers,
        events: nextEvents,
      };
    });

    dispatchNotifications([
      {
        recipientUserId: friendUser.id,
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: 'guest_event_invite',
        title: `Convocatoria de Suplente: «${targetEv.title}»`,
        message: `@${currentUser.username} te invitó a cubrir ${resolvedRole} en «${targetEv.title}» (${targetEv.date} · Citación ${targetEv.callTime}). Solo tendrás acceso a este evento y su repertorio.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'eventos',
        targetId: targetEv.id,
      },
    ]);

    return {
      ok: true,
      message: `¡@${friendUser.username} fue convocado a «${targetEv.title}» en ${resolvedRole}!`,
    };
  };

  // Event & Playlist Handlers + Notifications
  const handleUpdateRSVP = (
    eventId: string,
    role: InstrumentRole,
    status: RSVPStatus,
    assignmentIndex?: number,
    assignmentId?: string
  ) => {
    const targetEv = activeGroup.events.find((e) => e.id === eventId);
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.map((ev) => {
        if (ev.id !== eventId) return ev;
        return {
          ...ev,
          assignments: ev.assignments.map((a, idx) => {
            if (assignmentId && a.id === assignmentId) {
              return { ...a, rsvpStatus: status };
            }
            if (assignmentIndex !== undefined) {
              return idx === assignmentIndex ? { ...a, rsvpStatus: status } : a;
            }
            if (a.memberId === activeMember.id) {
              return { ...a, rsvpStatus: status };
            }
            return a;
          }),
        };
      }),
    }));

    if (status === 'confirmed' && targetEv) {
      pushActivity({
        type: 'rsvp_confirmed',
        actorName: activeMember.name,
        actorRole: userRole,
        title: `Asistencia Confirmada (${role})`,
        description: `Confirmó su participación para «${targetEv.title}» (${targetEv.date}).`,
        targetTab: 'eventos',
        targetId: eventId,
      });
    }
  };

  const handleReassignRole = (
    eventId: string,
    role: InstrumentRole,
    memberId: string,
    assignmentIndex?: number
  ) => {
    const memberObj = activeGroup.members.find((m) => m.id === memberId);
    const targetEv = activeGroup.events.find((e) => e.id === eventId);
    if (!memberObj) return;
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.map((ev) => {
        if (ev.id !== eventId) return ev;
        return {
          ...ev,
          assignments: ev.assignments.map((a, idx) => {
            const isMatch =
              assignmentIndex !== undefined
                ? idx === assignmentIndex
                : a.role === role;
            return isMatch
              ? {
                  ...a,
                  memberId: memberObj.id,
                  memberName: memberObj.name,
                  rsvpStatus: 'pending',
                }
              : a;
          }),
        };
      }),
    }));

    if (targetEv) {
      dispatchNotifications([
        {
          recipientUserId: memberObj.id,
          groupId: activeGroup.id,
          groupName: activeGroup.identity.ministryName,
          category: 'role_assigned',
          title: `Te asignaron en ${role}`,
          message: `@${currentUser.username} te etiquetó en el rol de ${role} para el evento «${targetEv.title}» (${targetEv.date}).`,
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          targetTab: 'eventos',
          targetId: targetEv.id,
        },
      ]);
    }
  };

  const handleUpdateEventAssignments = (
    eventId: string,
    updatedAssignments: ServiceAssignment[]
  ) => {
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.map((ev) =>
        ev.id === eventId ? { ...ev, assignments: updatedAssignments } : ev
      ),
    }));
  };

  const handleUpdateEventPlaylist = (
    eventId: string,
    updatedSongs: EventSongItem[]
  ) => {
    const targetEv = activeGroup.events.find((e) => e.id === eventId);
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.map((ev) =>
        ev.id === eventId ? { ...ev, songs: updatedSongs } : ev
      ),
    }));
    if (targetEv) {
      pushActivity({
        type: 'playlist_updated',
        actorName: activeMember.name,
        actorRole: userRole,
        title: `Playlist actualizada: ${targetEv.title}`,
        description: `El Líder actualizó la lista con ${updatedSongs.length} canciones del Repertorio Base.`,
        targetTab: 'eventos',
        targetId: eventId,
      });

      dispatchNotifications([
        {
          recipientUserId: 'all',
          groupId: activeGroup.id,
          groupName: activeGroup.identity.ministryName,
          category: 'new_song',
          title: `Playlist actualizada en «${targetEv.title}»`,
          message: `@${currentUser.username} actualizó la lista de canciones del evento (${updatedSongs.length} temas).`,
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          targetTab: 'eventos',
          targetId: eventId,
        },
      ]);
    }
  };

  const handleUpdateEventNotes = (
    eventId: string,
    updatedGroupNotes: string,
    updatedPersonalNotes?: Record<string, string>
  ) => {
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.map((ev) =>
        ev.id === eventId
          ? {
              ...ev,
              notes: updatedGroupNotes,
              personalNotes: updatedPersonalNotes ?? ev.personalNotes ?? {},
            }
          : ev
      ),
    }));
  };

  const handleCreateEvent = (newEv: Omit<WorshipEvent, 'id'>) => {
    const created: WorshipEvent = {
      ...newEv,
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    updateActiveGroup((g) => ({
      ...g,
      events: [created, ...g.events],
    }));
    pushActivity({
      type: 'event_scheduled',
      actorName: activeMember.name,
      actorRole: userRole,
      title: `Nuevo Evento Programado: ${created.title}`,
      description: `Fecha: ${created.date} a las ${created.time} hrs con ${created.songs.length} canciones en su playlist.`,
      targetTab: 'eventos',
      targetId: created.id,
    });

    // Notificar a todo el grupo del nuevo evento + notificar individualmente a cada miembro etiquetado/asignado en un rol
    const roleNotifications: Omit<
      AppNotification,
      'id' | 'createdAt' | 'readByUserIds'
    >[] = created.assignments.map((assign) => ({
      recipientUserId: assign.memberId,
      groupId: activeGroup.id,
      groupName: activeGroup.identity.ministryName,
      category: 'role_assigned',
      title: `Fuiste asignado en ${assign.role}`,
      message: `Se programó «${created.title}» (${created.date} · Citación ${created.callTime}) y estás asignado en ${assign.role}. Confirma tu asistencia.`,
      actorName: currentUser.name,
      actorUsername: currentUser.username,
      targetTab: 'eventos',
      targetId: created.id,
    }));

    dispatchNotifications([
      {
        recipientUserId: 'all',
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: 'new_event',
        title: `Nuevo Evento: «${created.title}»`,
        message: `@${currentUser.username} programó «${created.title}» para el ${created.date} a las ${created.time} hrs en ${created.location}.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'eventos',
        targetId: created.id,
      },
      ...roleNotifications,
    ]);
  };

  const handleUpdateEvent = (updatedEvent: WorshipEvent) => {
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)),
    }));
  };

  const handleDeleteEvent = (eventId: string) => {
    recordDeletedId(STORAGE_KEYS.DELETED_EVENT_IDS, eventId);
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.filter((e) => e.id !== eventId),
      members: g.members.map((m) =>
        m.guestEventIds?.includes(eventId)
          ? {
              ...m,
              guestEventIds: m.guestEventIds.filter((id) => id !== eventId),
            }
          : m
      ),
      activityFeed: (g.activityFeed || []).filter(
        (f) => f.targetId !== eventId
      ),
      deletedIds: appendGroupDeletedIds(g.deletedIds, eventId),
    }));
    // Purgar notificaciones asociadas al evento eliminado para todos los participantes
    setNotifications((prev) => {
      prev.forEach((n) => {
        if (n.targetId === eventId) {
          deleteNotificationFromFirestore(n.id);
        }
      });
      return prev.filter((n) => n.targetId !== eventId);
    });
  };

  const handleAddAlert = (newAlert: Omit<NoticeAlert, 'id' | 'createdAt'>) => {
    updateActiveGroup((g) => ({
      ...g,
      alerts: [
        {
          ...newAlert,
          id: `al-${Date.now()}`,
          createdAt: 'Justo ahora',
        },
        ...g.alerts,
      ],
    }));

    dispatchNotifications([
      {
        recipientUserId: 'all',
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: 'new_event',
        title: `Aviso del Grupo: ${newAlert.title}`,
        message: newAlert.message,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'eventos',
      },
    ]);
  };

  const handleDismissAlert = (alertId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      alerts: g.alerts.filter((a) => a.id !== alertId),
      deletedIds: appendGroupDeletedIds(g.deletedIds, alertId),
    }));
  };

  // Member Availability / Date Blocking Handlers
  const handleSaveAvailability = (record: {
    date: string;
    status: 'unavailable' | 'available';
    reason: string;
  }) => {
    const newRec: MemberAvailabilityRecord = {
      id: `av-${Date.now()}`,
      memberId: activeMember.id,
      memberName: activeMember.name,
      memberUsername: currentUser.username,
      date: record.date,
      status: record.status,
      reason: record.reason,
      updatedAt: 'Justo ahora',
    };

    updateActiveGroup((g) => {
      const existing = g.availabilityRecords || [];
      const filtered = existing.filter(
        (r) => !(r.memberId === activeMember.id && r.date === record.date)
      );
      return {
        ...g,
        availabilityRecords: [newRec, ...filtered],
      };
    });
  };

  const handleRemoveAvailability = (recordId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      availabilityRecords: (g.availabilityRecords || []).filter(
        (r) => r.id !== recordId
      ),
      deletedIds: appendGroupDeletedIds(g.deletedIds, recordId),
    }));
  };

  // Songbook Handlers + Notifications
  const handleAddSong = (newSong: Omit<Song, 'id'>) => {
    const created: Song = {
      ...newSong,
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    const activityItem: ActivityFeedItem = {
      id: `feed-${Date.now()}`,
      type: 'song_added',
      actorName: activeMember.name,
      actorRole: userRole,
      title: `Nueva canción en Repertorio: «${created.title}»`,
      description: `Subida por ${activeMember.name} (${
        userRole === 'leader' ? 'Líder' : 'Miembro'
      }) en Tono ${created.originalKey} · ${created.bpm} BPM.`,
      timestamp: 'Justo ahora',
      targetTab: 'cancionero',
      targetId: created.id,
    };

    syncSongToFirestore(activeGroup.id, created);
    updateActiveGroup((g) => ({
      ...g,
      songs: [created, ...g.songs],
      activityFeed: [activityItem, ...g.activityFeed].slice(0, 5),
    }));
    setSelectedSongNav({ songId: null, customKey: null });

    dispatchNotifications([
      {
        recipientUserId: 'all',
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: 'new_song',
        title: `Nueva Canción: «${created.title}»`,
        message: `@${currentUser.username} (${activeMember.name}) agregó «${created.title}» (Tono ${created.originalKey} · ${created.bpm} BPM) al repertorio del grupo.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'cancionero',
        targetId: created.id,
      },
    ]);
  };

  const handleUpdateSong = (updated: Song) => {
    const oldSong = activeGroup.songs.find((s) => s.id === updated.id);
    if (
      oldSong?.chordSheetImageUrl &&
      oldSong.chordSheetImageUrl !== updated.chordSheetImageUrl &&
      oldSong.chordSheetImageUrl.startsWith('http')
    ) {
      deleteMediaFromStorage(oldSong.chordSheetImageUrl);
    }
    syncSongToFirestore(activeGroup.id, updated);
    updateActiveGroup((g) => ({
      ...g,
      songs: g.songs.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const handleDeleteSong = (songId: string) => {
    const targetSong = activeGroup.songs.find((s) => s.id === songId);
    if (targetSong?.chordSheetImageUrl && targetSong.chordSheetImageUrl.startsWith('http')) {
      deleteMediaFromStorage(targetSong.chordSheetImageUrl);
    }
    recordDeletedId(STORAGE_KEYS.DELETED_SONG_IDS, songId);
    deleteSongFromFirestore(songId);
    updateActiveGroup((g) => ({
      ...g,
      songs: g.songs.filter((s) => s.id !== songId),
      events: g.events.map((ev) => ({
        ...ev,
        songs: ev.songs.filter((item) => item.songId !== songId),
      })),
      activityFeed: (g.activityFeed || []).filter((f) => f.targetId !== songId),
      deletedIds: appendGroupDeletedIds(g.deletedIds, songId),
    }));
    setNotifications((prev) => {
      prev.forEach((n) => {
        if (n.targetId === songId) {
          deleteNotificationFromFirestore(n.id);
        }
      });
      return prev.filter((n) => n.targetId !== songId);
    });
  };

  const handleOpenSongInSongbook = (
    songId: string,
    customKey?: string,
    eventId?: string,
    autoStageMode?: boolean
  ) => {
    setSelectedSongNav({
      songId,
      customKey: customKey || null,
      eventId: eventId || null,
      autoStageMode: Boolean(autoStageMode),
    });
    setActiveTab('cancionero');
  };

  const handleOpenMetronomeWithSong = (
    bpm: number,
    timeSignature: TimeSignature
  ) => {
    setMetronomePreset({ bpm, timeSignature });
    setActiveTab('herramientas');
  };

  // Studies / Devotionals Handlers + Mention Notifications
  const handleToggleCompleteDevotional = (devId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      devotionals: g.devotionals.map((d) => {
        if (d.id !== devId) return d;
        const exists = d.completedByMemberIds.includes(activeMember.id);
        const nextCompletedIds = exists
          ? d.completedByMemberIds.filter((id) => id !== activeMember.id)
          : [...d.completedByMemberIds, activeMember.id];
        const nextSessions = d.sessions.map((s) => ({
          ...s,
          completedByMemberIds: exists
            ? s.completedByMemberIds.filter((id) => id !== activeMember.id)
            : s.completedByMemberIds.includes(activeMember.id)
            ? s.completedByMemberIds
            : [...s.completedByMemberIds, activeMember.id],
        }));
        return {
          ...d,
          completedByMemberIds: nextCompletedIds,
          sessions: nextSessions,
        };
      }),
    }));
  };

  const handleToggleCompleteSession = (devId: string, sessionId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      devotionals: g.devotionals.map((d) => {
        if (d.id !== devId) return d;
        const updatedSessions = d.sessions.map((s) => {
          if (s.id !== sessionId) return s;
          const done = s.completedByMemberIds.includes(activeMember.id);
          return {
            ...s,
            completedByMemberIds: done
              ? s.completedByMemberIds.filter((id) => id !== activeMember.id)
              : [...s.completedByMemberIds, activeMember.id],
          };
        });
        const allSessionsDone =
          updatedSessions.length > 0 &&
          updatedSessions.every((s) =>
            s.completedByMemberIds.includes(activeMember.id)
          );
        const alreadyInStudyCompleted = d.completedByMemberIds.includes(
          activeMember.id
        );
        const updatedCompletedByMemberIds = allSessionsDone
          ? alreadyInStudyCompleted
            ? d.completedByMemberIds
            : [...d.completedByMemberIds, activeMember.id]
          : d.completedByMemberIds.filter((id) => id !== activeMember.id);

        return {
          ...d,
          sessions: updatedSessions,
          completedByMemberIds: updatedCompletedByMemberIds,
        };
      }),
    }));
  };

  const handleAddDevotionalComment = (devId: string, text: string) => {
    const targetDev = activeGroup.devotionals.find((d) => d.id === devId);
    updateActiveGroup((g) => ({
      ...g,
      devotionals: g.devotionals.map((d) => {
        if (d.id !== devId) return d;
        return {
          ...d,
          comments: [
            ...d.comments,
            {
              id: `c-${Date.now()}`,
              authorName: activeMember.name,
              authorRole: activeMember.instruments[0] || 'Grupo',
              text,
              createdAt: 'Justo ahora',
            },
          ],
        };
      }),
    }));

    // Detect @username mentions in the study comment
    const mentionedHandles = extractMentionedUsernames(text);
    if (mentionedHandles.length > 0 && targetDev) {
      const mentionNotifs: Omit<
        AppNotification,
        'id' | 'createdAt' | 'readByUserIds'
      >[] = [];

      mentionedHandles.forEach((handle) => {
        const matchedMember = activeGroup.members.find(
          (m) =>
            m.username?.toLowerCase() === handle ||
            m.name.toLowerCase().replace(/\s+/g, '_') === handle
        );
        if (matchedMember) {
          mentionNotifs.push({
            recipientUserId: matchedMember.id,
            groupId: activeGroup.id,
            groupName: activeGroup.identity.ministryName,
            category: 'mention',
            title: `@${currentUser.username} te etiquetó en un Estudio`,
            message: `En «${targetDev.title}»: "${text}"`,
            actorName: currentUser.name,
            actorUsername: currentUser.username,
            targetTab: 'devocionales',
            targetId: targetDev.id,
          });
        }
      });

      dispatchNotifications(mentionNotifs);
    }
  };

  const handleCreateDevotional = (
    newDev: Omit<Devotional, 'id' | 'completedByMemberIds' | 'comments'>
  ) => {
    const created: Devotional = {
      ...newDev,
      id: `dev-${Date.now()}`,
      completedByMemberIds: [],
      comments: [],
    };
    updateActiveGroup((g) => ({
      ...g,
      devotionals: [created, ...g.devotionals],
    }));
    pushActivity({
      type: 'devotional_published',
      actorName: activeMember.name,
      actorRole: userRole,
      title: `Nuevo Estudio Publicado: «${created.title}»`,
      description: `Incluye ${created.sessions.length} ${
        created.sessions.length === 1 ? 'sesión' : 'sesiones'
      } con versículos y checks de realizado.`,
      targetTab: 'devocionales',
      targetId: created.id,
    });

    dispatchNotifications([
      {
        recipientUserId: 'all',
        groupId: activeGroup.id,
        groupName: activeGroup.identity.ministryName,
        category: 'study_published',
        title: `Nuevo Estudio: «${created.title}»`,
        message: `@${currentUser.username} publicó un estudio de ${created.sessions.length} ${
          created.sessions.length === 1 ? 'sesión' : 'sesiones'
        }.`,
        actorName: currentUser.name,
        actorUsername: currentUser.username,
        targetTab: 'devocionales',
        targetId: created.id,
      },
    ]);
  };

  const handleDeleteDevotional = (devId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      devotionals: g.devotionals.filter((d) => d.id !== devId),
      activityFeed: (g.activityFeed || []).filter((f) => f.targetId !== devId),
      deletedIds: appendGroupDeletedIds(g.deletedIds, devId),
    }));
    setNotifications((prev) => {
      prev.forEach((n) => {
        if (n.targetId === devId) {
          deleteNotificationFromFirestore(n.id);
        }
      });
      return prev.filter((n) => n.targetId !== devId);
    });
  };

  const handleSendChatMessage = (
    channel: ChatChannelId,
    text: string,
    attachedSongId?: string,
    voiceClipUrl?: string,
    voiceClipDurationSec?: number,
    targetGroupId?: string
  ) => {
    const resolvedGroupId = targetGroupId || activeGroup.id;
    const targetGroup =
      groups.find((g) => g.id === resolvedGroupId) || activeGroup;
    const targetActiveMember =
      targetGroup.members.find(
        (m) =>
          m.id === currentUser?.id ||
          m.email === currentUser?.email ||
          m.username === currentUser?.username
      ) || activeMember;
    const targetRole =
      (targetActiveMember.role as UserRole) || userRole || 'member';

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const mentionedHandles = extractMentionedUsernames(text);

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId: resolvedGroupId,
      channel,
      senderId: targetActiveMember.id,
      senderName: targetActiveMember.name,
      senderUsername: currentUser?.username,
      senderRole: targetRole,
      senderInstrument: targetActiveMember.instruments[0] || 'Banda',
      text,
      timestamp: timeStr,
      createdAtMs: Date.now(),
      attachedSongId,
      mentionedUsernames: mentionedHandles,
      voiceClipUrl,
      voiceClipDurationSec,
      prayerCount: channel === 'oracion' ? 1 : undefined,
      prayedByMemberIds:
        channel === 'oracion' ? [targetActiveMember.id] : undefined,
    };
    syncChatMessageToFirestore(resolvedGroupId, newMsg);
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== resolvedGroupId) return g;
        const allMsgs = [...(g.chatMessages || []), newMsg];
        if (allMsgs.length > MAX_CHAT_MESSAGES_PER_GROUP) {
          const overflow = allMsgs.slice(
            0,
            allMsgs.length - MAX_CHAT_MESSAGES_PER_GROUP
          );
          overflow.forEach((oldMsg) => {
            deleteChatMessageFromFirestore(oldMsg.id);
          });
        }
        return {
          ...g,
          chatMessages: allMsgs.slice(-MAX_CHAT_MESSAGES_PER_GROUP),
        };
      })
    );

    // Notify any user tagged with @username in the chat message
    if (mentionedHandles.length > 0) {
      const mentionNotifs: Omit<
        AppNotification,
        'id' | 'createdAt' | 'readByUserIds'
      >[] = [];

      mentionedHandles.forEach((handle) => {
        const matchedMember = targetGroup.members.find(
          (m) =>
            m.username?.toLowerCase() === handle ||
            m.name.toLowerCase().replace(/\s+/g, '_') === handle
        );
        if (matchedMember) {
          mentionNotifs.push({
            recipientUserId: matchedMember.id,
            groupId: targetGroup.id,
            groupName: targetGroup.identity.ministryName,
            category: 'mention',
            title: `@${currentUser.username} te etiquetó en #${channel}`,
            message: text,
            actorName: currentUser.name,
            actorUsername: currentUser.username,
            targetTab: 'chat',
          });
        }
      });

      dispatchNotifications(mentionNotifs);
    }
  };

  const handleTogglePrayerReaction = (
    messageId: string,
    targetGroupId?: string
  ) => {
    const resolvedGroupId = targetGroupId || activeGroup.id;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== resolvedGroupId) return g;
        return {
          ...g,
          chatMessages: (g.chatMessages || []).map((m) => {
            if (m.id !== messageId) return m;
            const list = m.prayedByMemberIds || [];
            const hasPrayed = list.includes(activeMember.id);
            const updatedList = hasPrayed
              ? list.filter((id) => id !== activeMember.id)
              : [...list, activeMember.id];
            const updatedMsg: ChatMessage = {
              ...m,
              prayedByMemberIds: updatedList,
              prayerCount: updatedList.length,
            };
            syncChatMessageToFirestore(g.id, updatedMsg);
            return updatedMsg;
          }),
        };
      })
    );
  };

  const handleDeleteChatMessage = (
    messageId: string,
    targetGroupId?: string
  ) => {
    const resolvedGroupId = targetGroupId || activeGroup.id;
    const targetGrp = groups.find((g) => g.id === resolvedGroupId);
    const targetMsg = targetGrp?.chatMessages.find((m) => m.id === messageId);
    if (targetMsg?.voiceClipUrl && targetMsg.voiceClipUrl.startsWith('http')) {
      deleteMediaFromStorage(targetMsg.voiceClipUrl);
    }
    recordDeletedId(STORAGE_KEYS.DELETED_MSG_IDS, messageId);
    deleteChatMessageFromFirestore(messageId);
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== resolvedGroupId) return g;
        const updatedGroup: WorshipGroup = {
          ...g,
          chatMessages: (g.chatMessages || []).filter(
            (m) => m.id !== messageId
          ),
          deletedIds: appendGroupDeletedIds(g.deletedIds, messageId),
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );
  };

  const handleTogglePinChatMessage = (
    messageId: string,
    targetGroupId?: string
  ) => {
    const resolvedGroupId = targetGroupId || activeGroup.id;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== resolvedGroupId) return g;
        const updatedGroup: WorshipGroup = {
          ...g,
          chatMessages: (g.chatMessages || []).map((m) => {
            if (m.id !== messageId) return m;
            const updatedMsg: ChatMessage = {
              ...m,
              isPinned: !m.isPinned,
            };
            syncChatMessageToFirestore(g.id, updatedMsg);
            return updatedMsg;
          }),
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );
  };

  const handleCreateCustomChannel = (
    groupId: string,
    rawName: string,
    description?: string
  ): string | null => {
    const cleanName = rawName
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_áéíóúñü]/gi, '')
      .slice(0, 32);

    if (!cleanName || cleanName === 'general') return null;

    const channelId = `ch-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const newChannel: CustomChatChannel = {
      id: channelId,
      name: cleanName,
      description:
        description?.trim() ||
        `Canal personalizado #${cleanName} creado por el Líder`,
      createdBy: activeMember.name,
      createdAt: new Date().toISOString(),
    };

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const existing = g.customChannels || [];
        if (
          existing.some(
            (c) => c.name.toLowerCase() === cleanName.toLowerCase()
          )
        ) {
          return g;
        }
        const updatedGroup: WorshipGroup = {
          ...g,
          customChannels: [...existing, newChannel],
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );

    return channelId;
  };

  const handleDeleteCustomChannel = (groupId: string, channelId: string) => {
    if (!channelId || channelId === 'general') return;
    deleteChannelMessagesFromFirestore(groupId, channelId);

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const msgsInChannel = (g.chatMessages || []).filter(
          (m) => m.channel === channelId
        );
        msgsInChannel.forEach((m) => {
          if (m.voiceClipUrl && m.voiceClipUrl.startsWith('http')) {
            deleteMediaFromStorage(m.voiceClipUrl);
          }
          recordDeletedId(STORAGE_KEYS.DELETED_MSG_IDS, m.id);
          deleteChatMessageFromFirestore(m.id);
        });
        const msgIdsToDelete = msgsInChannel.map((m) => m.id);
        const updatedGroup: WorshipGroup = {
          ...g,
          customChannels: (g.customChannels || []).filter(
            (c) => c.id !== channelId
          ),
          chatMessages: (g.chatMessages || []).filter(
            (m) => m.channel !== channelId
          ),
          deletedIds: appendGroupDeletedIds(
            g.deletedIds,
            channelId,
            ...msgIdsToDelete
          ),
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );
  };

  const handleToggleMemberRole = (memberId: string) => {
    if (memberId === activeGroup.leaderUserId) return; // Creator always remains main leader
    updateActiveGroup((g) => ({
      ...g,
      members: g.members.map((m) => {
        if (m.id !== memberId) return m;
        const nextRole = m.role === 'leader' ? 'member' : 'leader';
        return {
          ...m,
          role: nextRole,
          isLeader: nextRole === 'leader',
        };
      }),
    }));
  };

  const handleRemoveMember = (id: string) => {
    updateActiveGroup((g) => ({
      ...g,
      members: g.members.filter((m) => m.id !== id),
    }));
  };

  const handleResetDemoData = () => {
    setUsers([]);
    setCurrentUserId('');
    setGroups([]);
    setActiveGroupId('');
    setNotifications([]);
    setFriendRequests([]);
    setDirectMessages([]);
    setFallbackIdentity(INITIAL_IDENTITY);
    clearAllCloudData();
  };

  const navItems: {
    id: NavigationTab;
    label: string;
    shortLabel: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'inicio', label: 'Inicio', shortLabel: 'Inicio', icon: Home },
    { id: 'eventos', label: 'Eventos', shortLabel: 'Eventos', icon: Calendar },
    { id: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
    { id: 'herramientas', label: 'Herramientas', shortLabel: 'Herramientas', icon: Sliders },
  ];

  return (
    <div className={identity.darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col pb-24 md:pb-10 transition-colors w-full max-w-full overflow-x-hidden">
        {/* BANNER FLOTANTE EN TIEMPO REAL DE NUEVA NOTIFICACIÓN (TOAST) */}
        {toastNotification && (
          <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-2xl bg-slate-900 text-white border border-amber-500/40 shadow-2xl p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.bgClass}`}
              >
                <BellRing className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  {getNotificationCategoryLabel(toastNotification.category)} ·{' '}
                  {toastNotification.groupName}
                </span>
                <p className="text-xs sm:text-sm font-bold text-white truncate">
                  {toastNotification.title}
                </p>
                <p className="text-xs text-slate-300 line-clamp-2 mt-0.5">
                  {toastNotification.message}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectNotification(toastNotification);
                      setToastNotification(null);
                    }}
                    className="text-xs font-bold text-amber-400 hover:underline"
                  >
                    Abrir ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotificationsModalOpen(true);
                      setToastNotification(null);
                    }}
                    className="text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Ver todas
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToastNotification(null)}
              className="text-slate-400 hover:text-white p-1"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TOP BAR MINIMALISTA Y ESPACIADA: Wordmark + Navegación Desktop + Notificaciones y Menú Usuario */}
        <header className="sticky top-0 z-30 h-15 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-6 flex items-center justify-between gap-3">
          {/* Zona 1: Wordmark jesustone + indicador sutil de grupo activo sin saturar */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setActiveTab('inicio')}
              className="text-left min-w-0 flex items-center gap-2 group"
              title="Ir a Inicio"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${accent.softBgClass}`}
              >
                <GuitarPickCrossIcon className={`w-4 h-4 ${accent.textClass}`} />
              </div>
              <div className="min-w-0">
                <span className="block text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                  jesustone
                </span>
                <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[115px] sm:max-w-[180px] leading-tight">
                  {identity.ministryName}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="hidden sm:inline-flex min-h-[32px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 items-center gap-1 transition-colors shrink-0"
              title="Cambiar o crear grupo musical"
            >
              <span>Cambiar grupo</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </div>

          {/* Zona 2: Navegación Principal en Escritorio */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600 dark:text-slate-400">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? `text-slate-900 dark:text-white font-bold border-current ${accent.textClass}`
                      : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zona 3: Notificaciones + Menú General de Usuario con holgura y separación limpia */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={() => {
                setIsUserMenuOpen(false);
                setIsNotificationsModalOpen(true);
              }}
              className="relative min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
              title="Notificaciones"
              aria-label="Notificaciones"
            >
              <Bell className="w-4 h-4 text-amber-500 shrink-0" />
              {unreadNotificationsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs ${accent.bgClass}`}
              title="Menú de Usuario y Ajustes Generales"
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-5 h-5 rounded-md object-cover border border-white/30 shrink-0"
                />
              ) : userRole === 'leader' ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <User className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="max-w-[90px] sm:max-w-[140px] truncate">
                @{currentUser.username}
              </span>
              {friendRequests.some(
                (r) => r.status === 'pending' && r.toUserId === currentUser.id
              ) && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold">
                  {
                    friendRequests.filter(
                      (r) =>
                        r.status === 'pending' && r.toUserId === currentUser.id
                    ).length
                  }
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 opacity-80 shrink-0" />
            </button>

            {/* Menú Desplegable de Opciones Generales del Usuario (sin opciones internas del grupo) */}
            {isUserMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 space-y-1">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {currentUser.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      @{currentUser.username} ·{' '}
                      {currentUser.musicianCode || 'Músico'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleOpenMusicianProfile(currentUser.id, 'perfil');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-indigo-500" />
                      <span>Mi Perfil y Red de Amigos</span>
                    </span>
                    {friendRequests.some(
                      (r) =>
                        r.status === 'pending' && r.toUserId === currentUser.id
                    ) && (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-bold">
                        {
                          friendRequests.filter(
                            (r) =>
                              r.status === 'pending' &&
                              r.toUserId === currentUser.id
                          ).length
                        }
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsAuthModalOpen(true);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <FolderPlus className="w-4 h-4 text-sky-500" />
                    <span>Mis Grupos / Cambiar Grupo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIdentityModalState({ open: true, section: 'temas' });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <Palette className="w-4 h-4 text-amber-500" />
                    <span>Apariencia y Colores</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setShowInstallModal(true);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>Compartir / Instalar App</span>
                  </button>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-rose-500/10 flex items-center gap-2.5 text-xs font-semibold text-rose-500 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        {/* CONTENIDO PRINCIPAL DEL GRUPO ACTIVO */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-5 min-w-0 overflow-x-hidden">
          {activeTab === 'inicio' && (
            <DashboardHome
              identity={identity}
              activeMember={{ ...activeMember, role: userRole }}
              members={activeGroup.members}
              events={visibleEvents}
              songs={visibleSongs}
              devotionals={activeGroup.devotionals}
              alerts={activeGroup.alerts}
              activityFeed={isRestrictedGuest ? [] : activeGroup.activityFeed}
              userGroups={myGroups}
              activeGroupId={activeGroup.id}
              currentUserId={currentUser.id}
              friendsCount={myFriends.length}
              pendingFriendRequestsCount={
                friendRequests.filter(
                  (r) => r.status === 'pending' && r.toUserId === currentUser.id
                ).length
              }
              onSelectGroup={(gId) => setActiveGroupId(gId)}
              onNavigate={setActiveTab}
              onOpenIdentityModal={(section) =>
                setIdentityModalState({ open: true, section })
              }
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onOpenMusicianProfile={handleOpenMusicianProfile}
              onUpdateRSVP={handleUpdateRSVP}
              onOpenSongInSongbook={handleOpenSongInSongbook}
              onOpenMetronomeWithSong={handleOpenMetronomeWithSong}
              initialOpenGroupScreen={returnToGroupScreen}
            />
          )}

          {activeTab === 'eventos' && (
            <EventsModule
              events={visibleEvents}
              songs={visibleSongs}
              members={activeGroup.members}
              friends={myFriends}
              alerts={activeGroup.alerts}
              availabilityRecords={activeGroup.availabilityRecords || []}
              activeMember={{ ...activeMember, role: userRole }}
              accentColor={identity.accentColor}
              onUpdateRSVP={handleUpdateRSVP}
              onReassignRole={handleReassignRole}
              onUpdateEventAssignments={handleUpdateEventAssignments}
              onUpdateEventPlaylist={handleUpdateEventPlaylist}
              onUpdateEventNotes={handleUpdateEventNotes}
              onCreateEvent={handleCreateEvent}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEvent}
              onAddAlert={handleAddAlert}
              onDismissAlert={handleDismissAlert}
              onSaveAvailability={handleSaveAvailability}
              onRemoveAvailability={handleRemoveAvailability}
              onOpenSongInSongbook={handleOpenSongInSongbook}
              onConvokeFriendAsGuest={handleConvokeFriendAsGuest}
              ministryName={activeGroup.identity.ministryName}
            />
          )}

          {activeTab === 'cancionero' && (
            <SongbookModule
              songs={visibleSongs}
              events={visibleEvents}
              members={activeGroup.members}
              activeMember={{ ...activeMember, role: userRole }}
              accentColor={identity.accentColor}
              initialSongId={selectedSongNav.songId}
              initialTargetKey={selectedSongNav.customKey}
              initialEventId={selectedSongNav.eventId}
              initialAutoStageMode={selectedSongNav.autoStageMode}
              onBackToGroup={() => {
                setReturnToGroupScreen(true);
                setActiveTab('inicio');
              }}
              onAddSong={handleAddSong}
              onUpdateSong={handleUpdateSong}
              onDeleteSong={handleDeleteSong}
              onUpdateEventPlaylist={handleUpdateEventPlaylist}
              onUpdateEvent={handleUpdateEvent}
              onOpenMetronomeWithSong={handleOpenMetronomeWithSong}
            />
          )}

          {activeTab === 'devocionales' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setReturnToGroupScreen(true);
                    setActiveTab('inicio');
                  }}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 shadow-2xs transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Volver a {activeGroup.identity.ministryName}</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    Estudios de {activeGroup.identity.ministryName}
                  </span>
                </div>
              </div>

              <DevotionalsModule
                devotionals={activeGroup.devotionals}
                members={activeGroup.members}
                activeMemberId={activeMember.id}
                userRole={userRole}
                accentColor={identity.accentColor}
                onToggleCompleteDevotional={handleToggleCompleteDevotional}
                onToggleCompleteSession={handleToggleCompleteSession}
                onAddComment={handleAddDevotionalComment}
                onCreateDevotional={handleCreateDevotional}
                onDeleteDevotional={handleDeleteDevotional}
              />
            </div>
          )}

          {activeTab === 'chat' && (
            <ChatModule
              identity={identity}
              messages={activeGroup.chatMessages}
              members={activeGroup.members}
              songs={visibleSongs}
              events={visibleEvents}
              activeMember={{ ...activeMember, role: userRole }}
              currentUser={currentUser}
              allUsers={users}
              friends={myFriends}
              friendRequests={friendRequests}
              directMessages={directMessages}
              accentColor={identity.accentColor}
              userGroups={myGroups}
              activeGroupId={activeGroupId}
              onSelectGroup={(gid) => setActiveGroupId(gid)}
              initialDmUserId={initialDmUserId}
              onOpenMusicianProfile={(uid) =>
                handleOpenMusicianProfile(uid, 'perfil')
              }
              onSendMessage={handleSendChatMessage}
              onDeleteMessage={handleDeleteChatMessage}
              onTogglePinMessage={handleTogglePinChatMessage}
              onCreateChannel={handleCreateCustomChannel}
              onDeleteChannel={handleDeleteCustomChannel}
              onTogglePrayerReaction={handleTogglePrayerReaction}
              onOpenSongFromChat={(songId) => handleOpenSongInSongbook(songId)}
              onExitFullScreenChat={() => {
                setInitialDmUserId(null);
                setActiveTab('inicio');
              }}
              onSendFriendRequest={handleSendFriendRequest}
              onRespondFriendRequest={handleRespondFriendRequest}
              onSendDirectMessage={handleSendDirectMessage}
              onImportSharedSongToRepertoire={handleImportSharedSongToRepertoire}
              onConvokeFriendToEvent={handleConvokeFriendToEvent}
            />
          )}

          {activeTab === 'herramientas' && (
            <ToolsModule
              accentColor={identity.accentColor}
              songs={visibleSongs}
              initialBpm={metronomePreset.bpm}
              initialTimeSignature={metronomePreset.timeSignature}
            />
          )}
        </main>

        {/* BARRA DE NAVEGACIÓN INFERIOR MÓVIL CON BOTONES GRANDES TÁCTILES */}
        <nav
          aria-label="Navegación móvil jesustone"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center h-16 pb-safe px-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'inicio') setReturnToGroupScreen(false);
                  setActiveTab(item.id);
                }}
                className={`min-h-[48px] flex flex-col items-center justify-center rounded-2xl transition-all ${
                  isActive
                    ? `${accent.textClass} font-bold`
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-tight mt-0.5 truncate max-w-full">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}
        </nav>

        {!isOnline && (
          <div className="fixed bottom-20 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
            <WifiOff className="w-4 h-4" />
            <span>Modo Offline — jesustone funcionando sin conexión</span>
          </div>
        )}

        {/* MODAL DE PERFIL SOCIAL DE MÚSICO Y RED DE AMIGOS */}
        <MusicianProfileModal
          isOpen={profileModalState.open}
          onClose={() =>
            setProfileModalState((prev) => ({ ...prev, open: false }))
          }
          initialViewedUserId={profileModalState.viewedUserId}
          initialTab={profileModalState.tab}
          currentUser={currentUser}
          allUsers={users}
          groups={groups}
          activeGroup={activeGroup}
          userRoleInActiveGroup={userRole}
          friends={myFriends}
          friendRequests={friendRequests}
          accentColor={identity.accentColor}
          onUpdateMyProfile={handleUpdateMySocialProfile}
          onSendFriendRequest={handleSendFriendRequest}
          onRespondFriendRequest={handleRespondFriendRequest}
          onOpenDirectMessageWithUser={handleOpenDirectMessageWithUser}
          onConvokeMusicianToEvent={(targetUser, eventId, role) =>
            handleConvokeFriendToEvent(targetUser, eventId, role)
          }
          onAddMusicianToGroup={handleAddFriendToGroup}
        />

        {/* MODAL DE CENTRO DE NOTIFICACIONES */}
        <NotificationsModal
          isOpen={isNotificationsModalOpen}
          onClose={() => setIsNotificationsModalOpen(false)}
          currentUser={currentUser}
          userGroupIds={myGroupIds}
          notifications={myNotifications}
          accentColor={identity.accentColor}
          onSelectNotification={handleSelectNotification}
          onMarkAllAsRead={handleMarkAllNotificationsRead}
          onClearReadNotifications={handleClearReadNotifications}
        />

        {/* MODAL DE MIS GRUPOS (HASTA 6), CREAR GRUPO Y CUENTA DE USUARIO */}
        <AuthOnboardingModal
          isOpen={isAuthModalOpen}
          canClose={true}
          onClose={() => setIsAuthModalOpen(false)}
          identity={identity}
          users={users}
          currentUser={currentUser}
          groups={groups}
          activeGroupId={activeGroup.id}
          onLoginUser={handleLoginUser}
          onRegisterStandardUser={handleRegisterStandardUser}
          onResetLocalPassword={handleResetLocalPassword}
          onUpdateUserAvatar={handleUpdateUserAvatar}
          onUpdateUserInstruments={handleUpdateUserInstruments}
          onLogout={handleLogout}
          onCreateGroup={handleCreateGroup}
          onJoinGroupByCodeOrInvite={handleJoinGroupByCodeOrInvite}
          onSelectGroup={(gId) => setActiveGroupId(gId)}
        />

        {/* MODAL DE DATOS DEL GRUPO, TEMAS Y ADMINISTRACIÓN DE MIEMBROS */}
        <IdentityModal
          isOpen={identityModalState.open}
          initialSection={identityModalState.section}
          onClose={() =>
            setIdentityModalState((prev) => ({ ...prev, open: false }))
          }
          identity={identity}
          onSaveIdentity={handleSaveIdentity}
          userRole={userRole}
          leaderUserId={activeGroup.leaderUserId}
          members={activeGroup.members}
          invitations={activeGroup.invitations}
          activeMember={{ ...activeMember, role: userRole }}
          allUsers={users}
          friends={myFriends}
          onSendInvitationByUsernameOrEmail={
            handleSendInvitationByUsernameOrEmail
          }
          onAddFriendToGroup={handleAddFriendToGroup}
          onToggleMemberRole={handleToggleMemberRole}
          onToggleMemberGuestStatus={handleToggleMemberGuestStatus}
          onUpdateUserInstruments={handleUpdateUserInstruments}
          onOpenMusicianProfile={(uid) =>
            handleOpenMusicianProfile(uid, 'perfil')
          }
          onRemoveMember={handleRemoveMember}
          onResetDemoData={handleResetDemoData}
        />

        {/* MODAL DE COMPARTIR E INSTALAR APP PWA (iOS / Android / PC) */}
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Smartphone className={`w-5 h-5 ${accent.textClass}`} />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Compartir e Instalar jesustone (iOS, Android y PC)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  className="text-slate-400 hover:text-slate-800 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1. Enlace directo para abrir en navegador o enviar a la banda */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  1. Enlace para abrir en tu celular o compartir con el grupo
                </p>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                  {window.location.origin}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Código de invitación de tu grupo actual (<strong>{identity.ministryName}</strong>):{' '}
                  <span className="font-mono font-bold text-amber-500">
                    {identity.inviteCode}
                  </span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.origin);
                      setCopiedShareLink(true);
                      window.setTimeout(() => setCopiedShareLink(false), 3000);
                    }}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${accent.bgClass}`}
                  >
                    <span>
                      {copiedShareLink ? '¡Enlace copiado!' : 'Copiar Enlace de la App'}
                    </span>
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `¡Hola! Entra a nuestra app de alabanza *jesustone* aquí: ${window.location.origin} y únete al grupo «${identity.ministryName}» con el código: *${identity.inviteCode}*`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <span>Enviar por WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* 2. Botón de instalación directa si el navegador lo soporta */}
              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={async () => {
                    await install();
                  }}
                  className={`w-full min-h-[48px] py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md ${accent.bgClass}`}
                >
                  <Download className="w-4 h-4" />
                  <span>Instalar jesustone Ahora en este Dispositivo</span>
                </button>
              )}

              {/* 3. Instrucciones paso a paso por sistema operativo */}
              <div className="space-y-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  2. Cómo instalarla como App en la pantalla de inicio
                </p>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white mb-1">
                    📱 En iPhone / iPad (Safari):
                  </p>
                  <p>
                    1. Abre el enlace en <strong>Safari</strong>.<br />
                    2. Toca el botón <strong>Compartir</strong> (el cuadro con flecha hacia arriba).<br />
                    3. Elige <strong>«Agregar a pantalla de inicio»</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white mb-1">
                    🤖 En Android (Chrome):
                  </p>
                  <p>
                    1. Abre el enlace en <strong>Chrome</strong>.<br />
                    2. Toca el menú de 3 puntos (⋮) arriba a la derecha y selecciona <strong>«Instalar aplicación»</strong> o <strong>«Agregar a la pantalla principal»</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white mb-1">
                    💻 En Computadora (Chrome / Edge):
                  </p>
                  <p>
                    Haz clic en el icono de <strong>Instalar (🖥️↓)</strong> que aparece en el lado derecho de la barra de direcciones del navegador.
                  </p>
                </div>
              </div>

              {isIOS && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Dispositivo iOS detectado: Sigue los pasos de Safari para instalar el
                  icono en tu pantalla de inicio.
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="w-full min-h-[46px] py-2.5 rounded-2xl bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
