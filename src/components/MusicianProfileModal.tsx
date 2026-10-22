import React, { useEffect, useRef, useState } from 'react';
import {
  ALL_INSTRUMENT_ROLES,
  AccentColorId,
  AppUser,
  BandMember,
  FriendRequest,
  InstrumentRole,
  WorshipEvent,
  WorshipGroup,
} from '../types';
import {
  BrandIconDisplay,
  compressImageFileToDataUrl,
  getAccentClasses,
} from './IdentityModal';
import {
  ArrowLeft,
  Award,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  MapPin,
  MessageSquare,
  Music,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface MusicianProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialViewedUserId?: string | null;
  initialTab?: 'perfil' | 'amigos' | 'explorar';
  currentUser: AppUser;
  allUsers: AppUser[];
  groups: WorshipGroup[];
  activeGroup: WorshipGroup;
  userRoleInActiveGroup: 'leader' | 'member';
  friends: AppUser[];
  friendRequests: FriendRequest[];
  accentColor: AccentColorId;
  onUpdateMyProfile: (updates: {
    bio?: string;
    cityOrChurch?: string;
    availableForSub?: boolean;
    instruments?: InstrumentRole[];
    avatarUrl?: string;
  }) => void;
  onSendFriendRequest: (
    targetIdentifierOrUser: string | AppUser
  ) => { ok: boolean; message: string };
  onRespondFriendRequest: (requestId: string, accept: boolean) => void;
  onOpenDirectMessageWithUser: (targetUser: AppUser) => void;
  onConvokeMusicianToEvent: (
    targetUser: AppUser,
    eventId: string,
    role: InstrumentRole
  ) => { ok: boolean; message: string };
  onAddMusicianToGroup: (
    targetUser: AppUser,
    asGuest: boolean,
    role: InstrumentRole
  ) => { ok: boolean; message: string };
}

function getMusicianCode(u: AppUser): string {
  if (u.musicianCode) return u.musicianCode;
  let hash = 0;
  const seed = u.id || u.username || u.email;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return `JST-${(hash % 9000) + 1000}`;
}

