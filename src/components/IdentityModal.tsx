import React, { useEffect, useRef, useState } from 'react';
import {
  ALL_INSTRUMENT_ROLES,
  AccentColorId,
  AppIdentity,
  AppUser,
  BandMember,
  BrandIconId,
  GmailInvitation,
  InstrumentRole,
  UserRole,
} from '../types';
import { uploadMediaDataUrlToStorage } from '../firebase';
import {
  AtSign,
  Camera,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Flame,
  Guitar,
  Heart,
  ImagePlus,
  Mail,
  Mic2,
  Moon,
  Music,
  Palette,
  RotateCcw,
  Sun,
  Trash2,
  UserPlus,
  Users,
  X,
  ShieldCheck,
  Plus,
} from 'lucide-react';

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: 'grupo' | 'temas' | 'invitaciones';
  identity: AppIdentity;
  onSaveIdentity: (updated: AppIdentity) => void;
  userRole: UserRole;
  leaderUserId?: string;
  members: BandMember[];
  invitations: GmailInvitation[];
  activeMember: BandMember;
  allUsers?: AppUser[];
  friends?: AppUser[];
  onSendInvitationByUsernameOrEmail: (invite: {
    identifier: string;
    invitedName: string;
    suggestedInstrument: InstrumentRole;
    isGuest?: boolean;
  }) => { ok: boolean; message: string };
  onAddFriendToGroup?: (friendUser: AppUser, isGuest: boolean) => { ok: boolean; message: string };
  onRemoveMember: (id: string) => void;
  onToggleMemberRole?: (memberId: string) => void;
  onToggleMemberGuestStatus?: (memberId: string) => void;
  onUpdateUserInstruments?: (instruments: InstrumentRole[]) => void;
  onOpenMusicianProfile?: (userId: string) => void;
  onResetDemoData: () => void;
}

