import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadString,
} from 'firebase/storage';
import {
  AppNotification,
  AppUser,
  ChatMessage,
  DirectMessage,
  FriendRequest,
  Song,
  WorshipGroup,
} from './types';

// Configuración del proyecto en la otra cuenta del usuario (jesustone-6519f)
export const firebaseConfig = {
  apiKey: 'AIzaSyAaHH6o81J8eShzqD_j9aPgmnXITDmpS1E',
  authDomain: 'jesustone-6519f.firebaseapp.com',
  projectId: 'jesustone-6519f',
  storageBucket: 'jesustone-6519f.firebasestorage.app',
  messagingSenderId: '574042617870',
  appId: '1:574042617870:web:7eec9b1abd4689531b645f',
  measurementId: 'G-0DEFKK6X5V',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  shouldThrow = false
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (shouldThrow) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }
  return errInfo;
}

// Validate connection to Firestore on boot
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

function stripUndefinedDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

// ============================================================================
// 4. FIREBASE CLOUD STORAGE: SUBIDA DE AUDIOS E IMÁGENES CON FALLBACK AUTOMÁTICO
// ============================================================================
export async function uploadMediaDataUrlToStorage(
  folder: string,
  fileName: string,
  dataUrl: string
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  try {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileRef = storageRef(
      storage,
      `jesustone_media/${folder}/${Date.now()}_${safeName}`
    );
    await uploadString(fileRef, dataUrl, 'data_url');
    const publicUrl = await getDownloadURL(fileRef);
    return publicUrl;
  } catch {
    return dataUrl;
  }
}

export async function uploadMediaBlobToStorage(
  folder: string,
  fileName: string,
  blob: Blob,
  fallbackDataUrl: string
): Promise<string> {
  try {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileRef = storageRef(
      storage,
      `jesustone_media/${folder}/${Date.now()}_${safeName}`
    );
    await uploadBytes(fileRef, blob);
    const publicUrl = await getDownloadURL(fileRef);
    return publicUrl;
  } catch {
    return fallbackDataUrl;
  }
}

/**
 * Elimina de manera segura un archivo de Firebase Cloud Storage
 * evitando la acumulación de archivos huérfanos al borrar o actualizar canciones.
 */
export async function deleteMediaFromStorage(
  mediaUrl?: string | null
): Promise<boolean> {
  if (!mediaUrl || !mediaUrl.startsWith('http')) {
    return false;
  }
  if (
    !mediaUrl.includes('firebasestorage.googleapis.com') &&
    !mediaUrl.includes('jesustone')
  ) {
    return false;
  }
  try {
    const urlParts = mediaUrl.split('/o/');
    if (urlParts.length > 1) {
      const fullPathEncoded = urlParts[1].split('?')[0];
      const decodedPath = decodeURIComponent(fullPathEncoded);
      const fileRef = storageRef(storage, decodedPath);
      await deleteObject(fileRef);
      return true;
    }
    const fileRef = storageRef(storage, mediaUrl);
    await deleteObject(fileRef);
    return true;
  } catch (err) {
    console.warn(
      'Archivo de Cloud Storage ya no existía o fue purgado previamente:',
      err
    );
    return false;
  }
}

// ============================================================================
// 3. FIREBASE AUTHENTICATION OFICIAL (GOOGLE SIGN-IN + EMAIL/PASSWORD + RESET)
// ============================================================================
export async function signInWithGoogleOfficial(): Promise<{
  ok: boolean;
  uid?: string;
  name?: string;
  email?: string;
  photoURL?: string;
  error?: string;
}> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    return {
      ok: true,
      uid: cred.user.uid,
      name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Músico',
      email: cred.user.email || '',
      photoURL: cred.user.photoURL || undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('popup-closed-by-user')) {
      return { ok: false, error: 'Se cerró la ventana de acceso con Google.' };
    }
    return {
      ok: false,
      error:
        'Para usar el botón de Google, asegúrate de tener habilitado el proveedor Google en Firebase Console > Authentication > Sign-in method (o ingresa con tu correo y contraseña).',
    };
  }
}

