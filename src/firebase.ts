import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { AppNotification, AppUser, WorshipGroup } from './types';

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
    // Even if permission-denied on /test/connection, the server was reached
    return true;
  }
}

function stripUndefinedDeep<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export async function syncUserToFirestore(user: AppUser): Promise<void> {
  const path = `jesustone_users/${user.id}`;
  try {
    await setDoc(doc(db, 'jesustone_users', user.id), stripUndefinedDeep(user));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
}

export async function syncGroupToFirestore(group: WorshipGroup): Promise<void> {
  const path = `jesustone_groups/${group.id}`;
  try {
    await setDoc(
      doc(db, 'jesustone_groups', group.id),
      stripUndefinedDeep(group)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
  }
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

export function subscribeToJesustoneCloud(callbacks: {
  onUsersSnapshot: (users: AppUser[]) => void;
  onGroupsSnapshot: (groups: WorshipGroup[]) => void;
  onNotificationsSnapshot: (notifs: AppNotification[]) => void;
  onSyncStatusChange: (status: 'connected' | 'local_only') => void;
}): () => void {
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

  const unsubGroups = onSnapshot(
    collection(db, 'jesustone_groups'),
    (snapshot) => {
      callbacks.onSyncStatusChange('connected');
      const cloudGroups = snapshot.docs.map((d) => d.data() as WorshipGroup);
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

  const unsubNotifs = onSnapshot(
    collection(db, 'jesustone_notifications'),
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
    unsubNotifs();
  };
}
