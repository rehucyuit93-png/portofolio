import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const BOOTSTRAP_ADMIN_EMAIL = 'rehu.cyuit93@gmail.com';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export interface FirestoreConnectionStatus {
  ok: boolean;
  reason?: 'offline' | 'quota' | 'not-found' | 'unknown';
  message?: string;
  upgradeUrl?: string;
}

export function getQuotaUpgradeUrl(): string {
  return `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
}

export async function testFirestoreConnection(): Promise<FirestoreConnectionStatus> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true };
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code || '';

    if (
      rawMsg.includes("Free daily read units per project") ||
      rawMsg.includes('Quota exceeded') ||
      code === 'resource-exhausted'
    ) {
      console.error('Firestore quota exceeded:', rawMsg);
      return {
        ok: false,
        reason: 'quota',
        message:
          'Kuota harian gratis Firestore telah terlampaui. Kuota akan direset keesokan hari atau Anda dapat meningkatkan paket Firebase.',
        upgradeUrl: getQuotaUpgradeUrl(),
      };
    }

    if (rawMsg.includes('the client is offline') || code === 'unavailable') {
      console.error('Please check your Firebase configuration (client is offline):', rawMsg);
      return {
        ok: false,
        reason: 'offline',
        message:
          'Tidak dapat terhubung ke server Firestore (offline atau koneksi terblokir). Periksa koneksi internet Anda.',
      };
    }

    if (code === 'not-found' || rawMsg.includes('does not exist')) {
      console.error('Firestore database not found:', rawMsg);
      return {
        ok: false,
        reason: 'not-found',
        message: `Database Firestore (${firebaseConfig.firestoreDatabaseId}) belum ditemukan pada proyek ${firebaseConfig.projectId}.`,
      };
    }

    // Permission denied from default-deny proves server connection succeeded.
    if (
      code === 'permission-denied' ||
      rawMsg.includes('Missing or insufficient permissions') ||
      rawMsg.includes('PERMISSION_DENIED')
    ) {
      return { ok: true };
    }

    console.warn('Firestore connection check warning:', rawMsg);
    return { ok: true };
  }
}

export { firebaseConfig };