export async function syncFirebaseEmailAuth(
  email: string,
  password: string,
  isRegistration: boolean
): Promise<string | null> {
  const paddedPassword =
    password.length < 6 ? `${password}_jstn` : password;
  try {
    if (isRegistration) {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        paddedPassword
      );
      return cred.user.uid;
    } else {
      const cred = await signInWithEmailAndPassword(
        auth,
        email,
        paddedPassword
      );
      return cred.user.uid;
    }
  } catch {
    return null;
  }
}

export async function sendOfficialPasswordReset(
  email: string
): Promise<{ ok: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      ok: false,
      message: 'Ingresa un correo electrónico válido para recuperar tu contraseña.',
    };
  }
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    return {
      ok: true,
      message: `Se envió un enlace de recuperación de contraseña a ${cleanEmail}. Revisa tu bandeja de entrada o spam.`,
    };
  } catch {
    return {
      ok: true,
      message: `Si ${cleanEmail} está registrado con Firebase Auth, recibirá el enlace de restablecimiento (también puedes restablecer tu clave desde aquí).`,
    };
  }
}

export async function signOutFirebaseOfficial(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch {
    // ignore
  }
}

// ============================================================================
// 1 & 2. OPTIMIZACIÓN DE DOCUMENTOS DE GRUPO, ÍNDICES Y SUBCOLECCIONES PAGINADAS
// ============================================================================
export function enrichGroupIndexes(group: WorshipGroup): WorshipGroup {
  const memberIds = Array.from(
    new Set([
      group.leaderUserId,
      ...(group.members || []).map((m) => m.id),
    ].filter(Boolean))
  );

  const invitedIdentifiers = Array.from(
    new Set(
      (group.invitations || [])
        .flatMap((inv) => [
          inv.email?.toLowerCase(),
          inv.username?.toLowerCase(),
          inv.identifier?.toLowerCase().replace(/^@/, ''),
        ])
        .filter((v): v is string => Boolean(v))
    )
  );

  const inviteCodeNormalized = (group.identity?.inviteCode || '')
    .trim()
    .toUpperCase();

  return {
    ...group,
    memberIds,
    invitedIdentifiers,
    inviteCodeNormalized,
  };
}

export const MAX_CHAT_MESSAGES_PER_GROUP = 100;
export const MAX_DMS_PER_CONVERSATION = 100;
export const MAX_NOTIFICATIONS = 50;

const SOCIAL_HUB_DOC_ID = 'social_hub_global_v1';

interface SocialHubDoc {
  id: string;
  docType: 'social_hub';
  friendRequests: FriendRequest[];
  directMessages: DirectMessage[];
  updatedAt: number;
}

function isRealWorshipGroupDoc(data: unknown, docId?: string): data is WorshipGroup {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<WorshipGroup> & { docType?: string };
  if (candidate.docType === 'song_image' || candidate.docType === 'social_hub') {
    return false;
  }
  if (docId && (docId.startsWith('songimg__') || docId === SOCIAL_HUB_DOC_ID)) {
    return false;
  }
  return Boolean(candidate.id && candidate.leaderUserId && candidate.identity);
}

// Registro en memoria de IDs eliminados definitivamente por grupo para impedir
// que cualquier re-sincronización o estado en vuelo vuelva a subir elementos borrados
const globalDeletedIdsByGroup = new Map<string, Set<string>>();

export function registerPermanentDeletedIds(
  groupId: string,
  ...ids: string[]
): void {
  if (!groupId) return;
  let set = globalDeletedIdsByGroup.get(groupId);
  if (!set) {
    set = new Set<string>();
    globalDeletedIdsByGroup.set(groupId, set);
  }
  for (const id of ids) {
    if (id) set.add(id);
  }
}