export const MusicianProfileModal: React.FC<MusicianProfileModalProps> = ({
  isOpen,
  onClose,
  initialViewedUserId,
  initialTab = 'perfil',
  currentUser,
  allUsers,
  groups,
  activeGroup,
  userRoleInActiveGroup,
  friends,
  friendRequests,
  accentColor,
  onUpdateMyProfile,
  onSendFriendRequest,
  onRespondFriendRequest,
  onOpenDirectMessageWithUser,
  onConvokeMusicianToEvent,
  onAddMusicianToGroup,
}) => {
  const accent = getAccentClasses(accentColor);
  const [activeModalTab, setActiveModalTab] = useState<
    'perfil' | 'amigos' | 'explorar'
  >(initialTab);
  const [viewedUserId, setViewedUserId] = useState<string>(
    initialViewedUserId || currentUser.id
  );

  // Edit My Profile State
  const [isEditingMyProfile, setIsEditingMyProfile] = useState(false);
  const [editBio, setEditBio] = useState(currentUser.bio || '');
  const [editCityOrChurch, setEditCityOrChurch] = useState(
    currentUser.cityOrChurch || ''
  );
  const [editAvailableForSub, setEditAvailableForSub] = useState<boolean>(
    currentUser.availableForSub ?? true
  );
  const [editInstruments, setEditInstruments] = useState<InstrumentRole[]>(
    currentUser.instruments || []
  );
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Invite to Event / Group Drawer inside another musician's profile
  const [showConvokePanel, setShowConvokePanel] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('directory_only');
  const [selectedRole, setSelectedRole] = useState<InstrumentRole>('Guitarra eléctrica');
  const [inviteAsGuestPass, setInviteAsGuestPass] = useState<boolean>(true);

  // Search & Explore State
  const [searchQuery, setSearchQuery] = useState('');
  const [instrumentFilter, setInstrumentFilter] = useState<string>('all');
  const [onlyAvailableSubFilter, setOnlyAvailableSubFilter] = useState(false);
  const [directCodeInput, setDirectCodeInput] = useState('');

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveModalTab(initialTab);
      setViewedUserId(initialViewedUserId || currentUser.id);
      setIsEditingMyProfile(false);
      setShowConvokePanel(false);
      setFeedbackMsg(null);
    }
  }, [isOpen, initialViewedUserId, initialTab, currentUser.id]);

  // Synchronize edit form when currentUser updates
  useEffect(() => {
    setEditBio(currentUser.bio || '');
    setEditCityOrChurch(currentUser.cityOrChurch || '');
    setEditAvailableForSub(currentUser.availableForSub ?? true);
    setEditInstruments(currentUser.instruments || []);
  }, [currentUser]);

  if (!isOpen) return null;

  // Resolve the viewed user (from allUsers or fallback from activeGroup.members)
  const resolvedUserFromAll = allUsers.find((u) => u.id === viewedUserId);
  const fallbackMember = activeGroup.members.find((m) => m.id === viewedUserId);
  const viewedUser: AppUser =
    resolvedUserFromAll ||
    (fallbackMember
      ? {
          id: fallbackMember.id,
          name: fallbackMember.name,
          username:
            fallbackMember.username ||
            fallbackMember.name.toLowerCase().replace(/\s+/g, '_'),
          musicianCode: fallbackMember.musicianCode,
          email: fallbackMember.email,
          password: '',
          instruments: fallbackMember.instruments,
          avatarInitials: fallbackMember.avatarInitials,
          avatarUrl: fallbackMember.avatarUrl,
          availableForSub: true,
          friendIds: [],
          createdAt: '',
        }
      : currentUser);

  const isOwnProfile = viewedUser.id === currentUser.id;
  const viewedUserCode = getMusicianCode(viewedUser);

  // Active groups where viewedUser participates (excluding groups where they are only a temporary guest, or labeling it clearly)
  const viewedUserGroups = groups.filter((g) =>
    g.members.some((m) => m.id === viewedUser.id)
  );

  // Friends of viewedUser
  const viewedUserFriendIds = new Set<string>(viewedUser.friendIds || []);
  friendRequests.forEach((req) => {
    if (req.status === 'accepted') {
      if (req.fromUserId === viewedUser.id) viewedUserFriendIds.add(req.toUserId);
      if (req.toUserId === viewedUser.id) viewedUserFriendIds.add(req.fromUserId);
    }
  });
  const viewedUserFriends = allUsers.filter(
    (u) => u.id !== viewedUser.id && viewedUserFriendIds.has(u.id)
  );

  // Friendship status between currentUser and viewedUser
  const isMyFriend = friends.some((f) => f.id === viewedUser.id);
  const incomingPendingReq = friendRequests.find(
    (r) =>
      r.status === 'pending' &&
      r.fromUserId === viewedUser.id &&
      r.toUserId === currentUser.id
  );
  const outgoingPendingReq = friendRequests.find(
    (r) =>
      r.status === 'pending' &&
      r.fromUserId === currentUser.id &&
      r.toUserId === viewedUser.id
  );

  const incomingAllRequests = friendRequests.filter(
    (r) => r.status === 'pending' && r.toUserId === currentUser.id
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingActiveGroupEvents: WorshipEvent[] = [...activeGroup.events]
    .filter((ev) => ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const viewedMemberInMyActiveGroup: BandMember | undefined =
    activeGroup.members.find((m) => m.id === viewedUser.id);

  const handleOpenProfileOf = (targetUserId: string) => {
    setViewedUserId(targetUserId);
    setActiveModalTab('perfil');
    setShowConvokePanel(false);
    setIsEditingMyProfile(false);
    setFeedbackMsg(null);
    const targetObj = allUsers.find((u) => u.id === targetUserId);
    if (targetObj && targetObj.instruments.length > 0) {
      setSelectedRole(targetObj.instruments[0]);
    }
  };

  const handleCopyMusicianCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSaveMyProfileChanges = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateMyProfile({
      bio: editBio.trim(),
      cityOrChurch: editCityOrChurch.trim(),
      availableForSub: editAvailableForSub,
      instruments:
        editInstruments.length > 0 ? editInstruments : currentUser.instruments,
    });
    setIsEditingMyProfile(false);
    setFeedbackMsg({
      ok: true,
      text: '¡Tu Perfil de Músico se actualizó correctamente!',
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 200);
      onUpdateMyProfile({ avatarUrl: compressed });
      setFeedbackMsg({ ok: true, text: 'Foto de perfil actualizada.' });
    } catch {
      setFeedbackMsg({
        ok: false,
        text: 'No se pudo procesar la imagen seleccionada.',
      });
    }
  };

  const toggleEditInstrument = (inst: InstrumentRole) => {
    setEditInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  };

  const handleConfirmConvokeOrAdd = () => {
    const roleToUse =
      selectedRole || viewedUser.instruments[0] || 'Guitarra eléctrica';

    if (selectedEventId && selectedEventId !== 'directory_only') {
      const res = onConvokeMusicianToEvent(
        viewedUser,
        selectedEventId,
        roleToUse
      );
      setFeedbackMsg({ ok: res.ok, text: res.message });
      if (res.ok) setShowConvokePanel(false);
      return;
    }

    const res = onAddMusicianToGroup(
      viewedUser,
      inviteAsGuestPass,
      roleToUse
    );
    setFeedbackMsg({ ok: res.ok, text: res.message });
    if (res.ok) setShowConvokePanel(false);
  };

  // Filtered musicians in Explore tab
  const filteredExploreMusicians = allUsers.filter((u) => {
    if (u.id === currentUser.id) return false;
    const code = getMusicianCode(u).toLowerCase();
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    const matchesSearch =
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      code.includes(q) ||
      (u.cityOrChurch || '').toLowerCase().includes(q) ||
      (u.bio || '').toLowerCase().includes(q) ||
      (u.instruments || []).some((i) => i.toLowerCase().includes(q));

    const matchesInst =
      instrumentFilter === 'all' ||
      (u.instruments || []).includes(instrumentFilter as InstrumentRole);

    const matchesSub =
      !onlyAvailableSubFilter || (u.availableForSub ?? true);

    return matchesSearch && matchesInst && matchesSub;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* CABECERA SUPERIOR CON NAVEGACIÓN DE LA RED DE MÚSICOS */}
        <div className="px-4 sm:px-6 pt-4 pb-3 bg-slate-900 text-white border-b border-slate-800 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {!isOwnProfile && activeModalTab === 'perfil' ? (
                <button
                  type="button"
                  onClick={() => handleOpenProfileOf(currentUser.id)}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mi Perfil</span>
                </button>
              ) : (
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent.bgClass}`}
                >
                  <Users className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  {activeModalTab === 'perfil'
                    ? isOwnProfile
                      ? 'Mi Perfil de Músico'
                      : `Perfil de ${viewedUser.name}`
                    : activeModalTab === 'amigos'
                    ? 'Mis Amigos y Solicitudes'
                    : 'Comunidad y Buscador de Músicos'}
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  Red social de músicos · Conecta, chatea e invita suplentes a tus eventos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              aria-label="Cerrar perfil"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Pestañas principales: Perfil | Mis Amigos | Explorar Músicos */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-950/80 border border-white/5">
            <button
              type="button"
              onClick={() => setActiveModalTab('perfil')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeModalTab === 'perfil'
                  ? `${accent.bgClass} shadow-xs`
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isOwnProfile ? 'Mi Perfil' : `@${viewedUser.username}`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModalTab('amigos')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all relative ${
                activeModalTab === 'amigos'
                  ? `${accent.bgClass} shadow-xs`
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Amigos ({friends.length})</span>
              {incomingAllRequests.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-mono">
                  {incomingAllRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveModalTab('explorar')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeModalTab === 'explorar'
                  ? `${accent.bgClass} shadow-xs`
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Explorar Red</span>
            </button>
          </div>
        </div>

        {/* MENSAJE DE FEEDBACK GLOBAL */}
        {feedbackMsg && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2 border-b ${
              feedbackMsg.ok
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="opacity-75 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* CONTENIDO DESPLAZABLE */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeModalTab === 'perfil' && (
            <>
              {/* TARJETA PRINCIPAL DEL PERFIL DE MÚSICO (ESTILO RED SOCIAL) */}
              <div className="rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Avatar con opción de cambiar foto si es tu perfil */}
                    <div className="relative shrink-0">
                      <div
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-bold shadow-md overflow-hidden border-2 border-amber-500/40 ${accent.bgClass}`}
                      >
                        {viewedUser.avatarUrl ? (
                          <img
                            src={viewedUser.avatarUrl}
                            alt={viewedUser.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          viewedUser.avatarInitials
                        )}
                      </div>
                      {isOwnProfile && (
                        <>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-slate-900 text-white border border-white/20 flex items-center justify-center shadow-md hover:bg-slate-800"
                            title="Cambiar foto de perfil"
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Nombre, @username, ID JST-XXXX y Disponibilidad */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                          {viewedUser.name}
                        </h3>
                        {(viewedUser.availableForSub ?? true) && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Disponible para Suplencias
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          @{viewedUser.username}
                        </span>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => handleCopyMusicianCode(viewedUserCode)}
                          className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-700 font-mono text-[11px] font-bold text-slate-800 dark:text-amber-300 inline-flex items-center gap-1 transition-colors"
                          title="Copiar ID de Músico"
                        >
                          {copiedCode ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>{viewedUserCode}</span>
                            </>
                          )}
                        </button>
                      </div>

                      {viewedUser.cityOrChurch && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{viewedUser.cityOrChurch}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Contadores rápidos estilo Red Social */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700/70 text-center shrink-0">
                    <div className="px-3 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-white">
                        {viewedUser.instruments.length}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        Instrumentos
                      </p>
                    </div>
                    <div className="px-3 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-white">
                        {viewedUserGroups.length}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        Grupos
                      </p>
                    </div>
                    <div className="px-3 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <p className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-white">
                        {viewedUserFriends.length}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        Amigos
                      </p>
                    </div>
                  </div>
                </div>

                {/* Biografía del músico */}
                {viewedUser.bio ? (
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                    {viewedUser.bio}
                  </p>
                ) : isOwnProfile && !isEditingMyProfile ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    Agrega una breve biografía musical, tu iglesia o ciudad para que otros músicos y líderes te conozcan.
                  </p>
                ) : null}

                {/* BARRA DE ACCIONES PRINCIPALES DEL PERFIL */}
                {isOwnProfile ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingMyProfile((prev) => !prev)}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${accent.bgClass}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>
                        {isEditingMyProfile
                          ? 'Cancelar Edición'
                          : 'Editar Mi Perfil de Músico'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModalTab('explorar')}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Buscar y Agregar Amigos</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* 1. Botón directo para Chatear (DM) */}
                      <button
                        type="button"
                        onClick={() => {
                          onOpenDirectMessageWithUser(viewedUser);
                          onClose();
                        }}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Chatear (Mensaje Directo)</span>
                      </button>

                      {/* 2. Botón directo para Invitar a un Evento de mi grupo como Suplente / Invitado */}
                      <button
                        type="button"
                        onClick={() => {
                          if (viewedUser.instruments.length > 0) {
                            setSelectedRole(viewedUser.instruments[0]);
                          }
                          if (upcomingActiveGroupEvents.length > 0) {
                            setSelectedEventId(upcomingActiveGroupEvents[0].id);
                          } else {
                            setSelectedEventId('directory_only');
                          }
                          setShowConvokePanel((prev) => !prev);
                        }}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>Invitar como Suplente / Evento</span>
                      </button>

                      {/* 3. Botón de Amistad */}
                      {isMyFriend ? (
                        <div className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5">
                          <UserCheck className="w-4 h-4" />
                          <span>Amigos en tu Red</span>
                        </div>
                      ) : incomingPendingReq ? (
                        <button
                          type="button"
                          onClick={() => {
                            onRespondFriendRequest(incomingPendingReq.id, true);
                            setFeedbackMsg({
                              ok: true,
                              text: `¡Ahora tú y @${viewedUser.username} son amigos!`,
                            });
                          }}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Aceptar Solicitud de Amistad</span>
                        </button>
                      ) : outgoingPendingReq ? (
                        <div className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5">
                          <span>Solicitud de Amistad Enviada</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const res = onSendFriendRequest(viewedUser);
                            setFeedbackMsg({ ok: res.ok, text: res.message });
                          }}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <UserPlus className="w-4 h-4 text-indigo-500" />
                          <span>Agregar a Amigos</span>
                        </button>
                      )}
                    </div>

                    {/* PANEL DESPLEGABLE PARA CONVOCAR A EVENTO O AGREGAR COMO SUPLENTE DESDE EL PERFIL */}
                    {showConvokePanel && (
                      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-2 border-amber-500/40 space-y-3 shadow-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-amber-500" />
                              <span>
                                Convocar a {viewedUser.name} en «
                                {activeGroup.identity.ministryName}»
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Como Suplente / Invitado solo verá el evento donde lo asignes y las canciones de esa fecha.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowConvokePanel(false)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {userRoleInActiveGroup !== 'leader' && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300">
                            Nota: En tu grupo activo («{activeGroup.identity.ministryName}») puedes agregarlo o sugerirlo para las fechas próximas.
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              1. Fecha / Evento a cubrir
                            </label>
                            <select
                              value={selectedEventId}
                              onChange={(e) => setSelectedEventId(e.target.value)}
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                            >
                              {upcomingActiveGroupEvents.map((ev) => (
                                <option key={ev.id} value={ev.id}>
                                  📅 {ev.date} · {ev.title} (Cit: {ev.callTime})
                                </option>
                              ))}
                              <option value="directory_only">
                                📁 Solo guardar en el Directorio de Miembros / Suplentes
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              2. Instrumento / Rol asignado
                            </label>
                            <select
                              value={selectedRole}
                              onChange={(e) =>
                                setSelectedRole(e.target.value as InstrumentRole)
                              }
                              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                            >
                              {Array.from(
                                new Set([
                                  ...(viewedUser.instruments || []),
                                  ...ALL_INSTRUMENT_ROLES,
                                ])
                              ).map((role) => (
                                <option key={role} value={role}>
                                  {viewedUser.instruments.includes(role)
                                    ? `⭐ ${role} (Su instrumento)`
                                    : role}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {selectedEventId === 'directory_only' && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setInviteAsGuestPass(true)}
                              className={`p-2.5 rounded-xl border text-left transition-all ${
                                inviteAsGuestPass
                                  ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              <p className="text-xs font-bold">
                                Pase de Suplente / Invitado
                              </p>
                              <p className="text-[10px] opacity-80">
                                Solo ve eventos donde sea convocado
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setInviteAsGuestPass(false)}
                              className={`p-2.5 rounded-xl border text-left transition-all ${
                                !inviteAsGuestPass
                                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500'
                              }`}
                            >
                              <p className="text-xs font-bold">Miembro Titular</p>
                              <p className="text-[10px] opacity-80">
                                Ve todo el repertorio, chat y estudios
                              </p>
                            </button>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowConvokePanel(false)}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmConvokeOrAdd}
                            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {selectedEventId !== 'directory_only'
                                ? 'Confirmar Convocatoria al Evento'
                                : inviteAsGuestPass
                                ? 'Agregar como Suplente'
                                : 'Agregar como Miembro Titular'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* FORMULARIO PARA EDITAR MI PROPIO PERFIL */}
                {isOwnProfile && isEditingMyProfile && (
                  <form
                    onSubmit={handleSaveMyProfileChanges}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3.5"
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500">
                      Editar Datos de Mi Perfil Social
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Iglesia / Ciudad o Ministerio Base
                        </label>
                        <input
                          type="text"
                          value={editCityOrChurch}
                          onChange={(e) => setEditCityOrChurch(e.target.value)}
                          placeholder="Ej: Monterrey · Iglesia Vida Nueva"
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Estado para Invitaciones de Otros Grupos
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setEditAvailableForSub((prev) => !prev)
                          }
                          className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors ${
                            editAvailableForSub
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <span>Disponible para Suplencias / Eventos</span>
                          <span>{editAvailableForSub ? 'SÍ ✓' : 'NO'}</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Biografía Musical / Equipo / Experiencia
                      </label>
                      <textarea
                        rows={2}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Ej: Guitarrista y director musical. Manejo secuencias en Ableton, lectura de cifrado Nashville e in-ears."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Mis Instrumentos y Roles ({editInstruments.length})
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_INSTRUMENT_ROLES.map((inst) => {
                          const selected = editInstruments.includes(inst);
                          return (
                            <button
                              key={inst}
                              type="button"
                              onClick={() => toggleEditInstrument(inst)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                selected
                                  ? `${accent.bgClass} border-transparent`
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {selected ? `✓ ${inst}` : inst}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingMyProfile(false)}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-bold ${accent.bgClass}`}
                      >
                        Guardar Cambios
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* FILA DE DETALLES: INSTRUMENTOS + GRUPOS ACTIVOS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Instrumentos que toca */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-amber-500" />
                      <span>Instrumentos y Roles</span>
                    </h4>
                    {viewedMemberInMyActiveGroup && !isOwnProfile && (
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          viewedMemberInMyActiveGroup.isGuest
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {viewedMemberInMyActiveGroup.isGuest
                          ? 'Suplente en tu grupo'
                          : 'Titular en tu grupo'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(viewedUser.instruments || []).map((inst) => (
                      <span
                        key={inst}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.softBgClass}`}
                      >
                        <Music className="w-3 h-3" />
                        <span>{inst}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Grupos activos del músico */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Grupos Activos ({viewedUserGroups.length})</span>
                  </h4>

                  {viewedUserGroups.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Actualmente sin grupos públicos registrados.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {viewedUserGroups.map((grp) => {
                        const memberRec = grp.members.find(
                          (m) => m.id === viewedUser.id
                        );
                        const isGrpLeader =
                          grp.leaderUserId === viewedUser.id ||
                          memberRec?.role === 'leader';
                        const isGrpGuest = Boolean(memberRec?.isGuest);
                        const grpAccent = getAccentClasses(
                          grp.identity.accentColor
                        );

                        return (
                          <div
                            key={grp.id}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${grpAccent.bgClass}`}
                              >
                                <BrandIconDisplay
                                  iconId={grp.identity.iconId}
                                  customImageUrl={grp.identity.customImageUrl}
                                  className={
                                    grp.identity.customImageUrl
                                      ? 'w-full h-full'
                                      : 'w-4 h-4'
                                  }
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {grp.identity.ministryName}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {(memberRec?.instruments || [])
                                    .slice(0, 2)
                                    .join(', ') || 'Músico'}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                                isGrpLeader
                                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                  : isGrpGuest
                                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {isGrpLeader
                                ? 'Líder'
                                : isGrpGuest
                                ? 'Suplente'
                                : 'Titular'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* RED DE AMIGOS DE ESTE MÚSICO (NAVEGABLE COMO RED SOCIAL) */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    <span>
                      {isOwnProfile
                        ? `Mis Amigos Músicos (${viewedUserFriends.length})`
                        : `Amigos de ${viewedUser.name} (${viewedUserFriends.length})`}
                    </span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('explorar')}
                    className={`text-xs font-bold ${accent.textClass} hover:underline`}
                  >
                    + Explorar más músicos
                  </button>
                </div>

                {viewedUserFriends.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isOwnProfile
                        ? 'Aún no has agregado amigos a tu perfil. Explora la red para conectar con otros músicos.'
                        : `${viewedUser.name} aún no tiene amigos visibles en su lista.`}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {viewedUserFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenProfileOf(friend.id)}
                          className="flex items-center gap-2.5 min-w-0 text-left flex-1 group"
                        >
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 overflow-hidden">
                            {friend.avatarUrl ? (
                              <img
                                src={friend.avatarUrl}
                                alt={friend.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              friend.avatarInitials
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-500 truncate transition-colors">
                              {friend.name}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              @{friend.username} ·{' '}
                              {friend.instruments?.[0] || 'Músico'}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenProfileOf(friend.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-[11px] font-bold text-slate-800 dark:text-slate-200"
                          >
                            Perfil
                          </button>
                          {friend.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenDirectMessageWithUser(friend);
                                onClose();
                              }}
                              className="p-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400"
                              title="Chatear por DM"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeModalTab === 'amigos' && (
            <div className="space-y-5">
              {/* Solicitudes de amistad pendientes */}
              {incomingAllRequests.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Solicitudes de Amistad Recibidas ({incomingAllRequests.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {incomingAllRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenProfileOf(req.fromUserId)}
                          className="flex items-center gap-2.5 min-w-0 text-left"
                        >
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {req.fromAvatarInitials ||
                              req.fromName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {req.fromName}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              @{req.fromUsername} ·{' '}
                              {(req.fromInstruments || [])[0] || 'Músico'}
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onRespondFriendRequest(req.id, true)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                          >
                            Aceptar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onRespondFriendRequest(req.id, false)
                            }
                            className="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista completa de Amigos con acciones rápidas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Tu Red de Amigos ({friends.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('explorar')}
                    className={`text-xs font-bold ${accent.textClass} flex items-center gap-1`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Amigo</span>
                  </button>
                </div>

                {friends.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                    <Users className="w-8 h-8 text-indigo-500 mx-auto" />
                    <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Aún no tienes músicos en tu lista de amigos
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      Agrega amigos de tu banda o de otras iglesias para ver sus perfiles, chatear por mensaje directo y convocarlos como suplentes cuando alguien falte.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveModalTab('explorar')}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${accent.bgClass}`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Explorar Músicos</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenProfileOf(friend.id)}
                            className="flex items-center gap-3 min-w-0 text-left group"
                          >
                            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                              {friend.avatarUrl ? (
                                <img
                                  src={friend.avatarUrl}
                                  alt={friend.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                friend.avatarInitials
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-500 truncate">
                                {friend.name}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                @{friend.username} · {getMusicianCode(friend)}
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                {(friend.instruments || []).join(', ')}
                              </p>
                            </div>
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenProfileOf(friend.id)}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500/50"
                          >
                            Ver Perfil
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenDirectMessageWithUser(friend);
                              onClose();
                            }}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Chatear</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenProfileOf(friend.id);
                              setShowConvokePanel(true);
                            }}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>+ Suplente</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeModalTab === 'explorar' && (
            <div className="space-y-4">
              {/* Agregar directo por @usuario o ID JST-XXXX */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Conectar directo por @usuario, correo o ID (JST-XXXX)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directCodeInput}
                    onChange={(e) => setDirectCodeInput(e.target.value)}
                    placeholder="Ej: @carlos_bateria o JST-4821"
                    className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!directCodeInput.trim()) return;
                      const res = onSendFriendRequest(directCodeInput.trim());
                      setFeedbackMsg({ ok: res.ok, text: res.message });
                      if (res.ok) setDirectCodeInput('');
                    }}
                    className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 ${accent.bgClass}`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Enviar Solicitud</span>
                  </button>
                </div>
              </div>

              {/* Buscador y filtros del directorio global */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar músico por nombre, instrumento, ciudad..."
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={instrumentFilter}
                    onChange={(e) => setInstrumentFilter(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="all">Todos los instrumentos</option>
                    {ALL_INSTRUMENT_ROLES.map((inst) => (
                      <option key={inst} value={inst}>
                        {inst}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOnlyAvailableSubFilter((prev) => !prev)
                    }
                    className={`w-full min-h-[40px] px-2.5 py-2 rounded-xl border text-[11px] font-bold transition-colors ${
                      onlyAvailableSubFilter
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {onlyAvailableSubFilter ? '✓ Suplentes' : 'Suplentes'}
                  </button>
                </div>
              </div>

              {/* Resultados de músicos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredExploreMusicians.length === 0 ? (
                  <div className="col-span-full p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 dark:text-slate-400">
                    No se encontraron otros músicos registrados con ese filtro.
                  </div>
                ) : (
                  filteredExploreMusicians.map((musician) => {
                    const isFriend = friends.some((f) => f.id === musician.id);
                    const mGroupsCount = groups.filter((g) =>
                      g.members.some((m) => m.id === musician.id)
                    ).length;

                    return (
                      <div
                        key={musician.id}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenProfileOf(musician.id)}
                            className="flex items-center gap-3 min-w-0 text-left group"
                          >
                            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                              {musician.avatarUrl ? (
                                <img
                                  src={musician.avatarUrl}
                                  alt={musician.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                musician.avatarInitials
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-500 truncate">
                                  {musician.name}
                                </p>
                                {(musician.availableForSub ?? true) && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Disponible para suplencias" />
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                @{musician.username} · {getMusicianCode(musician)}
                              </p>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                                {(musician.instruments || []).join(', ')} ·{' '}
                                {mGroupsCount}{' '}
                                {mGroupsCount === 1 ? 'grupo' : 'grupos'}
                              </p>
                            </div>
                          </button>

                          {isFriend && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                              Amigo
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenProfileOf(musician.id)}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-amber-500/50"
                          >
                            Ver Perfil
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenDirectMessageWithUser(musician);
                              onClose();
                            }}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Chatear</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenProfileOf(musician.id);
                              setShowConvokePanel(true);
                            }}
                            className="min-h-[34px] px-2 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1"
                          >
                            <Calendar className="w-3 h-3" />
                            <span>+ Suplente</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
