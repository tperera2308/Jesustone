import { deleteDoc, doc, getDoc, getDocFromServer, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Song } from '../types';

const IDB_NAME = 'jesustone_cloud_media_v1';
const IDB_STORE = 'song_images';
const IDB_VERSION = 1;
const MAX_CACHED_IMAGES = 150;

export interface CloudSongImageRecord {
  id: string; // songimg__{songId}
  docType: 'song_image';
  songId: string;
  groupId: string;
  imageDataUrl: string;
  updatedAt: number;
}

// Caché ultrarrápido en memoria para la sesión activa
const memoryImageCache = new Map<string, { imageDataUrl: string; updatedAt: number }>();

export function getCloudSongImageDocId(songId: string): string {
  return `songimg__${songId}`;
}

export function isValidImageString(url?: string | null): boolean {
  if (!url || !url.trim()) return false;
  if (url.startsWith('data:image/svg+xml')) return false;
  return url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://');
}

export function songHasCloudOrInlineImage(song?: Song | null): boolean {
  if (!song) return false;
  if (song.hasChordSheetImage) return true;
  return isValidImageString(song.chordSheetImageUrl);
}

export function getCachedSongImageSync(songId?: string | null): string | undefined {
  if (!songId) return undefined;
  return memoryImageCache.get(songId)?.imageDataUrl;
}

function openMediaIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE, { keyPath: 'songId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readImageFromIndexedDB(
  songId: string
): Promise<{ imageDataUrl: string; updatedAt: number } | null> {
  const database = await openMediaIndexedDB();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(songId);
      req.onsuccess = () => {
        const res = req.result as
          | { songId: string; imageDataUrl: string; updatedAt: number }
          | undefined;
        if (res && isValidImageString(res.imageDataUrl)) {
          resolve({ imageDataUrl: res.imageDataUrl, updatedAt: res.updatedAt || 0 });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeImageToIndexedDB(
  songId: string,
  imageDataUrl: string,
  updatedAt: number
): Promise<void> {
  const database = await openMediaIndexedDB();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({
        songId,
        imageDataUrl,
        updatedAt,
        cachedAt: Date.now(),
      });

      // Mantener un límite saludable en el caché del dispositivo (LRU simple)
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = (getAllReq.result || []) as {
          songId: string;
          cachedAt?: number;
        }[];
        if (all.length > MAX_CACHED_IMAGES) {
          all.sort((a, b) => (a.cachedAt || 0) - (b.cachedAt || 0));
          const toRemove = all.slice(0, all.length - MAX_CACHED_IMAGES);
          toRemove.forEach((item) => {
            store.delete(item.songId);
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function removeImageFromIndexedDB(songId: string): Promise<void> {
  const database = await openMediaIndexedDB();
  if (!database) return;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Guarda la imagen de una canción en un documento independiente en la nube
 * (`jesustone_groups/songimg__{songId}`) y actualiza el caché IndexedDB local.
 * Así el documento principal del grupo nunca acumula peso por imágenes y soporta
 * cientos de canciones con imagen en múltiples grupos.
 */
export async function saveSongImageToCloud(
  groupId: string,
  songId: string,
  imageDataUrl: string,
  customUpdatedAt?: number
): Promise<{ ok: boolean; updatedAt: number }> {
  const updatedAt = customUpdatedAt || Date.now();
  if (!songId || !isValidImageString(imageDataUrl)) {
    return { ok: false, updatedAt };
  }

  // 1. Guardar inmediatamente en memoria e IndexedDB del dispositivo
  memoryImageCache.set(songId, { imageDataUrl, updatedAt });
  await writeImageToIndexedDB(songId, imageDataUrl, updatedAt);

  // 2. Subir documento independiente a Firestore
  const docId = getCloudSongImageDocId(songId);
  const path = `jesustone_groups/${docId}`;
  const payload: CloudSongImageRecord = {
    id: docId,
    docType: 'song_image',
    songId,
    groupId,
    imageDataUrl,
    updatedAt,
  };

  try {
    await setDoc(doc(db, 'jesustone_groups', docId), payload);
    return { ok: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path, false);
    return { ok: false, updatedAt };
  }
}

/**
 * Descarga bajo demanda (streaming) la imagen de una canción al momento de abrirla.
 * Primero consulta memoria / IndexedDB del dispositivo; si no está o hay una versión
 * más nueva en la nube, la descarga desde Firestore y la guarda en caché.
 */
export async function fetchSongImageOnDemand(
  song: Song | null | undefined,
  forceCloudRefresh = false
): Promise<string | null> {
  if (!song || !song.id) return null;

  // Si la canción ya trae una URL válida en línea (por ejemplo, recién subida o migrando)
  if (!forceCloudRefresh && isValidImageString(song.chordSheetImageUrl)) {
    const inlineUrl = song.chordSheetImageUrl!;
    const ts = song.chordSheetImageUpdatedAt || Date.now();
    memoryImageCache.set(song.id, { imageDataUrl: inlineUrl, updatedAt: ts });
    writeImageToIndexedDB(song.id, inlineUrl, ts);
    return inlineUrl;
  }

  const expectedUpdatedAt = song.chordSheetImageUpdatedAt || 0;

  // 1. Revisar caché en memoria
  if (!forceCloudRefresh) {
    const mem = memoryImageCache.get(song.id);
    if (mem && isValidImageString(mem.imageDataUrl) && mem.updatedAt >= expectedUpdatedAt) {
      return mem.imageDataUrl;
    }

    // 2. Revisar caché en IndexedDB del dispositivo
    const idbCached = await readImageFromIndexedDB(song.id);
    if (
      idbCached &&
      isValidImageString(idbCached.imageDataUrl) &&
      idbCached.updatedAt >= expectedUpdatedAt
    ) {
      memoryImageCache.set(song.id, idbCached);
      return idbCached.imageDataUrl;
    }
  }

  // 3. Descargar bajo demanda desde el documento independiente en la nube
  const docId = getCloudSongImageDocId(song.id);
  const path = `jesustone_groups/${docId}`;
  try {
    const docRef = doc(db, 'jesustone_groups', docId);
    const snap = forceCloudRefresh
      ? await getDocFromServer(docRef)
      : await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as Partial<CloudSongImageRecord>;
      if (data && isValidImageString(data.imageDataUrl)) {
        const cloudUrl = data.imageDataUrl!;
        const cloudTs = data.updatedAt || expectedUpdatedAt || Date.now();
        memoryImageCache.set(song.id, { imageDataUrl: cloudUrl, updatedAt: cloudTs });
        await writeImageToIndexedDB(song.id, cloudUrl, cloudTs);
        return cloudUrl;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path, false);
  }

  return null;
}

/**
 * Elimina la imagen de la canción tanto de la nube (Firestore) como del caché IndexedDB
 * para no acumular datos basura cuando se borra una canción o se quita su imagen.
 */
export async function deleteSongImageFromCloud(songId: string): Promise<void> {
  if (!songId) return;
  memoryImageCache.delete(songId);
  await removeImageFromIndexedDB(songId);

  const docId = getCloudSongImageDocId(songId);
  const path = `jesustone_groups/${docId}`;
  try {
    await deleteDoc(doc(db, 'jesustone_groups', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}