export function getPermanentDeletedIds(groupId: string): string[] {
  const set = globalDeletedIdsByGroup.get(groupId);
  return set ? Array.from(set) : [];
}

/**
 * Detecta eventos serie antiguos ("Domingo de celebración/servicio y alabanza ... 2/4, 3/4, 4/4")
 * que quedaron huérfanos en la nube antes del sistema de tombstones para purgarlos definitivamente.
 */
export function isLegacyZombieRecurringEvent(ev: {
  id: string;
  title?: string;
}): boolean {
  const title = (ev.title || '').trim();
  if (!title) return false;
  const matchesZombiePattern =
    /domingo de (celebraci[oó]n|servicio) y alabanza.*([234]\/4)/i.test(title);
  if (!matchesZombiePattern) return false;
  const matchTs = ev.id.match(/-(\d{13})\b/);
  if (matchTs) {
    const createdMs = Number(matchTs[1]);
    // Si fue creado hace menos de 5 minutos, no es un evento huérfano antiguo
    if (!Number.isNaN(createdMs) && Date.now() - createdMs < 5 * 60 * 1000) {
      return false;
    }
  }
  return true;
}

function prepareGroupForFirestore(group: WorshipGroup): WorshipGroup {
  const indexedGroup = enrichGroupIndexes(group);

  // Detectar y registrar cualquier evento serie huérfano 2/4, 3/4, 4/4 que ya había sido eliminado
  for (const ev of indexedGroup.events || []) {
    if (isLegacyZombieRecurringEvent(ev)) {
      registerPermanentDeletedIds(group.id, ev.id);
    }
  }

  // Unificar todos los IDs eliminados (del documento + memoria global de esta sesión)
  const combinedDeletedIds = Array.from(
    new Set([
      ...(indexedGroup.deletedIds || []),
      ...getPermanentDeletedIds(group.id),
    ].filter(Boolean))
  ).slice(-300);

  registerPermanentDeletedIds(group.id, ...combinedDeletedIds);
  const deletedSet = new Set<string>(combinedDeletedIds);

  // Nunca guardar imágenes base64 pesadas dentro del documento del grupo;
  // cada imagen vive en su propio documento bajo demanda `jesustone_groups/songimg__{songId}`
  const lightSongs: Song[] = (indexedGroup.songs || [])
    .filter((s) => !deletedSet.has(s.id))
    .map((s) => {
      const rawUrl = s.chordSheetImageUrl;
      const isAutoGeneratedSvg =
        rawUrl && rawUrl.startsWith('data:image/svg+xml');
      const isValidDataImage =
        rawUrl && !isAutoGeneratedSvg && rawUrl.startsWith('data:image/');
      const isHttpImage =
        rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'));

      const hasImage = Boolean(
        s.hasChordSheetImage || isValidDataImage || isHttpImage
      );
      const updatedAt = isValidDataImage
        ? s.chordSheetImageUpdatedAt || Date.now()
        : s.chordSheetImageUpdatedAt;

      // Si la canción aún traía una imagen base64 en línea, respaldarla automáticamente
      // en su documento independiente en la nube antes de limpiar el documento del grupo
      if (isValidDataImage && rawUrl) {
        const imgDocId = `songimg__${s.id}`;
        setDoc(doc(db, 'jesustone_groups', imgDocId), {
          id: imgDocId,
          docType: 'song_image',
          songId: s.id,
          groupId: group.id,
          imageDataUrl: rawUrl,
          updatedAt: updatedAt || Date.now(),
        }).catch(() => {});
      }

      const cleanLyrics = s.lyricsAndChords || s.rawLyricsAndChords || '';

      return {
        ...s,
        lyricsAndChords: cleanLyrics,
        // Evitar duplicar el texto de acordes dos veces en el documento del grupo
        rawLyricsAndChords:
          s.rawLyricsAndChords && s.rawLyricsAndChords !== cleanLyrics
            ? s.rawLyricsAndChords
            : undefined,
        hasChordSheetImage: hasImage || undefined,
        chordSheetImageUpdatedAt: hasImage ? updatedAt : undefined,
        // Solo conservar URL en el grupo si es un enlace HTTP externo corto; las imágenes subidas viven en songimg__{id}
        chordSheetImageUrl: isHttpImage ? rawUrl : undefined,
        voiceNotes: undefined,
      };
    });

  // Filtrar estrictamente eventos, estudios, avisos, canales y mensajes contra deletedSet
  const cleanEvents = (indexedGroup.events || [])
    .filter((ev) => !deletedSet.has(ev.id))
    .map((ev) => ({
      ...ev,
      songs: (ev.songs || []).filter((item) => !deletedSet.has(item.songId)),
    }));

  const cleanDevotionals = (indexedGroup.devotionals || []).filter(
    (d) => !deletedSet.has(d.id)
  );

  const cleanAlerts = (indexedGroup.alerts || []).filter(
    (a) => !deletedSet.has(a.id)
  );

  const cleanAvailability = (indexedGroup.availabilityRecords || []).filter(
    (r) => !deletedSet.has(r.id)
  );

  const cleanCustomChannels = (indexedGroup.customChannels || []).filter(
    (ch) => !deletedSet.has(ch.id)
  );

  // Mantener los mensajes de chat ligeros dentro del grupo (hasta 80 mensajes recientes)
  const recentChatMessages = (indexedGroup.chatMessages || [])
    .filter((m) => !deletedSet.has(m.id) && !deletedSet.has(m.channel))
    .slice(-80)
    .map((m) => ({
      ...m,
      voiceClipUrl:
        m.voiceClipUrl &&
        m.voiceClipUrl.startsWith('data:') &&
        m.voiceClipUrl.length > 35000
          ? undefined
          : m.voiceClipUrl,
    }));

  const cleanActivityFeed = (indexedGroup.activityFeed || [])
    .filter((f) => !f.targetId || !deletedSet.has(f.targetId))
    .slice(0, 5);

  const candidate: WorshipGroup = stripUndefinedDeep({
    ...indexedGroup,
    songs: lightSongs,
    events: cleanEvents,
    devotionals: cleanDevotionals,
    alerts: cleanAlerts,
    availabilityRecords: cleanAvailability,
    customChannels: cleanCustomChannels,
    chatMessages: recentChatMessages,
    deletedIds: combinedDeletedIds,
    activityFeed: cleanActivityFeed,
    invitations: (indexedGroup.invitations || []).slice(0, 30),
  });

  return candidate;
}

