import React, { useEffect, useState } from 'react';
import {
  AccentColorId,
  AppNotification,
  AppUser,
  NotificationCategory,
} from '../types';
import { getAccentClasses } from './IdentityModal';
import {
  getPushSubscriptionState,
  subscribeDeviceToWebPush,
  unsubscribeDeviceFromWebPush,
} from '../utils/pushNotifications';
import {
  AtSign,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  Calendar,
  CheckCheck,
  Music,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  userGroupIds?: string[];
  notifications: AppNotification[];
  accentColor: AccentColorId;
  onSelectNotification: (notification: AppNotification) => void;
  onMarkAllAsRead: () => void;
  onClearReadNotifications: () => void;
}

export function getNotificationIcon(category: NotificationCategory) {
  switch (category) {
    case 'new_event':
    case 'guest_event_invite':
      return Calendar;
    case 'new_song':
      return Music;
    case 'mention':
    case 'direct_message':
      return AtSign;
    case 'role_assigned':
    case 'friend_accepted':
      return UserCheck;
    case 'study_published':
      return BookOpen;
    case 'group_invite':
    case 'friend_request':
      return UserPlus;
    default:
      return Bell;
  }
}

export function getNotificationBadgeStyle(category: NotificationCategory) {
  switch (category) {
    case 'mention':
    case 'direct_message':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    case 'role_assigned':
    case 'friend_accepted':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    case 'new_event':
    case 'guest_event_invite':
      return 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30';
    case 'new_song':
      return 'bg-sky-500/15 text-sky-500 border-sky-500/30';
    case 'study_published':
      return 'bg-violet-500/15 text-violet-500 border-violet-500/30';
    case 'group_invite':
    case 'friend_request':
      return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
    default:
      return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
  }
}

export function getNotificationCategoryLabel(category: NotificationCategory) {
  switch (category) {
    case 'mention':
      return 'Te etiquetaron (@)';
    case 'role_assigned':
      return 'Asignación de Rol';
    case 'new_event':
      return 'Nuevo Evento';
    case 'new_song':
      return 'Nueva Canción';
    case 'study_published':
      return 'Nuevo Estudio';
    case 'group_invite':
      return 'Invitación a Grupo';
    case 'friend_request':
      return 'Solicitud de Amistad';
    case 'friend_accepted':
      return 'Nuevo Amigo Músico';
    case 'direct_message':
      return 'Mensaje Directo (DM)';
    case 'guest_event_invite':
      return 'Pase de Músico Invitado';
    default:
      return 'Notificación';
  }
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userGroupIds = [],
  notifications,
  accentColor,
  onSelectNotification,
  onMarkAllAsRead,
  onClearReadNotifications,
}) => {
  const accent = getAccentClasses(accentColor);
  const [filter, setFilter] = useState<
    'all' | 'unread' | 'mentions' | 'events' | 'songs'
  >('all');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getPushSubscriptionState().then((state) => {
      if (!active) return;
      setPushSubscribed(state.subscribed);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(
    (n) => !n.readByUserIds.includes(currentUser.id)
  ).length;

  const filteredNotifications = notifications.filter((n) => {
    const isUnread = !n.readByUserIds.includes(currentUser.id);
    if (filter === 'unread') return isUnread;
    if (filter === 'mentions')
      return (
        n.category === 'mention' ||
        n.category === 'role_assigned' ||
        n.category === 'direct_message'
      );
    if (filter === 'events')
      return (
        n.category === 'new_event' ||
        n.category === 'role_assigned' ||
        n.category === 'guest_event_invite'
      );
    if (filter === 'songs') return n.category === 'new_song';
    return true;
  });

  const handleEnableNativePush = async () => {
    setPushLoading(true);
    setPushFeedback(null);
    const res = await subscribeDeviceToWebPush({
      userId: currentUser.id,
      username: currentUser.username,
      groupIds: userGroupIds,
    });
    const updatedState = await getPushSubscriptionState();
    setPushSubscribed(updatedState.subscribed);
    setPushFeedback({ ok: res.ok, message: res.message });
    setPushLoading(false);
  };

  const handleDisableNativePush = async () => {
    setPushLoading(true);
    setPushFeedback(null);
    const res = await unsubscribeDeviceFromWebPush(currentUser.id);
    const updatedState = await getPushSubscriptionState();
    setPushSubscribed(updatedState.subscribed);
    setPushFeedback({ ok: res.ok, message: res.message });
    setPushLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center ${accent.bgClass}`}
            >
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Centro de Notificaciones</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-mono font-bold">
                    {unreadCount} nuevas
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Avisos de eventos, suplencias, canciones y mensajes para @{currentUser.username}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar notificaciones"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra simple para activar o desactivar notificaciones en el dispositivo */}
        <div className="px-4 py-3 bg-slate-900/95 border-t border-slate-800 text-white flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  pushSubscribed
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">
                    Notificaciones en este dispositivo
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      pushSubscribed
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {pushSubscribed ? 'Activadas' : 'Desactivadas'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  Recibe avisos de eventos y mensajes aunque no tengas la app abierta.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!pushSubscribed ? (
                <button
                  type="button"
                  disabled={pushLoading}
                  onClick={handleEnableNativePush}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${accent.bgClass} disabled:opacity-50`}
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>
                    {pushLoading ? 'Activando...' : 'Activar notificaciones'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pushLoading}
                  onClick={handleDisableNativePush}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>
                    {pushLoading ? 'Desactivando...' : 'Desactivar notificaciones'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {pushFeedback && (
            <div
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium flex items-center justify-between gap-2 ${
                pushFeedback.ok
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              <span>{pushFeedback.message}</span>
              <button
                type="button"
                onClick={() => setPushFeedback(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Barra de Filtros y Acciones Rápidas */}
        <div className="p-3.5 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: `Todas (${notifications.length})` },
              { id: 'unread', label: `No leídas (${unreadCount})` },
              { id: 'mentions', label: 'Etiquetas (@), DM y Roles' },
              { id: 'events', label: 'Eventos y Suplencias' },
              { id: 'songs', label: 'Canciones' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as typeof filter)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                  filter === tab.id
                    ? `${accent.bgClass} shadow-xs`
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-3 ml-auto">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllAsRead}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:underline"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar todas como leídas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClearReadNotifications}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-500 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpiar leídas
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista de Notificaciones */}
        <div className="p-4 sm:p-5 space-y-3 max-h-[68vh] overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="p-10 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
              >
                <Bell className="w-7 h-7" />
              </div>
              <div className="max-w-sm mx-auto space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  No tienes notificaciones en esta vista
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Recibirás notificaciones automáticamente cuando se programen nuevos
                  eventos, se suban canciones al repertorio o alguien te etiquete con{' '}
                  <strong className="font-mono">@{currentUser.username}</strong> en el chat,
                  estudios o roles.
                </p>
              </div>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const Icon = getNotificationIcon(notif.category);
              const isUnread = !notif.readByUserIds.includes(currentUser.id);
              const badgeStyle = getNotificationBadgeStyle(notif.category);

              return (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => {
                    onSelectNotification(notif);
                    onClose();
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                    isUnread
                      ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/40 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 mt-0.5 ${badgeStyle}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          {getNotificationCategoryLabel(notif.category)}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                          {notif.groupName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-400">
                          {notif.createdAt}
                        </span>
                        {isUnread && (
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        )}
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                      {notif.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      {notif.message}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
