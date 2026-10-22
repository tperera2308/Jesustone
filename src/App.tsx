/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
  Devotional,
  EventSongItem,
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
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';
import {
  clearAllCloudData,
  deleteNotificationFromFirestore,
  firebaseConfig,
  subscribeToJesustoneCloud,
  syncGroupToFirestore,
  syncNotificationToFirestore,
  syncUserToFirestore,
  testFirestoreConnection,
} from './firebase';
import {
  Bell,
  BellRing,
  BookOpen,
  Calendar,
  Cloud,
  Download,
  FolderPlus,
  Home,
  MessageSquare,
  Music,
  Palette,
  Settings,
  ShieldCheck,
  Sliders,
  Smartphone,
  User,
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
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function extractMentionedUsernames(text: string): string[] {
  const matches = text.match(/@([\w._-]+)/g) || [];
  return Array.from(
    new Set(matches.map((m) => m.slice(1).toLowerCase()))
  );
}

export default function App() {
  const [users, setUsers] = useState<AppUser[]>(() =>
    loadFromStorage(STORAGE_KEYS.USERS, [])
  );
  const [currentUserId, setCurrentUserId] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENT_USER_ID, '')
  );
  const [groups, setGroups] = useState<WorshipGroup[]>(() =>
    loadFromStorage(STORAGE_KEYS.GROUPS, [])
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
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const [selectedSongNav, setSelectedSongNav] = useState<{
    songId: string | null;
    customKey: string | null;
  }>({ songId: null, customKey: null });
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
    const unsub = subscribeToJesustoneCloud({
      onUsersSnapshot: (cloudUsers) => setUsers(cloudUsers),
      onGroupsSnapshot: (cloudGroups) => setGroups(cloudGroups),
      onNotificationsSnapshot: (cloudNotifs) => setNotifications(cloudNotifs),
      onSyncStatusChange: (status) => setCloudStatus(status),
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.CURRENT_USER_ID,
      JSON.stringify(currentUserId)
    );
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.ACTIVE_GROUP_ID,
      JSON.stringify(activeGroupId)
    );
  }, [activeGroupId]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.NOTIFICATIONS,
      JSON.stringify(notifications)
    );
  }, [notifications]);

  // Auto-hide toast notification after 4.5s
  useEffect(() => {
    if (!toastNotification) return;
    const timer = window.setTimeout(() => {
      setToastNotification(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toastNotification]);

  const currentUser = users.find((u) => u.id === currentUserId) || null;

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
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [identity]);

  // Helper to create notifications and trigger in-app toast / browser notification
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

    setNotifications((prev) => [...createdList, ...prev]);
    createdList.forEach((n) => {
      syncNotificationToFirestore(n);
    });

    // Show toast for the most relevant notification for currentUser (or the first one created)
    const relevantForMe =
      createdList.find(
        (n) =>
          currentUser &&
          (n.recipientUserId === currentUser.id || n.recipientUserId === 'all')
      ) || createdList[0];

    if (relevantForMe) {
      setToastNotification(relevantForMe);
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(`jesustone · ${relevantForMe.title}`, {
            body: relevantForMe.message,
            icon: '/pwa-192x192.png',
          });
        } catch {
          // ignore if blocked
        }
      }
    }
  };

  // ============================================================================
  // HANDLERS DE AUTENTICACIÓN ESTÁNDAR (CORREO, @USUARIO Y CONTRASEÑA)
  // ============================================================================
  const handleRegisterStandardUser = (data: {
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

    const newUser: AppUser = {
      id: `u-${Date.now()}`,
      name: data.name,
      username: data.username,
      email: data.email,
      password: data.password,
      instruments: data.instruments,
      avatarInitials: initials,
      avatarUrl: data.avatarUrl,
      createdAt: new Date().toISOString(),
    };

    setUsers((prev) => [...prev, newUser]);
    syncUserToFirestore(newUser);
    setCurrentUserId(newUser.id);
    return { ok: true };
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
    setCurrentUserId(userId);
    const userGroups = groups.filter((g) =>
      g.members.some((m) => m.id === userId)
    );
    if (userGroups.length > 0) {
      setActiveGroupId(userGroups[0].id);
    }
  };

  const handleLogout = () => {
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

    const newGroup: WorshipGroup = {
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
    };

    setGroups((prev) => [newGroup, ...prev]);
    syncGroupToFirestore(newGroup);
    setActiveGroupId(newGroup.id);
    setActiveTab('inicio');
    return { ok: true };
  };

  const handleJoinGroupByCodeOrInvite = (
    codeOrGroupId: string
  ): { ok: boolean; error?: string } => {
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
    const targetGroup = groups.find(
      (g) =>
        g.id === codeOrGroupId || g.identity.inviteCode.toUpperCase() === clean
    );

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
      joinedAt: 'Miembro del Grupo',
    };

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== targetGroup.id) return g;
        const updatedGroup: WorshipGroup = {
          ...g,
          members: [...g.members, newMember],
          invitations: g.invitations.map((inv) =>
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
              title: 'Nuevo Miembro en el Grupo',
              description: `@${currentUser.username} se unió a «${g.identity.ministryName}».`,
              timestamp: 'Justo ahora',
              targetTab: 'inicio' as NavigationTab,
            },
            ...g.activityFeed,
          ].slice(0, 5),
        };
        syncGroupToFirestore(updatedGroup);
        return updatedGroup;
      })
    );

    setActiveGroupId(targetGroup.id);
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
  // DENTRO DE UN GRUPO ACTIVO: DATOS, ROL Y NOTIFICACIONES DEL USUARIO
  // ============================================================================
  const activeMember =
    activeGroup.members.find((m) => m.id === currentUser.id) ||
    activeGroup.members[0];
  const userRole =
    activeGroup.leaderUserId === currentUser.id ? 'leader' : activeMember.role;
  const accent = getAccentClasses(identity.accentColor);

  // Filter notifications relevant to currentUser (across their groups or direct mentions/invites)
  const myGroupIds = myGroups.map((g) => g.id);
  const myNotifications = notifications.filter(
    (n) =>
      n.recipientUserId === currentUser.id ||
      (n.recipientUserId === 'all' && myGroupIds.includes(n.groupId))
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
  }): { ok: boolean; message: string } => {
    const cleanId = invite.identifier.trim().toLowerCase().replace(/^@/, '');
    const targetUser = users.find(
      (u) =>
        u.username.toLowerCase() === cleanId ||
        u.email.toLowerCase() === cleanId
    );

    if (
      targetUser &&
      activeGroup.members.some((m) => m.id === targetUser.id)
    ) {
      return {
        ok: false,
        message: `@${targetUser.username} ya es miembro de este grupo.`,
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
        instruments: Array.from(
          new Set([invite.suggestedInstrument, ...targetUser.instruments])
        ),
        phone: '',
        avatarInitials: targetUser.avatarInitials,
        avatarUrl: targetUser.avatarUrl,
        joinedAt: `Invitado por @${currentUser.username}`,
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
            title: `Nuevo Miembro Invitado: @${targetUser.username}`,
            description: `${activeMember.name} agregó a ${targetUser.name} (@${targetUser.username}) en el rol de ${invite.suggestedInstrument}.`,
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
          category: 'group_invite',
          title: `Te agregaron al grupo «${activeGroup.identity.ministryName}»`,
          message: `@${currentUser.username} te unió al grupo con el rol sugerido de ${invite.suggestedInstrument}.`,
          actorName: currentUser.name,
          actorUsername: currentUser.username,
          targetTab: 'inicio',
        },
      ]);

      return {
        ok: true,
        message: `¡@${targetUser.username} (${targetUser.name}) fue invitado y unido al grupo!`,
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
    updateActiveGroup((g) => ({
      ...g,
      events: g.events.filter((e) => e.id !== eventId),
    }));
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
    }));
  };

  // Songbook Handlers + Notifications
  const handleAddSong = (newSong: Omit<Song, 'id'>) => {
    const created: Song = {
      ...newSong,
      id: `s-${Date.now()}`,
    };
    updateActiveGroup((g) => ({
      ...g,
      songs: [created, ...g.songs],
    }));
    setSelectedSongNav({ songId: created.id, customKey: created.originalKey });
    pushActivity({
      type: 'song_added',
      actorName: activeMember.name,
      actorRole: userRole,
      title: `Nueva canción en Repertorio: «${created.title}»`,
      description: `Subida por ${activeMember.name} (${
        userRole === 'leader' ? 'Líder' : 'Miembro'
      }) en Tono ${created.originalKey} · ${created.bpm} BPM.`,
      targetTab: 'cancionero',
      targetId: created.id,
    });

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
    updateActiveGroup((g) => ({
      ...g,
      songs: g.songs.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const handleDeleteSong = (songId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      songs: g.songs.filter((s) => s.id !== songId),
      events: g.events.map((ev) => ({
        ...ev,
        songs: ev.songs.filter((item) => item.songId !== songId),
      })),
    }));
  };

  const handleOpenSongInSongbook = (songId: string, customKey?: string) => {
    setSelectedSongNav({ songId, customKey: customKey || null });
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
    }));
  };

  const handleSendChatMessage = (
    channel: ChatChannelId,
    text: string,
    attachedSongId?: string,
    voiceClipUrl?: string,
    voiceClipDurationSec?: number
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const mentionedHandles = extractMentionedUsernames(text);

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      channel,
      senderId: activeMember.id,
      senderName: activeMember.name,
      senderUsername: currentUser.username,
      senderRole: userRole,
      senderInstrument: activeMember.instruments[0] || 'Banda',
      text,
      timestamp: timeStr,
      attachedSongId,
      mentionedUsernames: mentionedHandles,
      voiceClipUrl,
      voiceClipDurationSec,
      prayerCount: channel === 'oracion' ? 1 : undefined,
      prayedByMemberIds: channel === 'oracion' ? [activeMember.id] : undefined,
    };
    updateActiveGroup((g) => ({
      ...g,
      chatMessages: [...g.chatMessages, newMsg],
    }));

    // Notify any user tagged with @username in the chat message
    if (mentionedHandles.length > 0) {
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

  const handleTogglePrayerReaction = (messageId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      chatMessages: g.chatMessages.map((m) => {
        if (m.id !== messageId) return m;
        const list = m.prayedByMemberIds || [];
        const hasPrayed = list.includes(activeMember.id);
        const updatedList = hasPrayed
          ? list.filter((id) => id !== activeMember.id)
          : [...list, activeMember.id];
        return {
          ...m,
          prayedByMemberIds: updatedList,
          prayerCount: updatedList.length,
        };
      }),
    }));
  };

  const handleDeleteChatMessage = (messageId: string) => {
    updateActiveGroup((g) => ({
      ...g,
      chatMessages: g.chatMessages.filter((m) => m.id !== messageId),
    }));
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
    { id: 'cancionero', label: 'Cancionero', shortLabel: 'Canciones', icon: Music },
    { id: 'devocionales', label: 'Estudio', shortLabel: 'Estudio', icon: BookOpen },
    { id: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
    { id: 'herramientas', label: 'Herramientas', shortLabel: 'Músico', icon: Sliders },
  ];

  return (
    <div className={identity.darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-100 dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col pb-24 md:pb-10 transition-colors w-full max-w-full overflow-x-hidden">
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

        {/* TOP BAR CONTRACT: 3 Zonas Limpias */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-6">
          {/* Zona 1: Wordmark jesustone con el icono de Púa de Guitarra + Cruz */}
          <button
            type="button"
            onClick={() => setActiveTab('inicio')}
            className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <GuitarPickCrossIcon className={`w-6 h-6 ${accent.textClass}`} />
            <span>jesustone</span>
          </button>

          {/* Zona 2: Navegación Principal en Escritorio */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
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

          {/* Zona 3: Acción Principal (Notificaciones + Cuenta de Usuario Activa con Foto) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsNotificationsModalOpen(true)}
              className="relative min-h-[42px] px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs font-bold transition-colors"
              title="Centro de Notificaciones"
            >
              <Bell className="w-4 h-4 text-amber-500" />
              <span className="hidden sm:inline">Notificaciones</span>
              {unreadNotificationsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px] font-bold">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className={`min-h-[42px] px-3 py-1.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${accent.bgClass}`}
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-6 h-6 rounded-lg object-cover border border-white/30"
                />
              ) : userRole === 'leader' ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
              <span>
                @{currentUser.username} ·{' '}
                {userRole === 'leader' ? 'Líder' : 'Miembro'} ({myGroups.length}/
                {MAX_GROUPS_PER_USER})
              </span>
            </button>
          </div>
        </header>

        {/* SUB-BARRA DE ACCIONES MÓVILES: Grupo Activo, Crear/Cambiar Grupo, Temas e Instalación */}
        <div className="bg-white/70 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setIdentityModalState({ open: true, section: 'grupo' })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5 text-amber-500" />
                <span>Grupo: {identity.ministryName}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5 text-sky-500" />
                <span>
                  Mis Grupos ({myGroups.length}/{MAX_GROUPS_PER_USER}) · Crear Grupo
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setIdentityModalState({ open: true, section: 'temas' })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Palette className="w-3.5 h-3.5 text-indigo-400" />
                <span>Temas</span>
              </button>

              <span className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {cloudStatus === 'connected'
                    ? `Firebase: ${firebaseConfig.projectId}`
                    : `Local + Firebase (${firebaseConfig.projectId})`}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowInstallModal(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              <span>Compartir / Instalar App</span>
            </button>
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL DEL GRUPO ACTIVO */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-5 min-w-0 overflow-x-hidden">
          {activeTab === 'inicio' && (
            <DashboardHome
              identity={identity}
              activeMember={{ ...activeMember, role: userRole }}
              members={activeGroup.members}
              events={activeGroup.events}
              songs={activeGroup.songs}
              devotionals={activeGroup.devotionals}
              alerts={activeGroup.alerts}
              activityFeed={activeGroup.activityFeed}
              onNavigate={setActiveTab}
              onOpenIdentityModal={(section) =>
                setIdentityModalState({ open: true, section })
              }
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onUpdateRSVP={handleUpdateRSVP}
              onOpenSongInSongbook={handleOpenSongInSongbook}
              onOpenMetronomeWithSong={handleOpenMetronomeWithSong}
            />
          )}

          {activeTab === 'eventos' && (
            <EventsModule
              events={activeGroup.events}
              songs={activeGroup.songs}
              members={activeGroup.members}
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
            />
          )}

          {activeTab === 'cancionero' && (
            <SongbookModule
              songs={activeGroup.songs}
              events={activeGroup.events}
              members={activeGroup.members}
              activeMember={{ ...activeMember, role: userRole }}
              accentColor={identity.accentColor}
              initialSongId={selectedSongNav.songId}
              initialTargetKey={selectedSongNav.customKey}
              onAddSong={handleAddSong}
              onUpdateSong={handleUpdateSong}
              onDeleteSong={handleDeleteSong}
              onUpdateEventPlaylist={handleUpdateEventPlaylist}
              onOpenMetronomeWithSong={handleOpenMetronomeWithSong}
            />
          )}

          {activeTab === 'devocionales' && (
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
          )}

          {activeTab === 'chat' && (
            <ChatModule
              identity={identity}
              messages={activeGroup.chatMessages}
              members={activeGroup.members}
              songs={activeGroup.songs}
              activeMember={{ ...activeMember, role: userRole }}
              accentColor={identity.accentColor}
              onSendMessage={handleSendChatMessage}
              onDeleteMessage={handleDeleteChatMessage}
              onTogglePrayerReaction={handleTogglePrayerReaction}
              onOpenSongFromChat={(songId) => handleOpenSongInSongbook(songId)}
              onExitFullScreenChat={() => setActiveTab('inicio')}
            />
          )}

          {activeTab === 'herramientas' && (
            <ToolsModule
              accentColor={identity.accentColor}
              songs={activeGroup.songs}
              initialBpm={metronomePreset.bpm}
              initialTimeSignature={metronomePreset.timeSignature}
            />
          )}
        </main>

        {/* BARRA DE NAVEGACIÓN INFERIOR MÓVIL CON BOTONES GRANDES TÁCTILES */}
        <nav
          aria-label="Navegación móvil jesustone"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-6 items-center h-16 pb-safe px-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
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

        {/* MODAL DE CENTRO DE NOTIFICACIONES */}
        <NotificationsModal
          isOpen={isNotificationsModalOpen}
          onClose={() => setIsNotificationsModalOpen(false)}
          currentUser={currentUser}
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
          onUpdateUserAvatar={handleUpdateUserAvatar}
          onUpdateUserInstruments={handleUpdateUserInstruments}
          onLogout={handleLogout}
          onCreateGroup={handleCreateGroup}
          onJoinGroupByCodeOrInvite={handleJoinGroupByCodeOrInvite}
          onSelectGroup={(gId) => setActiveGroupId(gId)}
        />

        {/* MODAL DE DATOS DEL GRUPO, TEMAS E INVITACIONES POR @USUARIO O CORREO */}
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
          onSendInvitationByUsernameOrEmail={
            handleSendInvitationByUsernameOrEmail
          }
          onToggleMemberRole={handleToggleMemberRole}
          onUpdateUserInstruments={handleUpdateUserInstruments}
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