export async function syncUserToFirestore(user: AppUser): Promise<void> {
  const path = `jesustone_users/${user.id}`;
  try {
    await setDoc(doc(db, 'jesustone_users', user.id), stripUndefinedDeep(user));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function syncSongToFirestore(
  groupId: string,
  song: Song
): Promise<void> {
  // Si la canción incluye una imagen subida en base64, guardarla en su documento independiente bajo demanda
  if (
    song.chordSheetImageUrl &&
    song.chordSheetImageUrl.startsWith('data:image/') &&
    !song.chordSheetImageUrl.startsWith('data:image/svg+xml')
  ) {
    const imgDocId = `songimg__${song.id}`;
    const path = `jesustone_groups/${imgDocId}`;
    try {
      await setDoc(doc(db, 'jesustone_groups', imgDocId), {
        id: imgDocId,
        docType: 'song_image',
        songId: song.id,
        groupId,
        imageDataUrl: song.chordSheetImageUrl,
        updatedAt: song.chordSheetImageUpdatedAt || Date.now(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path, false);
    }
  }
}

export async function deleteSongFromFirestore(songId: string): Promise<void> {
  const imgDocId = `songimg__${songId}`;
  const path = `jesustone_groups/${imgDocId}`;
  try {
    await deleteDoc(doc(db, 'jesustone_groups', imgDocId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}

export async function syncChatMessageToFirestore(
  _groupId: string,
  _message: ChatMessage
): Promise<void> {
  // Los mensajes del grupo se sincronizan de forma atómica en el documento de grupo (`jesustone_groups/{groupId}`)
}

export async function deleteChatMessageFromFirestore(
  _messageId: string
): Promise<void> {
  // Gestionado en el documento del grupo
}

export async function deleteChannelMessagesFromFirestore(
  _groupId: string,
  _channelId: string
): Promise<void> {
  // Gestionado al eliminar el canal en el documento del grupo
}

export async function syncGroupToFirestore(group: WorshipGroup): Promise<void> {
  const path = `jesustone_groups/${group.id}`;
  try {
    const prepared = prepareGroupForFirestore(group);
    await setDoc(doc(db, 'jesustone_groups', group.id), prepared);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function findGroupByInviteCodeInCloud(
  codeOrGroupId: string
): Promise<WorshipGroup | null> {
  const cleanCode = codeOrGroupId.trim().toUpperCase();
  try {
    const qByNormalized = query(
      collection(db, 'jesustone_groups'),
      where('inviteCodeNormalized', '==', cleanCode),
      limit(1)
    );
    const snapNorm = await getDocs(qByNormalized);
    if (!snapNorm.empty) {
      const data = snapNorm.docs[0].data();
      if (isRealWorshipGroupDoc(data, snapNorm.docs[0].id)) {
        return data;
      }
    }

    const qByIdentityCode = query(
      collection(db, 'jesustone_groups'),
      where('identity.inviteCode', '==', cleanCode),
      limit(1)
    );
    const snapIdentity = await getDocs(qByIdentityCode);
    if (!snapIdentity.empty) {
      const data = snapIdentity.docs[0].data();
      if (isRealWorshipGroupDoc(data, snapIdentity.docs[0].id)) {
        return data;
      }
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.LIST,
      'jesustone_groups/byCode',
      false
    );
  }
  return null;
}

export async function syncNotificationToFirestore(
  notif: AppNotification
): Promise<void> {
  const path = `jesustone_notifications/${notif.id}`;
  try {
    await setDoc(
      doc(db, 'jesustone_notifications', notif.id),
      stripUndefinedDeep(notif)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function deleteNotificationFromFirestore(
  notifId: string
): Promise<void> {
  const path = `jesustone_notifications/${notifId}`;
  try {
    await deleteDoc(doc(db, 'jesustone_notifications', notifId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}

async function readSocialHubDoc(): Promise<SocialHubDoc> {
  try {
    const snap = await getDocFromServer(
      doc(db, 'jesustone_groups', SOCIAL_HUB_DOC_ID)
    );
    if (snap.exists()) {
      const data = snap.data() as Partial<SocialHubDoc>;
      return {
        id: SOCIAL_HUB_DOC_ID,
        docType: 'social_hub',
        friendRequests: Array.isArray(data.friendRequests)
          ? data.friendRequests
          : [],
        directMessages: Array.isArray(data.directMessages)
          ? data.directMessages
          : [],
        updatedAt: Date.now(),
      };
    }
  } catch {
    // ignore
  }
  return {
    id: SOCIAL_HUB_DOC_ID,
    docType: 'social_hub',
    friendRequests: [],
    directMessages: [],
    updatedAt: Date.now(),
  };
}

export async function syncFriendRequestToFirestore(
  req: FriendRequest
): Promise<void> {
  const path = `jesustone_groups/${SOCIAL_HUB_DOC_ID}`;
  try {
    const current = await readSocialHubDoc();
    const filtered = current.friendRequests.filter((r) => r.id !== req.id);
    const nextReqs = [stripUndefinedDeep(req), ...filtered].slice(0, 100);
    await setDoc(doc(db, 'jesustone_groups', SOCIAL_HUB_DOC_ID), {
      ...current,
      friendRequests: nextReqs,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function deleteFriendRequestFromFirestore(
  reqId: string
): Promise<void> {
  const path = `jesustone_groups/${SOCIAL_HUB_DOC_ID}`;
  try {
    const current = await readSocialHubDoc();
    await setDoc(doc(db, 'jesustone_groups', SOCIAL_HUB_DOC_ID), {
      ...current,
      friendRequests: current.friendRequests.filter((r) => r.id !== reqId),
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}

export async function syncDirectMessageToFirestore(
  dm: DirectMessage
): Promise<void> {
  const path = `jesustone_groups/${SOCIAL_HUB_DOC_ID}`;
  try {
    const current = await readSocialHubDoc();
    const cleanDm = stripUndefinedDeep({
      ...dm,
      sharedSongSnapshot: dm.sharedSongSnapshot
        ? {
            ...dm.sharedSongSnapshot,
            chordSheetImageUrl: undefined,
          }
        : undefined,
    });
    const filtered = current.directMessages.filter((m) => m.id !== cleanDm.id);
    const nextDms = [...filtered, cleanDm].slice(-120);
    await setDoc(doc(db, 'jesustone_groups', SOCIAL_HUB_DOC_ID), {
      ...current,
      directMessages: nextDms,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function deleteDirectMessageFromFirestore(
  dmId: string
): Promise<void> {
  const path = `jesustone_groups/${SOCIAL_HUB_DOC_ID}`;
  try {
    const current = await readSocialHubDoc();
    await setDoc(doc(db, 'jesustone_groups', SOCIAL_HUB_DOC_ID), {
      ...current,
      directMessages: current.directMessages.filter((m) => m.id !== dmId),
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}

export async function clearAllCloudData(): Promise<void> {
  const collectionsToClear = [
    'jesustone_users',
    'jesustone_groups',
    'jesustone_notifications',
  ];
  for (const colName of collectionsToClear) {
    try {
      const snap = await getDocs(collection(db, colName));
      for (const d of snap.docs) {
        await deleteDoc(doc(db, colName, d.id));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, colName, false);
    }
  }
}

export function subscribeToJesustoneCloud(
  options: {
    currentUserId?: string;
    activeGroupId?: string;
    messageLimit?: number;
  },
  callbacks: {
    onUsersSnapshot: (users: AppUser[]) => void;
    onGroupsSnapshot: (groups: WorshipGroup[]) => void;
    onSongsSnapshot?: (songsByGroup: Record<string, Song[]>) => void;
    onMessagesSnapshot?: (groupId: string, messages: ChatMessage[]) => void;
    onNotificationsSnapshot: (notifs: AppNotification[]) => void;
    onFriendRequestsSnapshot?: (requests: FriendRequest[]) => void;
    onDirectMessagesSnapshot?: (dms: DirectMessage[]) => void;
    onSyncStatusChange: (status: 'connected' | 'local_only') => void;
  }
): () => void {
  const unsubUsers = onSnapshot(
    collection(db, 'jesustone_users'),
    (snapshot) => {
      callbacks.onSyncStatusChange('connected');
      const cloudUsers = snapshot.docs.map((d) => d.data() as AppUser);
      if (cloudUsers.length > 0) {
        callbacks.onUsersSnapshot(cloudUsers);
      }
    },
    (error) => {
      callbacks.onSyncStatusChange('local_only');
      handleFirestoreError(error, OperationType.LIST, 'jesustone_users', false);
    }
  );

  // 1. Suscripción de Grupos optimizada (`where('memberIds', 'array-contains', currentUserId)`)
  // Excluye automáticamente cualquier documento `songimg__*` porque no tiene `memberIds` ni `leaderUserId`
  const groupsQuery = options.currentUserId
    ? query(
        collection(db, 'jesustone_groups'),
        where('memberIds', 'array-contains', options.currentUserId)
      )
    : query(
        collection(db, 'jesustone_groups'),
        where('leaderUserId', '!=', ''),
        limit(50)
      );

  const unsubGroups = onSnapshot(
    groupsQuery,
    async (snapshot) => {
      callbacks.onSyncStatusChange('connected');
      let cloudGroups = snapshot.docs
        .filter((d) => isRealWorshipGroupDoc(d.data(), d.id))
        .map((d) => d.data() as WorshipGroup);

      // Migración automática si el usuario tenía grupos previos sin el índice `memberIds`
      if (options.currentUserId && cloudGroups.length === 0) {
        try {
          const fallbackSnap = await getDocs(
            query(
              collection(db, 'jesustone_groups'),
              where('leaderUserId', '!=', ''),
              limit(50)
            )
          );
          const allFetched = fallbackSnap.docs
            .filter((d) => isRealWorshipGroupDoc(d.data(), d.id))
            .map((d) => d.data() as WorshipGroup);
          for (const g of allFetched) {
            if (!g.memberIds || g.memberIds.length === 0) {
              syncGroupToFirestore(g);
            }
          }
          cloudGroups = allFetched;
        } catch {
          // ignore
        }
      }

      if (cloudGroups.length > 0) {
        callbacks.onGroupsSnapshot(cloudGroups);
      }
    },
    (error) => {
      callbacks.onSyncStatusChange('local_only');
      handleFirestoreError(
        error,
        OperationType.LIST,
        'jesustone_groups',
        false
      );
    }
  );

  // 2. Suscripción de Notificaciones con auto-purgado a las 50 más recientes
  const notifsQuery = query(
    collection(db, 'jesustone_notifications'),
    limit(80)
  );
  const unsubNotifs = onSnapshot(
    notifsQuery,
    (snapshot) => {
      callbacks.onSyncStatusChange('connected');
      const sortedNotifs = snapshot.docs
        .map((d) => d.data() as AppNotification)
        .sort((a, b) => b.id.localeCompare(a.id));

      if (sortedNotifs.length > MAX_NOTIFICATIONS) {
        const overflow = sortedNotifs.slice(MAX_NOTIFICATIONS);
        overflow.forEach((oldNotif) => {
          deleteNotificationFromFirestore(oldNotif.id);
        });
      }

      const trimmedNotifs = sortedNotifs.slice(0, MAX_NOTIFICATIONS);
      callbacks.onNotificationsSnapshot(trimmedNotifs);
    },
    (error) => {
      callbacks.onSyncStatusChange('local_only');
      handleFirestoreError(
        error,
        OperationType.LIST,
        'jesustone_notifications',
        false
      );
    }
  );

  // 3. Suscripción de Solicitudes de Amistad y Mensajes Directos (en `jesustone_groups/social_hub_global_v1`)
  const unsubSocialHub = onSnapshot(
    doc(db, 'jesustone_groups', SOCIAL_HUB_DOC_ID),
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as Partial<SocialHubDoc>;
      if (
        callbacks.onFriendRequestsSnapshot &&
        Array.isArray(data.friendRequests)
      ) {
        callbacks.onFriendRequestsSnapshot(data.friendRequests);
      }
      if (
        callbacks.onDirectMessagesSnapshot &&
        Array.isArray(data.directMessages)
      ) {
        const uid = options.currentUserId;
        const relevantDms = uid
          ? data.directMessages.filter(
              (dm) =>
                dm.senderId === uid ||
                dm.recipientId === uid ||
                (dm.participants && dm.participants.includes(uid))
            )
          : data.directMessages;
        callbacks.onDirectMessagesSnapshot(relevantDms);
      }
    },
    () => {
      // Optional social hub document
    }
  );

  return () => {
    unsubUsers();
    unsubGroups();
    unsubNotifs();
    unsubSocialHub();
  };
}
