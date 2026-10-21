import React, { useRef, useState } from 'react';
import {
  ALL_INSTRUMENT_ROLES,
  AccentColorId,
  AppIdentity,
  AppUser,
  BrandIconId,
  InstrumentRole,
  MAX_GROUPS_PER_USER,
  WorshipGroup,
} from '../types';
import {
  ACCENT_COLORS,
  BRAND_ICON_OPTIONS,
  BrandIconDisplay,
  GuitarPickCrossIcon,
  compressImageFileToDataUrl,
  getAccentClasses,
} from './IdentityModal';
import {
  ArrowRight,
  AtSign,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderPlus,
  ImagePlus,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Plus,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface AuthOnboardingModalProps {
  isOpen: boolean;
  canClose: boolean;
  onClose: () => void;
  identity: AppIdentity;
  users: AppUser[];
  currentUser: AppUser | null;
  groups: WorshipGroup[];
  activeGroupId: string;
  onLoginUser: (userId: string) => void;
  onRegisterStandardUser: (data: {
    name: string;
    username: string;
    email: string;
    password: string;
    instruments: InstrumentRole[];
    avatarUrl?: string;
  }) => { ok: boolean; error?: string };
  onUpdateUserAvatar?: (avatarUrl: string | undefined) => void;
  onUpdateUserInstruments?: (instruments: InstrumentRole[]) => void;
  onLogout: () => void;
  onCreateGroup: (data: {
    ministryName: string;
    iconId: BrandIconId;
    customImageUrl?: string;
    accentColor: AccentColorId;
  }) => { ok: boolean; error?: string };
  onJoinGroupByCodeOrInvite: (codeOrGroupId: string) => {
    ok: boolean;
    error?: string;
  };
  onSelectGroup: (groupId: string) => void;
}

export const AuthOnboardingModal: React.FC<AuthOnboardingModalProps> = ({
  isOpen,
  canClose,
  onClose,
  identity,
  users,
  currentUser,
  groups,
  activeGroupId,
  onLoginUser,
  onRegisterStandardUser,
  onUpdateUserAvatar,
  onUpdateUserInstruments,
  onLogout,
  onCreateGroup,
  onJoinGroupByCodeOrInvite,
  onSelectGroup,
}) => {
  const accent = getAccentClasses(identity.accentColor);
  const [customRegInstrument, setCustomRegInstrument] = useState('');
  const [showProfileInstrumentsEditor, setShowProfileInstrumentsEditor] = useState(false);
  const [customProfileInstrument, setCustomProfileInstrument] = useState('');

  // Auth tabs (only when not logged in): 'login' | 'register'
  const [authTab, setAuthTab] = useState<'login' | 'register'>(() =>
    users.length > 0 ? 'login' : 'register'
  );

  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Standard Registration State
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAvatarUrl, setRegAvatarUrl] = useState<string | undefined>(undefined);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [selectedInstruments, setSelectedInstruments] = useState<InstrumentRole[]>([
    'Vocalista líder',
  ]);
  const [regError, setRegError] = useState<string | null>(null);

  // Group Hub State (when logged in)
  const [groupHubTab, setGroupHubTab] = useState<'my_groups' | 'create_group' | 'join_group'>(
    'my_groups'
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState<BrandIconId>('pick_cross');
  const [newGroupImageUrl, setNewGroupImageUrl] = useState<string | undefined>(undefined);
  const [newGroupColor, setNewGroupColor] = useState<AccentColorId>('amber');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [groupActionError, setGroupActionError] = useState<string | null>(null);

  const regAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const currentUserAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const newGroupPhotoInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const toggleInstrument = (inst: InstrumentRole) => {
    setSelectedInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  };

  const handleRegAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 180);
      setRegAvatarUrl(dataUrl);
    } catch {
      // ignore invalid file
    }
  };

  const handleCurrentUserAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateUserAvatar) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 180);
      onUpdateUserAvatar(dataUrl);
    } catch {
      // ignore invalid file
    }
  };

  const handleNewGroupPhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 180);
      setNewGroupImageUrl(dataUrl);
    } catch {
      // ignore invalid file
    }
  };

  // ============================================================================
  // 1. VISTA DE INICIO DE SESIÓN / REGISTRO SIMPLE (CUENTA ESTÁNDAR EN LA APP)
  // ============================================================================
  if (!currentUser) {
    const handleLoginSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const cleanId = loginIdentifier.trim().toLowerCase().replace(/^@/, '');
      if (!cleanId || !loginPassword) return;

      const matchedUser = users.find(
        (u) =>
          u.email.toLowerCase() === cleanId ||
          u.username.toLowerCase() === cleanId
      );

      if (!matchedUser) {
        setLoginError(
          'No existe ninguna cuenta con ese correo o nombre de usuario. Regístrate en la pestaña "Crear Cuenta".'
        );
        return;
      }

      if (matchedUser.password !== loginPassword) {
        setLoginError('Contraseña incorrecta. Inténtalo de nuevo.');
        return;
      }

      setLoginError(null);
      onLoginUser(matchedUser.id);
    };

    const handleRegisterSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const cleanUsername = regUsername
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/\s+/g, '_');
      if (!regName.trim() || !cleanUsername || !regEmail.trim() || !regPassword) {
        setRegError('Por favor completa todos los campos obligatorios.');
        return;
      }
      if (regPassword.length < 4) {
        setRegError('La contraseña debe tener al menos 4 caracteres.');
        return;
      }

      const res = onRegisterStandardUser({
        name: regName.trim(),
        username: cleanUsername,
        email: regEmail.trim().toLowerCase(),
        password: regPassword,
        instruments:
          selectedInstruments.length > 0
            ? selectedInstruments
            : ['Vocalista líder'],
        avatarUrl: regAvatarUrl,
      });

      if (!res.ok) {
        setRegError(res.error || 'No se pudo registrar la cuenta.');
        return;
      }

      setRegError(null);
      setRegName('');
      setRegUsername('');
      setRegEmail('');
      setRegPassword('');
      setRegAvatarUrl(undefined);
    };

    return (
      <div className="min-h-screen w-full bg-black text-slate-100 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
          {/* Cabecera con el icono oficial de Púa de Guitarra con Cruz */}
          <div className="p-6 bg-black text-white border-b border-slate-800 text-center space-y-2">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg mx-auto ${accent.bgClass}`}
            >
              <GuitarPickCrossIcon className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              jesustone
            </h1>
            <p className="text-xs text-slate-400">
              Inicia sesión o crea tu cuenta en la aplicación
            </p>
          </div>

          {/* Dos Pestañas Simples: Iniciar Sesión | Crear Cuenta */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setLoginError(null);
              }}
              className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                authTab === 'login'
                  ? `${accent.bgClass} shadow-md`
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Iniciar Sesión</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setRegError(null);
              }}
              className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                authTab === 'register'
                  ? `${accent.bgClass} shadow-md`
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Crear Cuenta</span>
            </button>
          </div>

          {/* FORMULARIO 1: INICIAR SESIÓN */}
          {authTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Correo Electrónico o Nombre de Usuario
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => {
                      setLoginIdentifier(e.target.value);
                      setLoginError(null);
                    }}
                    placeholder="correo@ejemplo.com o @usuario"
                    className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setLoginError(null);
                    }}
                    placeholder="••••••••"
                    className="w-full min-h-[48px] pl-10 pr-11 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                className={`w-full min-h-[52px] py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 ${accent.bgClass}`}
              >
                <LogIn className="w-4 h-4" />
                <span>Ingresar a mi Cuenta</span>
              </button>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400 pt-1">
                ¿Aún no tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => setAuthTab('register')}
                  className={`font-bold hover:underline ${accent.textClass}`}
                >
                  Regístrate aquí
                </button>
              </p>
            </form>
          ) : (
            /* FORMULARIO 2: REGISTRARSE (CON FOTO DE PERFIL OPCIONAL) */
            <form
              onSubmit={handleRegisterSubmit}
              className="p-6 space-y-4 max-h-[75vh] overflow-y-auto"
            >
              {/* Selector de Foto de Perfil */}
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-base overflow-hidden shrink-0 ${accent.bgClass}`}
                >
                  {regAvatarUrl ? (
                    <img
                      src={regAvatarUrl}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Tu Foto de Perfil (Opcional)
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Elige una imagen para tu cuenta
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      ref={regAvatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleRegAvatarChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => regAvatarInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 hover:opacity-90"
                    >
                      {regAvatarUrl ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                    {regAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setRegAvatarUrl(undefined)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-500 text-xs font-bold"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Ej. Daniel Morales"
                  className="w-full min-h-[46px] px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre de Usuario *
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="daniel_morales"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Correo Electrónico *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Contraseña *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full min-h-[46px] pl-10 pr-11 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showRegPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tus Instrumentos o Roles Musicales (Puedes elegir varios)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.from(
                    new Set([...ALL_INSTRUMENT_ROLES, ...selectedInstruments])
                  ).map((inst) => {
                    const active = selectedInstruments.includes(inst);
                    return (
                      <button
                        key={inst}
                        type="button"
                        onClick={() => toggleInstrument(inst)}
                        className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                          active
                            ? `${accent.bgClass} border-transparent`
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {active ? '✓ ' : ''}
                        {inst}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={customRegInstrument}
                    onChange={(e) => setCustomRegInstrument(e.target.value)}
                    placeholder="Agregar otro instrumento/rol personalizado..."
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = customRegInstrument.trim();
                      if (!clean) return;
                      if (!selectedInstruments.includes(clean)) {
                        setSelectedInstruments((prev) => [...prev, clean]);
                      }
                      setCustomRegInstrument('');
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold"
                  >
                    + Añadir
                  </button>
                </div>
              </div>

              {regError && (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {regError}
                </p>
              )}

              <button
                type="submit"
                className={`w-full min-h-[52px] py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 ${accent.bgClass}`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Crear Cuenta y Entrar</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. VISTA YA CON CUENTA INICIADA: MIS GRUPOS (LÍMITE DE 6) / CREAR O UNIRSE
  // ============================================================================
  const myGroups = groups.filter((g) =>
    g.members.some((m) => m.id === currentUser.id)
  );
  const hasReachedLimit = myGroups.length >= MAX_GROUPS_PER_USER;

  // Pending invitations sent to this user's email or username across any group they haven't joined yet
  const pendingInvitationsForMe = groups.flatMap((g) => {
    const alreadyMember = g.members.some((m) => m.id === currentUser.id);
    if (alreadyMember) return [];
    return g.invitations
      .filter(
        (inv) =>
          inv.email.toLowerCase() === currentUser.email.toLowerCase() ||
          inv.username?.toLowerCase() === currentUser.username.toLowerCase() ||
          inv.identifier.toLowerCase().replace(/^@/, '') ===
            currentUser.username.toLowerCase()
      )
      .map((inv) => ({ group: g, invitation: inv }));
  });

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const res = onCreateGroup({
      ministryName: newGroupName.trim(),
      iconId: newGroupIcon,
      customImageUrl: newGroupImageUrl,
      accentColor: newGroupColor,
    });
    if (!res.ok) {
      setGroupActionError(res.error || 'No se pudo crear el grupo.');
      return;
    }
    setGroupActionError(null);
    setNewGroupName('');
    setNewGroupImageUrl(undefined);
    setGroupHubTab('my_groups');
    onClose();
  };

  const handleJoinByCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    const res = onJoinGroupByCodeOrInvite(joinCodeInput.trim());
    if (!res.ok) {
      setGroupActionError(res.error || 'No se encontró un grupo con ese código.');
      return;
    }
    setGroupActionError(null);
    setJoinCodeInput('');
    setGroupHubTab('my_groups');
    onClose();
  };

  return (
    <div
      className={
        canClose
          ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto'
          : 'min-h-screen w-full bg-black text-slate-100 flex items-center justify-center p-4 sm:p-6 overflow-y-auto'
      }
    >
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Cabecera del Usuario con Foto de Perfil Editable y Contador de Grupos (Máx 6) */}
        <div className="p-6 bg-black text-white border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative group shrink-0">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-sm overflow-hidden ${accent.bgClass}`}
              >
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  currentUser.avatarInitials
                )}
              </div>
              {onUpdateUserAvatar && (
                <>
                  <input
                    ref={currentUserAvatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCurrentUserAvatarChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => currentUserAvatarInputRef.current?.click()}
                    className=" -bottom-1 -right-1 absolute w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-md hover:scale-105 transition-transform"
                    title="Cambiar foto de perfil"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white">
                  {currentUser.name}
                </h2>
                <span className="text-xs font-mono text-amber-400">
                  @{currentUser.username}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {currentUser.email} ·{' '}
                <strong className="text-white">
                  Grupos: {myGroups.length} / {MAX_GROUPS_PER_USER}
                </strong>
              </p>
              {onUpdateUserAvatar && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => currentUserAvatarInputRef.current?.click()}
                    className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    <span>
                      {currentUser.avatarUrl
                        ? 'Cambiar foto de perfil'
                        : 'Añadir foto de perfil'}
                    </span>
                  </button>
                  {currentUser.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => onUpdateUserAvatar(undefined)}
                      className="text-[11px] font-bold text-rose-400 hover:underline"
                    >
                      · Quitar foto
                    </button>
                  )}
                  {onUpdateUserInstruments && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowProfileInstrumentsEditor(!showProfileInstrumentsEditor)
                      }
                      className="text-[11px] font-bold text-emerald-400 hover:underline ml-1"
                    >
                      · Editar mis instrumentos ({currentUser.instruments.join(', ')})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar Sesión</span>
            </button>
            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Panel Desplegable para Editar Instrumentos y Roles del Perfil */}
        {showProfileInstrumentsEditor && onUpdateUserInstruments && (
          <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Mis Instrumentos y Roles Base (Puedes elegir más de uno):
              </span>
              <button
                type="button"
                onClick={() => setShowProfileInstrumentsEditor(false)}
                className="text-xs font-bold text-slate-400 hover:text-white"
              >
                Listo
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(
                new Set([...ALL_INSTRUMENT_ROLES, ...currentUser.instruments])
              ).map((role) => {
                const isSelected = currentUser.instruments.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      const next = isSelected
                        ? currentUser.instruments.filter((r) => r !== role)
                        : [...currentUser.instruments, role];
                      if (next.length > 0) {
                        onUpdateUserInstruments(next);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isSelected
                        ? `${accent.bgClass} border-transparent`
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {role}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customProfileInstrument}
                onChange={(e) => setCustomProfileInstrument(e.target.value)}
                placeholder="Otro rol o instrumento personalizado (ej. Metales, Violín, Danza, Proyección)..."
                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => {
                  const clean = customProfileInstrument.trim();
                  if (!clean) return;
                  if (!currentUser.instruments.includes(clean)) {
                    onUpdateUserInstruments([...currentUser.instruments, clean]);
                  }
                  setCustomProfileInstrument('');
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold ${accent.bgClass}`}
              >
                + Añadir
              </button>
            </div>
          </div>
        )}

        {/* Pestañas de Gestión de Grupos */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setGroupHubTab('my_groups');
              setGroupActionError(null);
            }}
            className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              groupHubTab === 'my_groups'
                ? `${accent.bgClass} shadow-sm`
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Mis Grupos ({myGroups.length}/{MAX_GROUPS_PER_USER})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setGroupHubTab('create_group');
              setGroupActionError(null);
            }}
            className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              groupHubTab === 'create_group'
                ? `${accent.bgClass} shadow-sm`
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <FolderPlus className="w-4 h-4 shrink-0" />
            <span className="truncate">Crear Grupo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setGroupHubTab('join_group');
              setGroupActionError(null);
            }}
            className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              groupHubTab === 'join_group'
                ? `${accent.bgClass} shadow-sm`
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Unirme a Grupo
              {pendingInvitationsForMe.length > 0
                ? ` (${pendingInvitationsForMe.length})`
                : ''}
            </span>
          </button>
        </div>

        {/* PESTAÑA 1: MIS GRUPOS (HASTA 6 GRUPOS) */}
        {groupHubTab === 'my_groups' && (
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {pendingInvitationsForMe.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Tienes invitaciones para unirte a un grupo
                </p>
                {pendingInvitationsForMe.map(({ group, invitation }) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {group.identity.ministryName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Invitado por {invitation.sentByLeaderName} · Rol sugerido:{' '}
                        <strong>{invitation.suggestedInstrument}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={hasReachedLimit}
                      onClick={() => {
                        const res = onJoinGroupByCodeOrInvite(group.id);
                        if (!res.ok) {
                          setGroupActionError(res.error || null);
                        } else {
                          onClose();
                        }
                      }}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold shrink-0 ${accent.bgClass} disabled:opacity-50`}
                    >
                      Aceptar y Entrar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {myGroups.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center space-y-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
                >
                  <GuitarPickCrossIcon className="w-7 h-7" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Bienvenido a jesustone, {currentUser.name.split(' ')[0]}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Aún no perteneces a ningún grupo. Si tocas en{' '}
                    <strong>Crear Grupo</strong> te convertirás automáticamente en el{' '}
                    <strong>Líder / Admin</strong> de ese grupo y podrás añadirle foto o icono e
                    invitar miembros por su <code>@usuario</code> o correo.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setGroupHubTab('create_group')}
                    className={`min-h-[52px] px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md ${accent.bgClass}`}
                  >
                    <Plus className="w-5 h-5" />
                    <span>Crear Grupo (Ser Líder)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupHubTab('join_group')}
                    className="min-h-[52px] px-5 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Unirme a un Grupo</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Selecciona un grupo activo ({myGroups.length} de {MAX_GROUPS_PER_USER})
                  </span>
                  {!hasReachedLimit && (
                    <button
                      type="button"
                      onClick={() => setGroupHubTab('create_group')}
                      className={`text-xs font-bold flex items-center gap-1 ${accent.textClass}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Crear otro grupo
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {myGroups.map((g) => {
                    const isSelected = g.id === activeGroupId;
                    const myMemberRecord = g.members.find(
                      (m) => m.id === currentUser.id
                    );
                    const amILeader =
                      g.leaderUserId === currentUser.id ||
                      myMemberRecord?.role === 'leader';
                    const groupAccent = getAccentClasses(g.identity.accentColor);

                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          onSelectGroup(g.id);
                          onClose();
                        }}
                        className={`min-h-[86px] p-4 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? `bg-white dark:bg-slate-800 ${groupAccent.borderClass} ring-2 ring-amber-500/30 shadow-md`
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden ${groupAccent.bgClass}`}
                          >
                            <BrandIconDisplay
                              iconId={g.identity.iconId}
                              customImageUrl={g.identity.customImageUrl}
                              className={
                                g.identity.customImageUrl
                                  ? 'w-full h-full'
                                  : 'w-6 h-6'
                              }
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {g.identity.ministryName}
                            </p>
                            <p
                              className={`text-xs font-bold mt-0.5 ${
                                amILeader
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-sky-600 dark:text-sky-400'
                              }`}
                            >
                              Tu rol: {amILeader ? 'Líder / Admin' : 'Miembro'}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono truncate">
                              {g.members.length} miembros · Código: {g.identity.inviteCode}
                            </p>
                          </div>
                        </div>

                        {isSelected ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                        ) : (
                          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 2: CREAR GRUPO (CON FOTO O ICONO DEL GRUPO) */}
        {groupHubTab === 'create_group' && (
          <form
            onSubmit={handleCreateGroupSubmit}
            className="p-6 space-y-5 max-h-[70vh] overflow-y-auto"
          >
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  Al crear este grupo serás su Líder / Admin
                </p>
                <p className="mt-0.5">
                  Puedes subir una <strong>foto personalizada</strong> o elegir un{' '}
                  <strong>icono</strong> para tu grupo.
                </p>
              </div>
            </div>

            {hasReachedLimit && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-600 dark:text-rose-400">
                Has alcanzado el límite máximo de {MAX_GROUPS_PER_USER} grupos por cuenta.
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Nombre del Grupo *
              </label>
              <input
                type="text"
                required
                disabled={hasReachedLimit}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ej. Jesustone Alabanza"
                className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-50"
              />
            </div>

            {/* Subir Foto para el Nuevo Grupo */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 ${
                    getAccentClasses(newGroupColor).bgClass
                  }`}
                >
                  {newGroupImageUrl ? (
                    <img
                      src={newGroupImageUrl}
                      alt="Foto del grupo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BrandIconDisplay iconId={newGroupIcon} className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    Foto o Imagen del Grupo (Opcional)
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sube una foto desde tu dispositivo o usa uno de los iconos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={newGroupPhotoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleNewGroupPhotoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={hasReachedLimit}
                  onClick={() => newGroupPhotoInputRef.current?.click()}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>{newGroupImageUrl ? 'Cambiar Foto' : 'Añadir Foto'}</span>
                </button>
                {newGroupImageUrl && (
                  <button
                    type="button"
                    onClick={() => setNewGroupImageUrl(undefined)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-500/15 text-rose-500 text-xs font-bold"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                O elige un Icono del Grupo
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                {BRAND_ICON_OPTIONS.map((item) => {
                  const isSelected = !newGroupImageUrl && newGroupIcon === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={hasReachedLimit}
                      onClick={() => {
                        setNewGroupIcon(item.id);
                        setNewGroupImageUrl(undefined);
                      }}
                      className={`min-h-[64px] flex flex-col items-center justify-center gap-1 p-2 rounded-2xl border text-xs font-bold transition-all ${
                        isSelected
                          ? `${accent.borderClass} ${accent.softBgClass} ring-2 ring-amber-500/30`
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <BrandIconDisplay iconId={item.id} className="w-5 h-5" />
                      <span className="text-[10px] text-center leading-tight">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                Color del Tema del Grupo
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    disabled={hasReachedLimit}
                    onClick={() => setNewGroupColor(color.id)}
                    className={`min-h-[48px] px-3.5 py-2 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                      newGroupColor === color.id
                        ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full ${color.swatchClass}`} />
                    <span>{color.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {groupActionError && (
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                {groupActionError}
              </p>
            )}

            <button
              type="submit"
              disabled={hasReachedLimit}
              className={`w-full min-h-[52px] py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center justify-center gap-2 ${accent.bgClass} disabled:opacity-50`}
            >
              <FolderPlus className="w-5 h-5" />
              <span>Crear Grupo como Líder / Admin</span>
            </button>
          </form>
        )}

        {/* PESTAÑA 3: UNIRSE A UN GRUPO POR INVITACIÓN O CÓDIGO */}
        {groupHubTab === 'join_group' && (
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            {hasReachedLimit && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-600 dark:text-rose-400">
                Has alcanzado el límite máximo de {MAX_GROUPS_PER_USER} grupos por cuenta.
              </div>
            )}

            {/* Invitaciones recibidas a mi @usuario o correo */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Invitaciones enviadas a @{currentUser.username} o {currentUser.email}
              </label>
              {pendingInvitationsForMe.length > 0 ? (
                <div className="space-y-2.5">
                  {pendingInvitationsForMe.map(({ group, invitation }) => (
                    <div
                      key={invitation.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {group.identity.ministryName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Invitado por {invitation.sentByLeaderName} · Rol:{' '}
                          <strong>{invitation.suggestedInstrument}</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={hasReachedLimit}
                        onClick={() => {
                          const res = onJoinGroupByCodeOrInvite(group.id);
                          if (!res.ok) {
                            setGroupActionError(res.error || null);
                          } else {
                            onClose();
                          }
                        }}
                        className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold ${accent.bgClass} disabled:opacity-50`}
                      >
                        Unirme al Grupo
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  No tienes invitaciones directas pendientes en este momento. También puedes
                  ingresar el código del grupo abajo.
                </p>
              )}
            </div>

            {/* Unirse mediante código */}
            <form
              onSubmit={handleJoinByCodeSubmit}
              className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800"
            >
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Unirme con Código de Invitación del Grupo
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  required
                  disabled={hasReachedLimit}
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value);
                    setGroupActionError(null);
                  }}
                  placeholder="Ej. JSTONE-2026"
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-sm text-slate-900 dark:text-white uppercase"
                />
                <button
                  type="submit"
                  disabled={hasReachedLimit}
                  className={`min-h-[48px] px-6 py-2.5 rounded-2xl text-xs sm:text-sm font-bold shrink-0 ${accent.bgClass} disabled:opacity-50`}
                >
                  Unirme como Miembro
                </button>
              </div>
              {groupActionError && (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {groupActionError}
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