export const ACCENT_COLORS: {
  id: AccentColorId;
  label: string;
  swatchClass: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  softBgClass: string;
}[] = [
  {
    id: 'amber',
    label: 'Ámbar Dorado',
    swatchClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-600 hover:bg-amber-500 text-white',
    borderClass: 'border-amber-500/40',
    softBgClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  {
    id: 'indigo',
    label: 'Índigo Profundo',
    swatchClass: 'bg-indigo-500',
    textClass: 'text-indigo-600 dark:text-indigo-400',
    bgClass: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    borderClass: 'border-indigo-500/40',
    softBgClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  {
    id: 'emerald',
    label: 'Esmeralda Gracia',
    swatchClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    borderClass: 'border-emerald-500/40',
    softBgClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  {
    id: 'rose',
    label: 'Carmesí Adoración',
    swatchClass: 'bg-rose-500',
    textClass: 'text-rose-600 dark:text-rose-400',
    bgClass: 'bg-rose-600 hover:bg-rose-500 text-white',
    borderClass: 'border-rose-500/40',
    softBgClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  {
    id: 'sky',
    label: 'Azul Cielo',
    swatchClass: 'bg-sky-500',
    textClass: 'text-sky-600 dark:text-sky-400',
    bgClass: 'bg-sky-600 hover:bg-sky-500 text-white',
    borderClass: 'border-sky-500/40',
    softBgClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  {
    id: 'violet',
    label: 'Violeta Majestad',
    swatchClass: 'bg-violet-500',
    textClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-600 hover:bg-violet-500 text-white',
    borderClass: 'border-violet-500/40',
    softBgClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
];

export function getAccentClasses(colorId: AccentColorId) {
  return ACCENT_COLORS.find((c) => c.id === colorId) || ACCENT_COLORS[0];
}

/**
 * Comprime y recorta en cuadrado una imagen subida por el usuario en formato ultra-ligero
 * (144x144 WebP/JPEG ~5KB) e intenta subirla a Firebase Storage con fallback instantáneo.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxSize = 144
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        // Recorte cuadrado centrado (center crop)
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxSize, maxSize);
        let dataUrl = canvas.toDataURL('image/webp', 0.72);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.74);
        }
        try {
          const uploadedUrl = await uploadMediaDataUrlToStorage(
            'avatars',
            file.name || 'avatar.webp',
            dataUrl
          );
          resolve(uploadedUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Archivo de imagen inválido'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Icono Oficial de jesustone: Silueta de una púa/plumilla de guitarra con una cruz dentro.
 */
export const GuitarPickCrossIcon: React.FC<{ className?: string }> = ({
  className = 'w-5 h-5',
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.85"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Silueta de púa / plumilla de guitarra con proporciones clásicas suaves */}
    <path d="M12 3.8C16.2 3.8 18.5 5.6 18.5 9.1C18.5 12.8 15.3 16.9 13.3 18.9C12.55 19.6 11.45 19.6 10.7 18.9C8.7 16.9 5.5 12.8 5.5 9.1C5.5 5.6 7.8 3.8 12 3.8Z" />
    {/* Cruz cristiana proporcionada en el interior */}
    <path d="M12 7.3V15.4" />
    <path d="M9.1 10.1H14.9" />
  </svg>
);

export function BrandIconDisplay({
  iconId,
  customImageUrl,
  className = 'w-5 h-5',
}: {
  iconId: BrandIconId;
  customImageUrl?: string;
  className?: string;
}) {
  if (customImageUrl) {
    return (
      <img
        src={customImageUrl}
        alt="Icono del grupo"
        className={`${className} rounded-lg object-cover`}
      />
    );
  }
  switch (iconId) {
    case 'pick_cross':
      return <GuitarPickCrossIcon className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'crown':
      return <Crown className={className} />;
    case 'guitar':
      return <Guitar className={className} />;
    case 'mic':
      return <Mic2 className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'music':
      return <Music className={className} />;
    default:
      return <GuitarPickCrossIcon className={className} />;
  }
}

export const BRAND_ICON_OPTIONS: { id: BrandIconId; label: string }[] = [
  { id: 'pick_cross', label: 'Púa con Cruz' },
  { id: 'music', label: 'Nota Musical' },
  { id: 'flame', label: 'Fuego / Altar' },
  { id: 'crown', label: 'Reino / Corona' },
  { id: 'guitar', label: 'Acústico' },
  { id: 'mic', label: 'Alabanza Vocal' },
  { id: 'heart', label: 'Adoración' },
];

export const IdentityModal: React.FC<IdentityModalProps> = ({
  isOpen,
  onClose,
  initialSection = 'grupo',
  identity,
  onSaveIdentity,
  userRole,
  leaderUserId,
  members,
  activeMember,
  allUsers = [],
  friends = [],
  onSendInvitationByUsernameOrEmail,
  onAddFriendToGroup,
  onRemoveMember,
  onToggleMemberRole,
  onToggleMemberGuestStatus,
  onUpdateUserInstruments,
  onOpenMusicianProfile,
  onResetDemoData,
}) => {
  const [activeTab, setActiveTab] = useState<'grupo' | 'temas' | 'invitaciones'>(
    initialSection
  );
  const [customInstrumentInput, setCustomInstrumentInput] = useState('');
  const [ministryName, setMinistryName] = useState(identity.ministryName);
  const [inviteCode, setInviteCode] = useState(identity.inviteCode || 'JSTONE-2026');
  const [iconId, setIconId] = useState<BrandIconId>(identity.iconId || 'pick_cross');
  const [customImageUrl, setCustomImageUrl] = useState<string | undefined>(
    identity.customImageUrl
  );
  const [accentColor, setAccentColor] = useState<AccentColorId>(identity.accentColor);
  const [darkMode, setDarkMode] = useState<boolean>(identity.darkMode);

  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Invitaciones por Nombre de Usuario o Correo State
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteInstrument, setInviteInstrument] = useState<InstrumentRole>('Coros');
  const [inviteAsGuest, setInviteAsGuest] = useState<boolean>(false);
  const [memberListFilter, setMemberListFilter] = useState<'titulares' | 'suplentes'>('titulares');
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialSection);
      setMinistryName(identity.ministryName);
      setInviteCode(identity.inviteCode || 'JSTONE-2026');
      setIconId(identity.iconId || 'pick_cross');
      setCustomImageUrl(identity.customImageUrl);
      setAccentColor(identity.accentColor);
      setDarkMode(identity.darkMode);
    }
  }, [isOpen, initialSection, identity]);

  if (!isOpen) return null;

  const accent = getAccentClasses(accentColor);

  const handleGroupPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 180);
      setCustomImageUrl(compressed);
    } catch {
      // ignore invalid image
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveIdentity({
      ministryName: ministryName.trim() || 'Mi Grupo de Alabanza',
      inviteCode: inviteCode.trim().toUpperCase() || 'JSTONE-2026',
      iconId,
      customImageUrl,
      accentColor,
      darkMode,
    });
    onClose();
  };

  const buildGmailComposeUrl = (
    targetEmail: string,
    targetName: string,
    roleName: string
  ) => {
    const appUrl = window.location.origin;
    const subject = `Invitación a unirte al grupo "${identity.ministryName}" en jesustone`;
    const body = `¡Hola ${targetName}!\n\n${activeMember.name} te ha invitado a unirte al grupo "${identity.ministryName}" en la aplicación jesustone.\n\n• Rol sugerido: ${roleName}\n• Código de invitación del grupo: ${identity.inviteCode}\n• Enlace directo a la app: ${appUrl}\n\nEntra a la aplicación con tu usuario o correo e ingresa el código ${identity.inviteCode}. ¡Te esperamos!`;
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      targetEmail
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSendInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteIdentifier.trim()) return;
    const res = onSendInvitationByUsernameOrEmail({
      identifier: inviteIdentifier.trim(),
      invitedName: inviteName.trim() || inviteIdentifier.trim(),
      suggestedInstrument: inviteInstrument,
      isGuest: inviteAsGuest,
    });
    setInviteFeedback(res.message);
    if (res.ok) {
      setInviteIdentifier('');
      setInviteName('');
    }
  };

  const handleCopyInviteCode = () => {
    navigator.clipboard?.writeText(identity.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Buscar coincidencia en tiempo real de usuario registrado en la app
  const cleanSearch = inviteIdentifier.trim().toLowerCase().replace(/^@/, '');
  const matchedRegisteredUser = cleanSearch
    ? allUsers.find(
        (u) =>
          u.username.toLowerCase() === cleanSearch ||
          u.email.toLowerCase() === cleanSearch ||
          (u.musicianCode && u.musicianCode.toLowerCase() === cleanSearch)
      )
    : undefined;

  const regularMembers = members.filter((m) => !m.isGuest);
  const guestMembers = members.filter((m) => Boolean(m.isGuest));
  const displayedMembers =
    memberListFilter === 'titulares' ? regularMembers : guestMembers;
  const friendsNotInGroup = friends.filter(
    (f) => !members.some((m) => m.id === f.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black text-white border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden ${accent.bgClass}`}
            >
              <BrandIconDisplay
                iconId={iconId}
                customImageUrl={customImageUrl}
                className="w-full h-full p-2.5"
              />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                jesustone · Configuración del Grupo
              </h2>
              <p className="text-xs text-slate-400">
                Foto o icono del grupo, temas OLED e invitaciones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Botones Grandes de Pestañas */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('grupo')}
            className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'grupo'
                ? `${accent.bgClass} shadow-sm`
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'
            }`}
          >
            <GuitarPickCrossIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">Datos del Grupo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('temas')}
            className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'temas'
                ? `${accent.bgClass} shadow-sm`
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'
            }`}
          >
            <Palette className="w-4 h-4 shrink-0" />
            <span className="truncate">Selector de Temas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('invitaciones')}
            className={`min-h-[48px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'invitaciones'
                ? `${accent.bgClass} shadow-sm`
                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">Miembros</span>
          </button>
        </div>

        {/* PESTAÑA 1: DATOS DEL GRUPO */}
        {activeTab === 'grupo' && (
          <form
            onSubmit={handleSave}
            className="p-6 space-y-5 max-h-[75vh] overflow-y-auto"
          >
            {userRole !== 'leader' && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                En este grupo (<strong>{identity.ministryName}</strong>) tu rol es de{' '}
                <strong>Miembro</strong>. Solo el <strong>Líder / Admin</strong> de este grupo
                puede modificar su nombre, foto o icono.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nombre del Grupo Musical
                </label>
                <input
                  type="text"
                  disabled={userRole !== 'leader'}
                  value={ministryName}
                  onChange={(e) => setMinistryName(e.target.value)}
                  placeholder="Ej. Jesustone Worship"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Código de Invitación del Grupo
                </label>
                <input
                  type="text"
                  disabled={userRole !== 'leader'}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-sm text-slate-900 dark:text-white uppercase disabled:opacity-60"
                />
              </div>
            </div>

            {/* Subir Foto Personalizada del Grupo */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 ${accent.bgClass}`}
                >
                  {customImageUrl ? (
                    <img
                      src={customImageUrl}
                      alt="Foto del grupo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <BrandIconDisplay iconId={iconId} className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Foto o Logo Personalizado del Grupo
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sube una foto desde tu galería o elige un icono abajo
                  </p>
                </div>
              </div>

              {userRole === 'leader' && (
                <div className="flex items-center gap-2">
                  <input
                    ref={groupPhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleGroupPhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => groupPhotoInputRef.current?.click()}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>{customImageUrl ? 'Cambiar Foto' : 'Subir Foto'}</span>
                  </button>
                  {customImageUrl && (
                    <button
                      type="button"
                      onClick={() => setCustomImageUrl(undefined)}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 text-xs font-bold"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                O selecciona un Icono para el Grupo
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                {BRAND_ICON_OPTIONS.map((item) => {
                  const isSelected = !customImageUrl && iconId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={userRole !== 'leader'}
                      onClick={() => {
                        setIconId(item.id);
                        setCustomImageUrl(undefined);
                      }}
                      className={`min-h-[68px] flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl border text-xs font-bold transition-all disabled:opacity-60 ${
                        isSelected
                          ? `${accent.borderClass} ${accent.softBgClass} ring-2 ring-amber-500/30`
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
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

            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onResetDemoData}
                className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:text-rose-600"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reiniciar toda la app
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cerrar
                </button>
                {userRole === 'leader' && (
                  <button
                    type="submit"
                    className={`min-h-[48px] px-6 py-2.5 rounded-2xl text-xs font-bold shadow-md ${accent.bgClass}`}
                  >
                    Guardar Datos del Grupo
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        {/* PESTAÑA 2: SELECTOR DE TEMAS Y APARIENCIA */}
        {activeTab === 'temas' && (
          <form
            onSubmit={handleSave}
            className="p-6 space-y-6 max-h-[75vh] overflow-y-auto"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Tema de Pantalla
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDarkMode(true)}
                  className={`min-h-[68px] flex items-center justify-center gap-3 p-4 rounded-2xl border text-sm font-bold transition-all ${
                    darkMode
                      ? 'border-amber-500/50 bg-black text-white ring-2 ring-amber-500/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <Moon className="w-5 h-5 text-amber-400" />
                  <span>Modo Oscuro</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode(false)}
                  className={`min-h-[68px] flex items-center justify-center gap-3 p-4 rounded-2xl border text-sm font-bold transition-all ${
                    !darkMode
                      ? 'border-amber-500/60 bg-white text-slate-950 shadow-sm ring-2 ring-amber-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <Sun className="w-5 h-5 text-amber-500" />
                  <span>Modo Claro</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Color Principal del Tema de la App
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ACCENT_COLORS.map((color) => {
                  const isSelected = accentColor === color.id;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setAccentColor(color.id)}
                      className={`min-h-[58px] flex items-center justify-between px-4 py-3 rounded-2xl border text-xs font-bold transition-all ${
                        isSelected
                          ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`w-5 h-5 rounded-full ${color.swatchClass}`}
                        />
                        {color.label}
                      </span>
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`min-h-[48px] px-6 py-2.5 rounded-2xl text-xs font-bold shadow-md ${accent.bgClass}`}
              >
                Aplicar Tema Ahora
              </button>
            </div>
          </form>
        )}

        {/* PESTAÑA 3: INVITAR MIEMBROS POR @USUARIO O CORREO */}
        {activeTab === 'invitaciones' && (
          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Tarjeta de Código de Invitación */}
            <div className="p-4 rounded-2xl bg-black border border-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Código del Grupo ({identity.ministryName})
                </span>
                <p className="text-lg font-mono font-bold tracking-wider mt-0.5">
                  {identity.inviteCode}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyInviteCode}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-2 self-start sm:self-center"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Código Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Código</span>
                  </>
                )}
              </button>
            </div>

            {/* Formulario del Líder para administrar/invitar miembros titulares o suplentes */}
            {userRole === 'leader' ? (
              <div className="space-y-4">
                {friendsNotInGroup.length > 0 && onAddFriendToGroup && (
                  <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4 text-indigo-500" />
                        Añadir rápido desde tu Red de Amigos ({friendsNotInGroup.length})
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Como Suplente o Titular
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {friendsNotInGroup.map((friend) => (
                        <div
                          key={friend.id}
                          className="w-full sm:w-auto p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 min-w-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center text-[11px] font-bold shrink-0">
                              {friend.avatarInitials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {friend.name}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                @{friend.username} · {friend.instruments[0] || 'Músico'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const res = onAddFriendToGroup(friend, true);
                                setInviteFeedback(res.message);
                                setMemberListFilter('suplentes');
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-300 text-[10px] font-bold"
                              title="Solo verá los eventos donde lo asignes"
                            >
                              + Suplente
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const res = onAddFriendToGroup(friend, false);
                                setInviteFeedback(res.message);
                                setMemberListFilter('titulares');
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold"
                              title="Miembro fijo del grupo"
                            >
                              + Titular
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSendInviteSubmit}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AtSign className={`w-4 h-4 ${accent.textClass}`} />
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        Agregar por @Usuario, ID Músico o Correo
                      </h3>
                    </div>

                    {/* Selector Titular vs Invitado/Suplente */}
                    <div className="inline-flex p-0.5 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-700 self-start">
                      <button
                        type="button"
                        onClick={() => setInviteAsGuest(false)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          !inviteAsGuest
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        Miembro Titular
                      </button>
                      <button
                        type="button"
                        onClick={() => setInviteAsGuest(true)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                          inviteAsGuest
                            ? 'bg-amber-500 text-slate-950 shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        Suplente / Invitado
                      </button>
                    </div>
                  </div>

                  {inviteAsGuest && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                      Modo <strong>Músico Invitado / Suplente</strong>: Solo verá los eventos específicos donde lo convoques y sus canciones asignadas (no verá todo el grupo ni el chat interno).
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        @Usuario, ID (JST-...) o Correo *
                      </label>
                      <input
                        type="text"
                        required
                        value={inviteIdentifier}
                        onChange={(e) => {
                          setInviteIdentifier(e.target.value);
                          setInviteFeedback(null);
                        }}
                        placeholder="@usuario, JST-1234 o correo"
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Nombre (Opcional)
                      </label>
                      <input
                        type="text"
                        value={
                          matchedRegisteredUser
                            ? matchedRegisteredUser.name
                            : inviteName
                        }
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Nombre del músico"
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Instrumento Principal
                      </label>
                      <select
                        value={inviteInstrument}
                        onChange={(e) =>
                          setInviteInstrument(e.target.value as InstrumentRole)
                        }
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      >
                        {ALL_INSTRUMENT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {matchedRegisteredUser && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                      <span>
                        Músico encontrado:{' '}
                        <strong>{matchedRegisteredUser.name}</strong> (@
                        {matchedRegisteredUser.username}
                        {matchedRegisteredUser.musicianCode
                          ? ` · ${matchedRegisteredUser.musicianCode}`
                          : ''}
                        )
                      </span>
                      <Check className="w-4 h-4" />
                    </div>
                  )}

                  {inviteFeedback && (
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {inviteFeedback}
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="submit"
                      className={`flex-1 min-h-[42px] py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm ${accent.bgClass}`}
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {inviteAsGuest
                          ? 'Añadir como Suplente / Invitado'
                          : 'Invitar como Miembro Titular'}
                      </span>
                    </button>

                    {inviteIdentifier.includes('@') &&
                      inviteIdentifier.includes('.') && (
                        <button
                          type="button"
                          onClick={() => {
                            const url = buildGmailComposeUrl(
                              inviteIdentifier.trim(),
                              inviteName.trim() || inviteIdentifier.trim(),
                              inviteInstrument
                            );
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Enviar Correo</span>
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </button>
                      )}
                  </div>
                </form>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-400">
                Solo el <strong>Líder / Admin</strong> de este grupo puede administrar o invitar miembros.
              </div>
            )}

            {/* Mis Instrumentos y Roles en mi Perfil Base */}
            {onUpdateUserInstruments && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Mis Instrumentos y Roles Base ({activeMember.name})
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Elige uno o varios instrumentos/roles (o agrega uno personalizado):
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(
                    new Set([...ALL_INSTRUMENT_ROLES, ...activeMember.instruments])
                  ).map((role) => {
                    const isSelected = activeMember.instruments.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          const exists = activeMember.instruments.includes(role);
                          const next = exists
                            ? activeMember.instruments.filter((r) => r !== role)
                            : [...activeMember.instruments, role];
                          if (next.length > 0) {
                            onUpdateUserInstruments(next);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          isSelected
                            ? `${accent.bgClass} border-transparent shadow-xs`
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {role}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customInstrumentInput}
                    onChange={(e) => setCustomInstrumentInput(e.target.value)}
                    placeholder="Otro instrumento o rol personalizado (ej. Saxofón, Chelo, Sonido)..."
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = customInstrumentInput.trim();
                      if (!clean) return;
                      if (!activeMember.instruments.includes(clean)) {
                        onUpdateUserInstruments([...activeMember.instruments, clean]);
                      }
                      setCustomInstrumentInput('');
                    }}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 ${accent.bgClass}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
            )}

            {/* Lista de Miembros Actuales del Grupo (Titulares vs Suplentes/Invitados) */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Administración de Miembros ({members.length})
                </h4>

                <div className="inline-flex p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setMemberListFilter('titulares')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      memberListFilter === 'titulares'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Titulares ({regularMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemberListFilter('suplentes')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      memberListFilter === 'suplentes'
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Suplentes / Invitados ({guestMembers.length})
                  </button>
                </div>
              </div>

              {displayedMembers.length === 0 ? (
                <div className="p-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                  {memberListFilter === 'suplentes'
                    ? 'No tienes músicos suplentes o invitados temporales registrados aún. Puedes añadir amigos desde arriba o convocarlos al crear un evento.'
                    : 'No hay miembros titulares en esta lista.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {displayedMembers.map((m) => {
                    const isMainFounder = leaderUserId && m.id === leaderUserId;
                    const isCoLeader = m.role === 'leader' && !isMainFounder;
                    return (
                      <div
                        key={m.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-slate-900"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenMusicianProfile) {
                              onClose();
                              onOpenMusicianProfile(m.id);
                            }
                          }}
                          className="flex items-center gap-3 min-w-0 text-left group"
                          title={`Ver Perfil Social de ${m.name}`}
                        >
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ${
                              m.isGuest
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                                : m.role === 'leader'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {m.avatarUrl ? (
                              <img
                                src={m.avatarUrl}
                                alt={m.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              m.avatarInitials
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-500 truncate transition-colors">
                                {m.name}
                              </p>
                              {m.username && (
                                <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                                  @{m.username}
                                </span>
                              )}
                              {m.isGuest ? (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                                  Suplente / Invitado
                                </span>
                              ) : (
                                <span className="text-xs font-normal text-slate-500">
                                  ·{' '}
                                  {isMainFounder
                                    ? 'Líder Principal'
                                    : isCoLeader
                                    ? 'Co-Líder'
                                    : 'Titular'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {m.instruments.join(', ')}
                              {m.isGuest && m.guestEventIds && m.guestEventIds.length > 0
                                ? ` · ${m.guestEventIds.length} fecha(s) asignada(s)`
                                : ''}
                            </p>
                          </div>
                        </button>
                        <div className="flex flex-wrap items-center justify-end gap-1.5 self-end sm:self-center max-w-full">
                          {onOpenMusicianProfile && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenMusicianProfile(m.id);
                              }}
                              className="min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500/40"
                            >
                              Ver Perfil
                            </button>
                          )}
                          {userRole === 'leader' && !isMainFounder && m.id !== activeMember.id && (
                            <>
                              {onToggleMemberGuestStatus && (
                                <button
                                  type="button"
                                  onClick={() => onToggleMemberGuestStatus(m.id)}
                                  className="min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-500/40"
                                  title={
                                    m.isGuest
                                      ? 'Convertir en Miembro Titular'
                                      : 'Cambiar a Suplente / Invitado Temporal'
                                  }
                                >
                                  {m.isGuest ? 'Hacer Titular' : 'Pasar a Suplente'}
                                </button>
                              )}
                              {!m.isGuest && onToggleMemberRole && (
                                <button
                                  type="button"
                                  onClick={() => onToggleMemberRole(m.id)}
                                  className={`min-h-[32px] px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 border transition-colors ${
                                    m.role === 'leader'
                                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-500/40'
                                  }`}
                                  title="Asignar o quitar permisos de Co-Líder"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>
                                    {m.role === 'leader' ? 'Quitar Co-Líder' : 'Co-Líder'}
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onRemoveMember(m.id)}
                                className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                                title="Eliminar del grupo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
