import { deleteMediaFromStorage } from '../firebase';
import { Song, WorshipGroup } from '../types';

export interface StorageCleanupStats {
  keysRemoved: number;
  bytesFreed: number;
  prunedDeletedIdsCount: number;
  timestamp: string;
}

/**
 * Lista de prefijos y claves obsoletas de versiones anteriores de JesusTone
 * que pueden haber quedado en el localStorage del usuario.
 */
const LEGACY_STORAGE_PATTERNS = [
  /^jesustone_users_v[123]$/,
  /^jesustone_groups_v[123]$/,
  /^jesustone_temp_/,
  /^jesustone_draft_/,
  /^jesustone_audio_/,
  /^jesustone_backup_/,
  /^jstn_old_/,
];

/**
 * Ejecuta una limpieza automática integral en el localStorage:
 * 1. Elimina claves de versiones viejas o fragmentos temporales.
 * 2. Recorta las listas de IDs borrados a un máximo de 40 para evitar crecimiento indefinido.
 * 3. Compacta grupos locales eliminando SVG temporales o imágenes base64 huérfanas > 200KB.
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

    // 1. Eliminar claves obsoletas
    for (const key of allKeys) {
      const isLegacy = LEGACY_STORAGE_PATTERNS.some((pattern) => pattern.test(key));
      if (isLegacy) {
        const val = localStorage.getItem(key) || '';
        bytesFreed += key.length + val.length;
        localStorage.removeItem(key);
        keysRemoved++;
      }
    }

    // 2. Podar arrays de IDs borrados para que no acumulen miles de IDs a lo largo de los meses
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

    // 3. Limpieza de grupos locales: remover notas de voz de canciones y SVGs sobredimensionados
    try {
      const groupsRaw = localStorage.getItem('jesustone_groups_v4');
      if (groupsRaw) {
        const groups = JSON.parse(groupsRaw);
        if (Array.isArray(groups)) {
          let modified = false;
          const cleanedGroups = groups.map((g: WorshipGroup) => {
            const cleanedSongs = (g.songs || []).map((s: Song) => {
              // Eliminar voiceNotes de canciones
              const hasVoice = (s as unknown as { voiceNotes?: unknown[] }).voiceNotes && (s as unknown as { voiceNotes?: unknown[] }).voiceNotes!.length > 0;
              // Si la imagen es un SVG autogenerado innecesario
              const isAutoSvg = s.chordSheetImageUrl && s.chordSheetImageUrl.startsWith('data:image/svg+xml;utf8,');
              if (hasVoice || isAutoSvg) {
                modified = true;
                const nextS = { ...s };
                delete (nextS as unknown as { voiceNotes?: unknown }).voiceNotes;
                if (isAutoSvg) nextS.chordSheetImageUrl = undefined;
                return nextS;
              }
              return s;
            });
            return {
              ...g,
              songs: cleanedSongs,
            };
          });

          if (modified) {
            const newRaw = JSON.stringify(cleanedGroups);
            bytesFreed += Math.max(0, groupsRaw.length - newRaw.length);
            localStorage.setItem('jesustone_groups_v4', newRaw);
          }
        }
      }
    } catch {
      // ignore
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
 * Elimina automáticamente el archivo huérfano en Firebase Storage
 */
export async function cleanDeletedSongCloudAssets(
  deletedSong: Song
): Promise<void> {
  if (deletedSong.chordSheetImageUrl) {
    await deleteMediaFromStorage(deletedSong.chordSheetImageUrl);
  }
}
