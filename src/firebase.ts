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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (shouldThrow) {
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

function prepareGroupForFirestore(group: WorshipGroup): WorshipGroup {
  const indexedGroup = enrichGroupIndexes(group);

  const lightSongs = (indexedGroup.songs || []).map((s) => {
    const isAutoGeneratedSvg =
      s.chordSheetImageUrl &&
      s.chordSheetImageUrl.startsWith('data:image/svg+xml;utf8,');
    return {
      ...s,
      chordSheetImageUrl: isAutoGeneratedSvg ? undefined : s.chordSheetImageUrl,
    };
  });

  // Mantener únicamente los últimos 60 mensajes en el documento maestro del grupo
  // (todos los mensajes viven en la colección independiente `jesustone_messages`)
  const recentChatMessages = (indexedGroup.chatMessages || [])
    .slice(-60)
    .map((m) => ({
      ...m,
      voiceClipUrl:
        m.voiceClipUrl &&
        m.voiceClipUrl.startsWith('data:') &&
        m.voiceClipUrl.length > 35000
          ? undefined
          : m.voiceClipUrl,
    }));

  const candidate: WorshipGroup = stripUndefinedDeep({
    ...indexedGroup,
    songs: lightSongs,
    chatMessages: recentChatMessages,
  });

  const serializedSize = new Blob([JSON.stringify(candidate)]).size;
  if (serializedSize > 700000) {
    return stripUndefinedDeep({
      ...candidate,
      songs: candidate.songs.map((s) => ({
        ...s,
        chordSheetImageUrl:
          s.chordSheetImageUrl &&
          s.chordSheetImageUrl.startsWith('data:') &&
          s.chordSheetImageUrl.length > 30000
            ? undefined
            : s.chordSheetImageUrl,
        voiceNotes: (s.voiceNotes || []).map((vn) => ({
          ...vn,
          audioDataUrl:
            vn.audioDataUrl.startsWith('data:') && vn.audioDataUrl.length > 30000
              ? ''
              : vn.audioDataUrl,
        })),
      })),
    });
  }

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
  const path = `jesustone_songs/${song.id}`;
  try {
    const isAutoSvg =
      song.chordSheetImageUrl &&
      song.chordSheetImageUrl.startsWith('data:image/svg+xml;utf8,');
    const cleanSong = stripUndefinedDeep({
      ...song,
      chordSheetImageUrl: isAutoSvg ? undefined : song.chordSheetImageUrl,
      groupId,
    });
    await setDoc(doc(db, 'jesustone_songs', song.id), cleanSong);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function deleteSongFromFirestore(songId: string): Promise<void> {
  const path = `jesustone_songs/${songId}`;
  try {
    await deleteDoc(doc(db, 'jesustone_songs', songId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}

export async function syncChatMessageToFirestore(
  groupId: string,
  message: ChatMessage
): Promise<void> {
  const path = `jesustone_messages/${message.id}`;
  try {
    const cleanMsg = stripUndefinedDeep({
      ...message,
      groupId,
      createdAtMs: message.createdAtMs || Date.now(),
    });
    await setDoc(doc(db, 'jesustone_messages', message.id), cleanMsg);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function deleteChatMessageFromFirestore(
  messageId: string
): Promise<void> {
  const path = `jesustone_messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'jesustone_messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
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
      return snapNorm.docs[0].data() as WorshipGroup;
    }

    const qByIdentityCode = query(
      collection(db, 'jesustone_groups'),
      where('identity.inviteCode', '==', cleanCode),
      limit(1)
    );
    const snapIdentity = await getDocs(qByIdentityCode);
    if (!snapIdentity.empty) {
      return snapIdentity.docs[0].data() as WorshipGroup;
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

export async function clearAllCloudData(): Promise<void> {
  const collectionsToClear = [
    'jesustone_users',
    'jesustone_groups',
    'jesustone_songs',
    'jesustone_messages',
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

  // 1. Suscripción de Grupos optimizada por usuario (`where('memberIds', 'array-contains', currentUserId)`)
  const groupsQuery = options.currentUserId
    ? query(
        collection(db, 'jesustone_groups'),
        where('memberIds', 'array-contains', options.currentUserId)
      )
    : query(collection(db, 'jesustone_groups'), limit(50));

  const unsubGroups = onSnapshot(
    groupsQuery,
    async (snapshot) => {
      callbacks.onSyncStatusChange('connected');
      let cloudGroups = snapshot.docs.map((d) => d.data() as WorshipGroup);

      // Migración automática si el usuario tenía grupos previos sin el índice `memberIds`
      if (options.currentUserId && cloudGroups.length === 0) {
        try {
          const fallbackSnap = await getDocs(
            query(collection(db, 'jesustone_groups'), limit(50))
          );
          const allFetched = fallbackSnap.docs.map(
            (d) => d.data() as WorshipGroup
          );
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

  // 2. Suscripción de Canciones filtrada por el grupo activo (`where('groupId', '==', activeGroupId)`)
  const songsQuery = options.activeGroupId
    ? query(
        collection(db, 'jesustone_songs'),
        where('groupId', '==', options.activeGroupId)
      )
    : query(collection(db, 'jesustone_songs'), limit(100));

  const unsubSongs = onSnapshot(
    songsQuery,
    (snapshot) => {
      if (!callbacks.onSongsSnapshot) return;
      const byGroup: Record<string, Song[]> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as Song & { groupId?: string };
        if (data && data.groupId && data.id) {
          if (!byGroup[data.groupId]) {
            byGroup[data.groupId] = [];
          }
          byGroup[data.groupId].push(data);
        }
      });
      callbacks.onSongsSnapshot(byGroup);
    },
    () => {
      // Optional auxiliary collection; ignore if restricted
    }
  );

  // 3. Suscripción de Mensajes de Chat en su propia colección independiente (`jesustone_messages`)
  let unsubMessages = () => {};
  if (options.activeGroupId && callbacks.onMessagesSnapshot) {
    const targetGroupId = options.activeGroupId;
    const maxMsgs = options.messageLimit || 120;
    const messagesQuery = query(
      collection(db, 'jesustone_messages'),
      where('groupId', '==', targetGroupId),
      limit(maxMsgs)
    );

    unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const msgs = snapshot.docs
          .map((d) => d.data() as ChatMessage)
          .sort((a, b) => {
            const timeA = a.createdAtMs || 0;
            const timeB = b.createdAtMs || 0;
            if (timeA !== timeB) return timeA - timeB;
            return a.id.localeCompare(b.id);
          });
        if (msgs.length > 0) {
          callbacks.onMessagesSnapshot?.(targetGroupId, msgs);
        }
      },
      () => {
        // Ignore if auxiliary collection is empty or restricted
      }
    );
  }

  // 4. Suscripción de Notificaciones con límite de las 100 más recientes
  const notifsQuery = query(
    collection(db, 'jesustone_notifications'),
    limit(100)
  );
  const unsubNotifs = onSnapshot(
    notifsQuery,
    (snapshot) => {
      callbacks.onSyncStatusChange('connected');
      const cloudNotifs = snapshot.docs
        .map((d) => d.data() as AppNotification)
        .sort((a, b) => b.id.localeCompare(a.id));
      if (cloudNotifs.length > 0) {
        callbacks.onNotificationsSnapshot(cloudNotifs);
      }
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

  return () => {
    unsubUsers();
    unsubGroups();
    unsubSongs();
    unsubMessages();
    unsubNotifs();
  };
}
