import { deleteMediaFromStorage } from '../firebase';
import { Song } from '../types';
import { deleteSongImageFromCloud } from './songImageCloudStore';

export interface StorageCleanupStats {
  keysRemoved: number;
  bytesFreed: number;
  prunedDeletedIdsCount: number;
  timestamp: string;
}

/**
 * Lista de prefijos y claves obsoletas o pesadas que no deben ocupar localStorage,
 * ya que la app funciona en streaming sincronizado con la nube + IndexedDB para imágenes bajo demanda.
 */
const LEGACY_STORAGE_PATTERNS = [
  /^jesustone_users_v[123]$/,
  /^jesustone_groups_v[1234]$/,
  /^jesustone_notifications_v4$/,
  /^jesustone_friend_requests_v4$/,
  /^jesustone_direct_messages_v4$/,
  /^jesustone_temp_/,
  /^jesustone_draft_/,
  /^jesustone_audio_/,
  /^jesustone_backup_/,
  /^jstn_old_/,
];

/**
 * Ejecuta una limpieza automática integral en el localStorage:
 * 1. Elimina copias locales pesadas (grupos, canciones, imágenes base64) de localStorage
 *    para que todo opere en streaming desde la nube sin límites de almacenamiento.
 * 2. Recorta las listas de IDs borrados a un máximo de 40.
 */
export function runAutomaticStorageCleanup(): StorageCleanupStats {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      keysRemoved: 0,
      bytesFreed: 0,
      prunedDeletedIdsCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  let keysRemoved = 0;
  let bytesFreed = 0;
  let prunedDeletedIdsCount = 0;

  try {
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) allKeys.push(k);
    }

    // 1. Eliminar claves pesadas u obsoletas de localStorage
    for (const key of allKeys) {
      const isLegacy = LEGACY_STORAGE_PATTERNS.some((pattern) =>
        pattern.test(key)
      );
      if (isLegacy) {
        const val = localStorage.getItem(key) || '';
        bytesFreed += key.length + val.length;
        localStorage.removeItem(key);
        keysRemoved++;
      }
    }

    // 2. Podar arrays de IDs borrados
    const trackingKeys = [
      'jesustone_deleted_songs_v4',
      'jesustone_deleted_events_v4',
      'jesustone_deleted_msgs_v4',
    ];

    for (const tKey of trackingKeys) {
      try {
        const raw = localStorage.getItem(tKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 40) {
            const beforeLen = parsed.length;
            const trimmed = parsed.slice(-40);
            const savedStr = JSON.stringify(trimmed);
            bytesFreed += raw.length - savedStr.length;
            localStorage.setItem(tKey, savedStr);
            prunedDeletedIdsCount += beforeLen - trimmed.length;
          }
        }
      } catch {
        // ignore parse error
      }
    }
  } catch (err) {
    console.warn('Advertencia en limpieza automática de storage:', err);
  }

  return {
    keysRemoved,
    bytesFreed,
    prunedDeletedIdsCount,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Limpieza en la nube al borrar canciones o reemplazar imágenes:
 * Elimina automáticamente el documento de imagen bajo demanda en Firestore, el caché IndexedDB y Storage.
 */
export async function cleanDeletedSongCloudAssets(
  deletedSong: Song
): Promise<void> {
  if (deletedSong.id) {
    await deleteSongImageFromCloud(deletedSong.id);
  }
  if (deletedSong.chordSheetImageUrl) {
    await deleteMediaFromStorage(deletedSong.chordSheetImageUrl);
  }
}
